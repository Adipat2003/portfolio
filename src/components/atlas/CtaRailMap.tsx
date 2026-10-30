"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import rawNetwork from "../../../content/cta-network.json";
import { stations as portfolioStations } from "@/content/load";
import { positionOnRoute, projectCoordinate, type RailNetwork, type RailStation, type RailRoute, type Point } from "@/content/cta-geometry";
import CtaLive from "./CtaLive";
import { TransitDisruptions, TransitGuide } from "./TransitPanel";

const network = rawNetwork as unknown as RailNetwork;
const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";
const routeColors: Record<string, string> = { red: "#f25b70", blue: "#36b9ee", brn: "#bd9271", g: "#48c17b", org: "#ff814d", p: "#b49be4", pink: "#ed9fc5", y: "#f9e300" };
type Train = { id: string; route: string; lat: number; lon: number; heading: number; destination: string; nextStation: string; nextStationId: string; isDelayed: boolean; isScheduled?: boolean };
type Feed = { kind: "loading" | "live" | "empty" | "offline"; trains: Train[]; asOf: string };
const initialFeed: Feed = { kind: SERVICE_URL ? "loading" : "offline", trains: [], asOf: "" };

/** Keep the live network feed independent of station and camera changes. */
function useCtaNetwork() {
	const [feed, setFeed] = useState(initialFeed);
	useEffect(() => {
		if (!SERVICE_URL) return;
		const controller = new AbortController();
		let timer = 0;
		async function poll() {
			if (document.hidden) { timer = window.setTimeout(poll, 15_000); return; }
			const get = async (path: string) => {
				const response = await fetch(`${SERVICE_URL}/${path}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
				if (!response.ok) throw new Error("Feed unavailable");
				return response.json();
			};
			const data = await get("positions").catch(() => null);
			if (controller.signal.aborted) return;
			const age = Date.now() - Date.parse(data?.as_of ?? "");
			const fresh = data?.available === true && Number.isFinite(age) && age >= -5_000 && age < 90_000;
			const trains = fresh && Array.isArray(data.trains) ? data.trains.filter((train: Train) =>
				train.isScheduled !== true && typeof train.id === "string" && typeof train.route === "string" && Number.isFinite(train.lat) && Number.isFinite(train.lon)) : [];
			setFeed({ kind: !fresh ? "offline" : trains.length ? "live" : "empty", trains, asOf: fresh ? data.as_of : "" });
			timer = window.setTimeout(poll, 15_000);
		}
		poll();
		return () => { controller.abort(); window.clearTimeout(timer); };
	}, []);
	return feed;
}

type Box = [number, number, number, number];
const paths = new Map(network.routes.map((route) => [route.id, route.shapes.map((shape) => `M${shape.points.map((p) => p.join(",")).join("L")}`).join(" ")]));
const termini = new Set(network.routes.flatMap((route) => route.shapes.flatMap((shape) => [shape.points[0], shape.points.at(-1)!])).flatMap((point) => {
	const nearest = [...network.stations].sort((a, b) => Math.hypot(a.point[0] - point[0], a.point[1] - point[1]) - Math.hypot(b.point[0] - point[0], b.point[1] - point[1]))[0];
	return nearest ? [nearest.id] : [];
}));
function fitBox(points: number[][]): Box {
	const x = Math.min(...points.map((p) => p[0])), y = Math.min(...points.map((p) => p[1]));
	const width = Math.max(70, Math.max(...points.map((p) => p[0])) - x), height = Math.max(90, Math.max(...points.map((p) => p[1])) - y);
	return [x - 18, y - 18, width + 36, height + 36];
}

function TrainMarker({ train, point, route, size }: { train: Train; point: Point; route: RailRoute; size: number }) {
	const ref = useRef<SVGGElement>(null);
	const previous = useRef<Point>(point);
	useEffect(() => {
		const from = previous.current;
		const start = performance.now();
		let frame = 0;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
		const move = (now: number) => {
			// Large fixes snap instead of tracing a speculative trip between branches.
			const t = reduce.matches || Math.hypot(point[0] - from[0], point[1] - from[1]) > 15 ? 1 : Math.min(1, (now - start) / 900);
			const next = positionOnRoute([from[0] + (point[0] - from[0]) * t, from[1] + (point[1] - from[1]) * t], route) ?? point;
			previous.current = next;
			ref.current?.setAttribute("transform", `translate(${next[0]} ${next[1]})`);
			if (t < 1) frame = requestAnimationFrame(move);
		};
		frame = requestAnimationFrame(move);
		return () => cancelAnimationFrame(frame);
	}, [point[0], point[1], route]);
	return <g ref={ref} className="rail-live-train" data-train={train.id} transform={`translate(${previous.current[0]} ${previous.current[1]})`}>
		<title>{route.name}: {train.destination}, next {train.nextStation}{train.isDelayed ? ", delay flagged" : ""}</title>
		<g className="rail-train-sprite" transform={`scale(${size})`}>
			<rect className="sprite-shadow" x="-11" y="-3" width="22" height="11" rx="4" />
			<rect className="sprite-car" x="-10" y="-5" width="20" height="10" rx="3" />
			<path className="sprite-roof" d="M-7-5h14" stroke={routeColors[train.route]} />
			<rect className="sprite-window" x="-7" y="-2.5" width="4" height="3" rx=".6" /><rect className="sprite-window" x="-1.5" y="-2.5" width="4" height="3" rx=".6" /><rect className="sprite-window" x="4" y="-2.5" width="4" height="3" rx=".6" />
			<path className="sprite-track" d="M-6 5v1m12-1v1" />
			<circle className="sprite-lamp" cx="-8" cy="2.5" r="1" /><circle className="sprite-lamp" cx="8" cy="2.5" r="1" />
		</g>
	</g>;
}

export default function CtaRailMap() {
	const id = useId();
	const feed = useCtaNetwork();
	const [routeId, setRouteId] = useState("all");
	const [selectedId, setSelectedId] = useState("");
	const [query, setQuery] = useState("");
	const [sheet, setSheet] = useState<"station" | "alerts" | "guide" | "info" | null>(null);
	const sheetRef = useRef<HTMLHeadingElement>(null);
	const returnFocus = useRef<Element | null>(null);
	function openSheet(next: "station" | "alerts" | "guide" | "info") { returnFocus.current = document.activeElement; setSheet(next); }
	function closeSheet() {
		setSheet(null);
		requestAnimationFrame(() => {
			const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector(".rail-search-control input");
			(target as HTMLElement | SVGElement | null)?.focus({ preventScroll: true });
		});
	}
	useEffect(() => { if (sheet) sheetRef.current?.focus({ preventScroll: true }); }, [sheet, selectedId]);
	const [box, setBox] = useState<Box>(network.viewBox);
	const [mapReady, setMapReady] = useState(false);
	const [canvas, setCanvas] = useState({ width: 700, height: 600 });
	const svgRef = useRef<SVGSVGElement>(null);
	const currentBox = useRef<Box>(network.viewBox);
	useEffect(() => {
		const update = () => { const top = svgRef.current?.closest(".rail-network")?.getBoundingClientRect().top; setMapReady(top !== undefined && Math.abs(top) <= 2); };
		window.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		update();
		return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
	}, []);
	const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);
	const station = network.stations.find((entry) => entry.id === selectedId) ?? network.stations.find((entry) => entry.id === "40380")!;
	const route = network.routes.find((entry) => entry.id === routeId);
	const availableStations = network.stations.filter((entry) => routeId === "all" || entry.routes.includes(routeId));
	const matches = availableStations.filter((entry) => entry.name.toLowerCase().includes(query.trim().toLowerCase()));
	const connections = portfolioStations.filter((entry) => entry.station.ctaStation === selectedId);
	const trains = useMemo(() => feed.trains.flatMap((train) => {
		const line = network.routes.find((entry) => entry.id === train.route);
		if (!line || (routeId !== "all" && routeId !== train.route)) return [];
		const point = positionOnRoute(projectCoordinate(train.lat, train.lon, network.projection), line);
		return point ? [{ ...train, point }] : [];
	}), [feed.trains, routeId]);

	const units = Math.max(box[2] / canvas.width, box[3] / canvas.height);
	const visibleTrains = useMemo(() => {
		const visible: typeof trains = [];
		for (const train of trains) {
			if (train.point[0] < box[0] || train.point[0] > box[0] + box[2] || train.point[1] < box[1] || train.point[1] > box[1] + box[3]) continue;
			if (selectedId && Math.hypot(train.point[0] - station.point[0], train.point[1] - station.point[1]) < units * 22) continue;
			if (visible.every((other) => Math.hypot(other.point[0] - train.point[0], other.point[1] - train.point[1]) >= units * 36)) visible.push(train);
		}
		return visible;
	}, [trains, box, units, station, selectedId]);
	// Keep labels and sprites apart in screen pixels at every zoom level.
	const labels = useMemo(() => {
		const font = units * 12;
		const placed = visibleTrains.map((train) => ({ x: train.point[0] - units * 11, y: train.point[1] - units * 11, w: units * 22, h: units * 22 }));
		// Visible station dots also need clear space around their labels.
		for (const entry of availableStations) {
			if (routeId === "all" && box[2] >= 180 && entry.id !== selectedId && entry.routes.length === 1 && !termini.has(entry.id)) continue;
			placed.push({ x: entry.point[0] - units * 6, y: entry.point[1] - units * 6, w: units * 12, h: units * 12 });
		}
		const result = new Map<string, { x: number; y: number; anchor: "start" | "end" }>();
		const candidates = [...availableStations].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || Number(termini.has(b.id)) - Number(termini.has(a.id)));
		for (const entry of candidates) {
			if (entry.id !== selectedId) continue;
			const [x, y] = entry.point;
			const width = entry.name.replace(/ \(.*\)$/, "").length * font * .62;
			for (const side of [1, -1]) {
				const left = side === 1 ? x + units * 15 : x - units * 15 - width;
				const area = { x: left, y: y - font * 1.6, w: width + units * 4, h: font * 1.8 };
				if (left < box[0] + units * 8 || left + width > box[0] + box[2] - units * 8 || y < box[1] + units * 20 || y > box[1] + box[3] - units * 20) continue;
				if (placed.some((p) => area.x < p.x + p.w && area.x + area.w > p.x && area.y < p.y + p.h && area.y + area.h > p.y)) continue;
				result.set(entry.id, { x: side === 1 ? x + units * 15 : x - units * 15, y: y - font * .35, anchor: side === 1 ? "start" : "end" });
				placed.push(area);
				break;
			}
		}
		return result;
	}, [availableStations, selectedId, routeId, box, units, visibleTrains]);
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const header = document.querySelector(".concept-bar");
		const update = () => {
			setCanvas({ width: svg.clientWidth, height: svg.clientHeight });
			(svg.closest(".rail-network") as HTMLElement)?.style.setProperty("--bar-h", `${header?.getBoundingClientRect().height ?? 64}px`);
		};
		const observer = new ResizeObserver(update);
		observer.observe(svg);
		if (header) observer.observe(header);
		update();
		return () => observer.disconnect();
	}, []);

	useEffect(() => { currentBox.current = box; }, [box]);

	function selectStation(entry: RailStation, focus = true) {
		setSelectedId(entry.id);
		openSheet("station");
		if (routeId !== "all" && !entry.routes.includes(routeId)) setRouteId("all");
		if (focus) setBox([entry.point[0] - 58, entry.point[1] - (window.matchMedia("(max-width:760px)").matches ? 42 : 70), 116, 140]);
	}
	function selectRoute(value: string) {
		setRouteId(value);
		setQuery("");
		const next = network.routes.find((entry) => entry.id === value);
		setBox(next ? fitBox(next.shapes.flatMap((shape) => shape.points)) : network.viewBox);
		if (next && selectedId && !station.routes.includes(value)) { setSelectedId(""); if (sheet === "station") setSheet(null); }
	}
	function zoom(factor: number) {
		const [x, y, w, h] = currentBox.current;
		const width = Math.max(35, Math.min(network.viewBox[2] * 1.2, w * factor));
		const height = h * width / w;
		setBox([x + (w - width) / 2, y + (h - height) / 2, width, height]);
	}
	function pan(event: PointerEvent<SVGSVGElement>) {
		if (!drag.current) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const scale = Math.max(drag.current.box[2] / bounds.width, drag.current.box[3] / bounds.height);
		const dx = (event.clientX - drag.current.x) * scale, dy = (event.clientY - drag.current.y) * scale;
		if (Math.abs(dx) + Math.abs(dy) > 1) drag.current.moved = true;
		const [x, y, w, h] = drag.current.box;
		setBox([Math.max(network.viewBox[0] - w / 2, Math.min(network.viewBox[0] + network.viewBox[2] - w / 2, x - dx)),
			Math.max(network.viewBox[1] - h / 2, Math.min(network.viewBox[1] + network.viewBox[3] - h / 2, y - dy)), w, h]);
	}
	const statusText = feed.kind === "live" ? `${feed.trains.length} trains reporting` : feed.kind === "loading" ? "Connecting to CTA" : feed.kind === "empty" ? "No trains reported" : "Live feed unavailable";
	return (
		<section className="rail-network" id="cta-network" data-ready={mapReady} aria-labelledby={`${id}-title`} onKeyDown={(event) => { if (event.key === "Escape" && sheet) { event.preventDefault(); closeSheet(); } }}>
			<div className="rail-map-pane">
						<svg ref={svgRef} className={`rail-map-svg${routeId === "all" && box[2] >= 180 ? " rail-overview" : " rail-map-detail"}`} viewBox={box.join(" ")} role="group" aria-label="Geographic CTA rail network" onPointerDown={(event) => {
							if (!mapReady || !event.isPrimary || event.button !== 0 || (event.target as Element).closest('[role="button"]')) return;
							drag.current = { x: event.clientX, y: event.clientY, box: [...currentBox.current], moved: false };
							event.currentTarget.setPointerCapture(event.pointerId);
						}} onPointerMove={pan} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
							<title>Chicago Transit Authority rail network, eight lines and {network.stations.length} stations</title>
							<desc>Geographic routes from CTA GTFS. Select a station using the map or search. Train symbols are reported live positions, snapped to their route within 500 metres.</desc>
							{/* Illustrative lake edge, not a surveyed shoreline. */}
							<g className="rail-geography" aria-hidden="true"><path d="M80 -1000 L1000 -1000 L1000 1000 L110 1000 L110 240 L100 180 L81 125 L68 75 L65 22 L57 -16 L45 -50 L44 -100 L49 -143 L55 -170 Z" /></g>
							<g fill="none" strokeLinecap="round" strokeLinejoin="round" className="rail-paths">
								{network.routes.map((line) => <path key={line.id} data-route={line.id} className={routeId === "all" || routeId === line.id ? "" : "rail-muted"} d={paths.get(line.id)} stroke={routeColors[line.id]} strokeWidth={units * (routeId === line.id ? 3 : 2)} />)}
							</g>
							<g className="rail-stations">
								{availableStations.map((entry) => {
									const selected = selectedId === entry.id;
									const label = labels.get(entry.id);
									return <g key={entry.id} role="button" tabIndex={selected || (!selectedId && entry.id === availableStations[0]?.id) ? 0 : -1} aria-label={`${entry.name} CTA station`} aria-pressed={selected} data-station={entry.id} className={`rail-station${selected ? " rail-selected" : ""}${entry.routes.length === 1 && !termini.has(entry.id) ? " rail-minor" : ""}`} onClick={() => selectStation(entry)} onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectStation(entry); }
										if (event.key === "Escape") setBox(network.viewBox);
									}}>
										<circle className="rail-station-hit" cx={entry.point[0]} cy={entry.point[1]} r={units * 9} />
										<circle className="rail-stop-dot" cx={entry.point[0]} cy={entry.point[1]} r={units * (selected ? 5 : entry.routes.length > 1 || entry.transfers.length ? 3 : 2)} />
										{label ? <text x={label.x} y={label.y} textAnchor={label.anchor} vectorEffect="non-scaling-stroke" style={{ fontSize: units * 12 }} className={selected ? "rail-selected-label" : "rail-station-label"}>{entry.name.replace(/ \(.*\)$/, "")}</text> : null}
									</g>;
								})}
							</g>
							<g className="rail-live-trains" aria-label="Live train positions">
								{visibleTrains.map((train) => <TrainMarker key={train.id} train={train} point={train.point} size={units} route={network.routes.find((line) => line.id === train.route)!} />)}
							</g>
						</svg>
			</div>
			<div className="rail-topbar">
				<a className="rail-back" href="#view-atlas" aria-label="Back to the scenic route ↑">←</a>
				<h2 id={`${id}-title`}>Chicago ‘L’</h2>
				<div className="rail-control-bar">
					<label className="rail-line-picker"><span className="sr-only">Line</span><i className="rail-line-swatch" aria-hidden="true" style={{ background: route ? routeColors[route.id] : undefined }} /><select aria-label="Choose a CTA line" value={routeId} onChange={(event) => selectRoute(event.target.value)}><option value="all">All lines</option>{network.routes.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
					<div className="rail-search-control" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setQuery(""); event.currentTarget.querySelector("input")?.focus(); } }}>
						<svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg><label htmlFor={`${id}-search`} className="sr-only">Search CTA stations</label>
						<input id={`${id}-search`} type="search" placeholder="Find a station" value={query} onChange={(event) => setQuery(event.target.value)} />
						{query.trim() ? <div className="rail-search-results" role="group" aria-label="Matching stations">{matches.slice(0, 6).map((entry) => <button key={entry.id} type="button" onClick={() => { selectStation(entry); setQuery(""); }}>{entry.name}<span>↗</span></button>)}{matches.length === 0 ? <p>No stations found.</p> : null}</div> : null}
					</div>
				</div>
				<div className="rail-top-actions"><button type="button" aria-expanded={sheet === "alerts"} onClick={() => openSheet("alerts")}>Alerts</button><button type="button" className="rail-ask-button" aria-expanded={sheet === "guide"} onClick={() => openSheet("guide")}>Ask CTA</button></div>
			</div>
			<div className="rail-map-tools" role="group" aria-label="Map view"><div className="rail-view-switch"><button type="button" aria-pressed={network.viewBox.every((value, index) => box[index] === value)} onClick={() => setBox(network.viewBox)}>Network</button><button type="button" aria-pressed={[37, -4, 66, 79].every((value, index) => box[index] === value)} onClick={() => setBox([37, -4, 66, 79])}>Loop</button></div><div className="rail-zoom"><button type="button" aria-label="Zoom out" onClick={() => zoom(1.5)}>−</button><button type="button" aria-label="Zoom in" onClick={() => zoom(.65)}>+</button></div></div>
			<div className="rail-map-credit"><span className="rail-feed-status" role="status" data-state={feed.kind}><span className="rail-status-dot" />{statusText}</span><button type="button" aria-label="Map information and data sources" onClick={() => openSheet("info")}>CTA · Info</button></div>
			{sheet ? <aside className={`rail-sheet${sheet === "guide" ? " rail-guide-sheet" : ""}`} aria-labelledby={`${id}-panel-title`}>
				<div className="rail-sheet-heading"><h3 id={`${id}-panel-title`} ref={sheetRef} tabIndex={-1}>{sheet === "station" ? station.name : sheet === "alerts" ? "Service alerts" : sheet === "guide" ? "Ask the transit guide" : "About this map"}</h3><button type="button" aria-label="Close map details" onClick={closeSheet}>×</button></div>
				{sheet === "station" ? <div className="rail-station-panel">
					<div className="rail-selected-station"><h3 className="sr-only">{station.name}</h3><div className="rail-station-lines">{station.routes.map((rid) => <span key={rid}><i aria-hidden="true" style={{ background: routeColors[rid] }} />{network.routes.find((entry) => entry.id === rid)!.name}</span>)}</div></div>
					{SERVICE_URL ? <CtaLive stationId={selectedId} showStations={false} /> : <p>Live arrivals are unavailable.</p>}
					{connections.length ? <details className="rail-projects"><summary>Portfolio connections</summary>{connections.map(({ slug, project }) => <a href={`/portfolio/projects/${slug}/`} key={slug}>{project.title} ↗</a>)}</details> : null}
					<button type="button" className="rail-station-ask" onClick={() => openSheet("guide")}>Ask about this station ↗</button>
				</div> : sheet === "alerts" ? <TransitDisruptions /> : sheet === "guide" ? <TransitGuide station={selectedId || undefined} /> : <div className="rail-map-info">
					<p>All eight lines and {network.stations.length} stations. Select a station for arrivals. Drag to explore; use the controls to zoom.</p>
					<div className="rail-legend">{network.routes.map((line) => <span key={line.id}><i style={{ background: routeColors[line.id] }} />{line.name}</span>)}</div>
					<p>{visibleTrains.length} train symbols shown at this zoom. Symbols are spaced for clarity; they use reported coordinates, not invented positions.</p>
					<details className="rail-train-list"><summary>{trains.length} trains reporting</summary><ul>{trains.map((train) => <li key={train.id}>{network.routes.find((line) => line.id === train.route)!.name} · {train.destination}<span>Next: {train.nextStation}{train.isDelayed ? " · Delay flagged" : ""}</span></li>)}</ul></details>
					<p>CTA Train Tracker data. Geographic network: <a href={network.metadata.source}>CTA GTFS ↗</a>. No CTA endorsement. Predictions and conditions can change.</p><p><a href="https://www.transitchicago.com/alerts/">Official CTA service information ↗</a></p>
				</div>}
			</aside> : null}
		</section>
	);
}
