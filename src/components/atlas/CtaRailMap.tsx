"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type PointerEvent } from "react";
import rawNetwork from "../../../content/cta-network.json";
import { stations as portfolioStations } from "@/content/load";
import { positionOnRoute, projectCoordinate, type RailNetwork, type RailStation, type RailRoute, type Point } from "@/content/cta-geometry";
import CtaLive from "./CtaLive";

const network = rawNetwork as unknown as RailNetwork;
const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";
const routeColors: Record<string, string> = { red: "#f25b70", blue: "#36b9ee", brn: "#bd9271", g: "#48c17b", org: "#ff814d", p: "#b49be4", pink: "#ed9fc5", y: "#f9e300" };
type Train = { id: string; route: string; lat: number; lon: number; heading: number; destination: string; nextStation: string; nextStationId: string; isDelayed: boolean; isScheduled?: boolean };
type Feed = { kind: "loading" | "live" | "empty" | "offline"; trains: Train[]; asOf: string; statuses: { route: string; status: string }[]; alertsAvailable: boolean };
const initialFeed: Feed = { kind: SERVICE_URL ? "loading" : "offline", trains: [], asOf: "", statuses: [], alertsAvailable: false };
const FeedContext = createContext<Feed>(initialFeed);

/** Both map placements share one polling loop and one response. */
export function CtaNetworkProvider({ children }: { children: ReactNode }) {
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
			const [positions, alerts] = await Promise.allSettled([get("positions"), get("transit-alerts")]);
			if (controller.signal.aborted) return;
			const data = positions.status === "fulfilled" ? positions.value : null;
			const status = alerts.status === "fulfilled" ? alerts.value : null;
			const age = Date.now() - Date.parse(data?.as_of ?? "");
			const fresh = data?.available === true && Number.isFinite(age) && age >= -5_000 && age < 90_000;
			const trains = fresh && Array.isArray(data.trains) ? data.trains.filter((train: Train) =>
				train.isScheduled !== true && typeof train.id === "string" && typeof train.route === "string" && Number.isFinite(train.lat) && Number.isFinite(train.lon)) : [];
			setFeed({ kind: !fresh ? "offline" : trains.length ? "live" : "empty", trains, asOf: fresh ? data.as_of : "",
				statuses: status?.available === true && Array.isArray(status.routes) ? status.routes : [], alertsAvailable: status?.available === true });
			timer = window.setTimeout(poll, 15_000);
		}
		poll();
		return () => { controller.abort(); window.clearTimeout(timer); };
	}, []);
	return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
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

function TrainMarker({ train, point, route }: { train: Train; point: Point; route: RailRoute }) {
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
		<circle r="3.1" fill={routeColors[train.route]} /><path d="M-1.3 -1.2h2.6v1.6h-2.6zM-.9 1.4h1.8" />
	</g>;
}

export default function CtaRailMap({ placement }: { placement: "start" | "end" }) {
	const id = useId();
	const Heading = placement === "start" ? "h1" : "h2";
	const feed = useContext(FeedContext);
	const [routeId, setRouteId] = useState("all");
	const [selectedId, setSelectedId] = useState("40380");
	const [query, setQuery] = useState("");
	const [box, setBox] = useState<Box>(network.viewBox);
	const svgRef = useRef<SVGSVGElement>(null);
	const currentBox = useRef<Box>(network.viewBox);
	const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);
	const station = network.stations.find((entry) => entry.id === selectedId)!;
	const route = network.routes.find((entry) => entry.id === routeId);
	const availableStations = network.stations.filter((entry) => routeId === "all" || entry.routes.includes(routeId));
	const matches = availableStations.filter((entry) => entry.name.toLowerCase().includes(query.trim().toLowerCase()));
	// Keep labels apart while the station selector retains the complete list.
	const labels = useMemo(() => {
		const placed: { x: number; y: number; w: number; h: number }[] = [];
		const result = new Map<string, { x: number; y: number; anchor: "start" | "end" }>();
		const font = box[3] / 55;
		const candidates = [...availableStations].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || Number(termini.has(b.id)) - Number(termini.has(a.id)));
		for (const entry of candidates) {
			if (entry.id !== selectedId && !termini.has(entry.id) && !(box[2] < 160)) continue;
			const [x, y] = entry.point;
			const width = entry.name.replace(/ \(.*\)$/, "").length * font * .53;
			for (const side of [1, -1]) {
				const left = side === 1 ? x + 4 : x - 4 - width;
				const area = { x: left, y: y - font * 1.5, w: width + 3, h: font * 1.6 };
				if (left < box[0] + 2 || left + width > box[0] + box[2] - 2 || y < box[1] || y > box[1] + box[3]) continue;
				if (placed.some((p) => area.x < p.x + p.w && area.x + area.w > p.x && area.y < p.y + p.h && area.y + area.h > p.y)) continue;
				result.set(entry.id, { x: side === 1 ? x + 4 : x - 4, y: y - font * .35, anchor: side === 1 ? "start" : "end" });
				placed.push(area);
				break;
			}
		}
		return result;
	}, [routeId, selectedId, box]);
	const connections = portfolioStations.filter((entry) => entry.station.ctaStation === selectedId);
	const trains = useMemo(() => feed.trains.flatMap((train) => {
		const line = network.routes.find((entry) => entry.id === train.route);
		if (!line || (routeId !== "all" && routeId !== train.route)) return [];
		const point = positionOnRoute(projectCoordinate(train.lat, train.lon, network.projection), line);
		return point ? [{ ...train, point }] : [];
	}), [feed.trains, routeId]);

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const from = [...currentBox.current];
		const start = performance.now();
		let frame = 0;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
		const animate = (now: number) => {
			const t = reduce.matches || drag.current ? 1 : Math.min(1, (now - start) / 320);
			const ease = 1 - (1 - t) ** 3;
			currentBox.current = box.map((v, i) => from[i] + (v - from[i]) * ease) as Box;
			svg.setAttribute("viewBox", currentBox.current.join(" "));
			if (t < 1) frame = requestAnimationFrame(animate);
		};
		frame = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(frame);
	}, [box]);

	function selectStation(entry: RailStation, focus = true) {
		setSelectedId(entry.id);
		if (routeId !== "all" && !entry.routes.includes(routeId)) setRouteId("all");
		if (focus) setBox([entry.point[0] - 58, entry.point[1] - 70, 116, 140]);
	}
	function selectRoute(value: string) {
		setRouteId(value);
		setQuery("");
		const next = network.routes.find((entry) => entry.id === value);
		setBox(next ? fitBox(next.shapes.flatMap((shape) => shape.points)) : network.viewBox);
		if (next && !station.routes.includes(value)) setSelectedId(network.stations.find((entry) => entry.routes.includes(value))!.id);
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
		<section className="rail-network" aria-labelledby={`${id}-title`} data-placement={placement}>
			<div className="rail-heading wrap">
				<div><p className="kicker">The Atlas · Chicago in motion</p><Heading id={`${id}-title`}>{placement === "start" ? "Every line. One city." : "Back on the network."}</Heading>
				<p>The whole ‘L’, from O’Hare to the South Side. Pick a line, find a station, follow a train.</p></div>
				<div className="rail-feed-status" role={placement === "start" ? "status" : undefined} data-state={feed.kind}><span className="rail-status-dot" />{statusText}
					<small aria-live="off">{feed.asOf ? `Updated ${new Date(feed.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Chicago" })} CT · every 15 seconds` : "The geographic map stays available."}</small></div>
			</div>
			<div className="rail-layout wrap">
				<div className="rail-map-pane">
					<div className="rail-route-filter" role="group" aria-label="Filter CTA routes">
						<button type="button" aria-pressed={routeId === "all"} onClick={() => selectRoute("all")}>All lines</button>
						{network.routes.map((line) => <button type="button" key={line.id} aria-pressed={routeId === line.id} style={{ "--rail-color": routeColors[line.id] } as React.CSSProperties} onClick={() => selectRoute(line.id)}><i aria-hidden="true" />{line.name}</button>)}
					</div>
					<div className="rail-map-canvas">
						<svg ref={svgRef} className={box[2] < 160 ? "rail-map-svg rail-map-detail" : "rail-map-svg"} viewBox={network.viewBox.join(" ")} role="group" aria-label="Geographic CTA rail network" onPointerDown={(event) => {
							if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('[role="button"]')) return;
							drag.current = { x: event.clientX, y: event.clientY, box: [...currentBox.current], moved: false };
							event.currentTarget.setPointerCapture(event.pointerId);
						}} onPointerMove={pan} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
							<title>Chicago Transit Authority rail network, eight lines and {network.stations.length} stations</title>
							<desc>Geographic routes from CTA GTFS. Select a station using the map or station selector. Train symbols are reported live positions, snapped to their route within 500 metres.</desc>
							{/* Illustrative lake edge, not a surveyed shoreline. */}
							<g className="rail-geography" aria-hidden="true"><path d="M80 -1000 L1000 -1000 L1000 1000 L110 1000 L110 240 L100 180 L81 125 L68 75 L65 22 L57 -16 L45 -50 L44 -100 L49 -143 L55 -170 Z" /><text x="80" y="-75" transform="rotate(90 80 -75)">LAKE MICHIGAN</text></g>
							<g fill="none" strokeLinecap="round" strokeLinejoin="round" className="rail-paths">
								{network.routes.map((line) => <path key={line.id} data-route={line.id} className={routeId === "all" || routeId === line.id ? "" : "rail-muted"} d={paths.get(line.id)} stroke={routeColors[line.id]} strokeWidth={routeId === line.id ? 2 : 1.5} />)}
							</g>
							<g className="rail-stations">
								{availableStations.map((entry) => {
									const selected = selectedId === entry.id;
									const label = labels.get(entry.id);
									return <g key={entry.id} role="button" tabIndex={selected ? 0 : -1} aria-label={`${entry.name} CTA station`} aria-pressed={selected} data-station={entry.id} className={selected ? "rail-station rail-selected" : "rail-station"} onClick={() => selectStation(entry)} onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectStation(entry); }
										if (event.key === "Escape") setBox(network.viewBox);
									}}>
										<circle className="rail-station-hit" cx={entry.point[0]} cy={entry.point[1]} r={4} />
										<circle cx={entry.point[0]} cy={entry.point[1]} r={selected ? 3 : entry.routes.length > 1 || entry.transfers.length ? 2 : 1.3} />
										{label ? <text x={label.x} y={label.y} textAnchor={label.anchor} style={{ fontSize: box[3] / 55 }} className={selected ? "rail-selected-label" : "rail-station-label"}>{entry.name.replace(/ \(.*\)$/, "")}</text> : null}
									</g>;
								})}
							</g>
							<g className="rail-live-trains" aria-label="Live train positions">
								{trains.map((train) => <TrainMarker key={train.id} train={train} point={train.point} route={network.routes.find((line) => line.id === train.route)!} />)}
							</g>
						</svg>
						<div className="rail-map-tools" role="group" aria-label="Map view"><button type="button" onClick={() => setBox(network.viewBox)}>Full network</button><button type="button" onClick={() => setBox([37, -4, 66, 79])}>The Loop</button><button type="button" aria-label="Zoom in" onClick={() => zoom(.65)}>+</button><button type="button" aria-label="Zoom out" onClick={() => zoom(1.5)}>−</button></div>
						<div className="rail-map-caption"><span>N ↑</span><span>Geographic network · drag to pan</span><span>{network.stations.length} stations / 8 lines</span></div>
					</div>
					<p className="rail-map-note">Rings mark transfers. Train symbols use reported coordinates; no simulated movement. Labels expand as you explore.</p>
				</div>
				<aside className="rail-station-panel" aria-label="Station details">
					<label htmlFor={`${id}-station`}>Find a station{route ? ` · ${route.name} Line` : ""}</label>
					<select id={`${id}-station`} value={station.id} onChange={(event) => selectStation(network.stations.find((entry) => entry.id === event.target.value)!)}>
						{[...availableStations].sort((a, b) => a.name.localeCompare(b.name)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
					</select>
					<label htmlFor={`${id}-search`} className="sr-only">Search CTA stations</label><input id={`${id}-search`} type="search" placeholder="Search stations…" value={query} onChange={(event) => setQuery(event.target.value)} />
					{query.trim() ? <div className="rail-search-results" role="group" aria-label="Matching stations">{matches.slice(0, 8).map((entry) => <button key={entry.id} type="button" onClick={() => { selectStation(entry); setQuery(""); }}>{entry.name}</button>)}{matches.length === 0 ? <p>No matching stations. Try another name.</p> : null}</div> : null}
					<div className="rail-selected-station"><span className="kicker">At the platform</span><h3>{station.name}</h3><p>{station.routes.map((rid) => network.routes.find((entry) => entry.id === rid)!.name).join(" · ")}</p></div>
					{SERVICE_URL ? <CtaLive stationId={selectedId} showStations={false} /> : <p className="rail-offline">Live arrivals are unavailable. Explore every line and station on the map.</p>}
					<div className="rail-service"><h4>Service context</h4>{!feed.alertsAvailable ? <p>CTA service status is unavailable. Missing trains do not mean a service outage.</p> : <ul>{station.routes.flatMap((rid) => feed.statuses.filter((entry) => entry.route === rid || (rid === "p" && entry.route === "pexp")).map((entry) => <li key={entry.route}><b>{network.routes.find((line) => line.id === rid)!.name}{entry.route === "pexp" ? " Express" : ""}</b><span>{entry.status}</span></li>))}</ul>}<a href="https://www.transitchicago.com/alerts/" target="_blank" rel="noreferrer">Current CTA alerts ↗</a></div>
					{station.transfers.length ? <div className="rail-transfers"><h4>Transfer connections</h4>{station.transfers.map((sid) => { const next = network.stations.find((entry) => entry.id === sid)!; return <button key={sid} type="button" onClick={() => selectStation(next)}>{next.name} ↗</button>; })}</div> : null}
					{connections.length ? <div className="rail-projects"><h4>Portfolio connections</h4>{connections.map(({ slug, project }) => <a href={`/portfolio/projects/${slug}/`} key={slug}>{project.title}<span>Read project ↗</span></a>)}<small>Editorial stops, not work locations. Project details also live in The Dispatch.</small></div> : null}
					<details className="rail-train-list"><summary>{trains.length} trains {route ? `on the ${route.name} Line` : "on the network"}</summary><ul>{trains.map((train) => <li key={train.id}><b>{network.routes.find((entry) => entry.id === train.route)!.name} · {train.destination}</b><span>Next: {train.nextStation}{train.isDelayed ? " · Delay flagged" : ""}</span></li>)}</ul></details>
				</aside>
			</div>
			<div className="rail-source wrap"><span>CTA GTFS · updated {network.metadata.packageUpdated}. Positions: CTA Train Tracker. No CTA endorsement.</span><a href={network.metadata.source}>Network data ↗</a>{placement === "start" ? <a href="#atlas-ride">Ride through the portfolio ↓</a> : <a href="#view-atlas">Back to the start ↑</a>}</div>
		</section>
	);
}
