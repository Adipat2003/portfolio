"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AtlasMap from "@/components/atlas/AtlasMap";
import AtlasScene from "@/components/atlas/AtlasScene";
import AskBox from "@/components/AskBox";
import CtaLive from "@/components/atlas/CtaLive";
import { atlas, landmarkNote, LINE_COLORS, stations, site } from "@/content/load";
import { mosaics } from "@/content/mosaics";
import { MOSAIC_CELL, mosaicWidth } from "@/content/windowfont";

/**
 * The Night Ride: the whole Atlas as one continuous, interactive scene.
 *
 * One tall scroll track, one sticky stage, one experience on every screen
 * size. A requestAnimationFrame loop lerps the camera between stop focuses,
 * moves the you-are-here train (the glowing one) along the stop polyline,
 * deepens the sky from dusk through night toward dawn, and swaps the overlay
 * card as each phase arrives. The stops are the project stations, the
 * window-mosaic impact figures, and the terminal, where the ticket-booth
 * ask box answers questions from inside the scene. Clicking a station on
 * the map or a dot on the trip strip jumps the ride to that stop.
 *
 * Phones get the same ride with lighter geometry (shorter phases, gentler
 * zoom, dynamic viewport heights), not a different product. Under
 * prefers-reduced-motion the lerps snap instantly, so the same content
 * arrives without motion, and the Dispatch remains the canonical readable
 * surface.
 */

const [, , vw, vh] = atlas.viewBox.split(/\s+/).map(Number);

type Stop =
	| { kind: "station"; slug: string; label: string; x: number; y: number }
	| { kind: "figure"; figureIndex: number; label: string; x: number; y: number }
	| { kind: "terminal"; label: string; x: number; y: number };

/** The journey: west to east across the work and the numbers, then the terminal. */
const stops: Stop[] = [
	...[...stations]
		.sort((a, b) => a.station.cx - b.station.cx)
		.map((s) => ({
			kind: "station" as const,
			slug: s.slug,
			label: s.station.label,
			x: s.station.cx,
			y: s.station.cy,
		})),
	...mosaics.map((m) => {
		const figure = site.impact[m.figure_index];
		return {
			kind: "figure" as const,
			figureIndex: m.figure_index,
			label: figure.label.split(",")[0],
			x: m.x + mosaicWidth(figure.value) / 2,
			y: m.y + (7 * MOSAIC_CELL) / 2,
		};
	}),
].sort((a, b) => a.x - b.x);

/** The terminal ends the line at the east edge: the ticket booth lives here. */
const TERMINAL: Stop = { kind: "terminal", label: "The terminal", x: 1140, y: 300 };
stops.push(TERMINAL);

type Focus = { x: number; y: number; zoom: number };

const wideFocus: Focus = { x: vw / 2, y: vh / 2 - 30, zoom: 1 };

/** Train polyline: enters from the west edge and parks at the terminal.
    The exit point used to sit past the viewBox, so the train clipped off
    the map during the outro; now it arrives and stays, which is what
    "end of the line" should look like. */
const rail: Array<{ x: number; y: number }> = [
	{ x: Math.max(-30, stops[0].x - 170), y: stops[0].y + 70 },
	...stops.map((s) => ({ x: s.x, y: s.y })),
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Sky color helpers: the ride deepens the dusk into night, then lifts it
    toward a pre-dawn glow, all inside the ride stage. */
const hexToRgb = (hex: string): number[] => {
	const h = hex.trim().replace("#", "");
	const full = h.length === 3
		? h
				.split("")
				.map((c) => c + c)
				.join("")
		: h;
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16),
	];
};
const mixRgb = (a: number[], b: number[], t: number): number[] =>
	a.map((v, i) => v + (b[i] - v) * t);
const rgbCss = (c: number[]): string =>
	`rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;
const PREDAWN: number[][] = [hexToRgb("#241d38"), hexToRgb("#3a2a4a"), hexToRgb("#5c3f52")];

function stopAccent(stop: Stop): string {
	if (stop.kind === "station") {
		return LINE_COLORS[stations.find((st) => st.slug === stop.slug)!.project.line];
	}
	if (stop.kind === "figure") return "var(--signal)";
	return "var(--night-ink)";
}

/** The overlay card: a landmark, a station, a figure, or a hint. */
function RideCard({ stop, landmark }: { stop: Stop | null; landmark: string | null }) {
	const building = landmark ? atlas.buildings.find((b) => b.name === landmark) ?? null : null;
	const note = landmark ? landmarkNote(landmark) : null;
	const figure = stop && stop.kind === "figure" ? site.impact[stop.figureIndex] : null;
	const stationRecord =
		stop && stop.kind === "station" ? stations.find((st) => st.slug === stop.slug)! : null;

	if (building) {
		return (
			<div className="chi-card" key={building.name}>
				<h3>{building.name}</h3>
				<p className="chi-feature">{building.feature}</p>
				{note ? <p className="chi-note">{note}</p> : null}
			</div>
		);
	}
	if (stationRecord) {
		return (
			<div className="chi-card station-card" key={stationRecord.slug}>
				<span
					className="line-band-dot"
					aria-hidden="true"
					style={{ background: LINE_COLORS[stationRecord.project.line] }}
				/>
				<p className="sign">{stationRecord.station.label}</p>
				<h3>
					<a href={`/portfolio/projects/${stationRecord.slug}/`}>{stationRecord.project.title}</a>
				</h3>
				<p className="chi-feature">{stationRecord.project.summary}</p>
			</div>
		);
	}
	if (figure) {
		return (
			<div className="chi-card station-card figure-card" key="figure">
				<span className="line-band-dot" aria-hidden="true" style={{ background: "var(--signal)" }} />
				<p className="sign">The city in numbers</p>
				<h3 className="figure-value">{figure.value}</h3>
				<p className="chi-feature">{figure.label}</p>
				<p className="figure-kind">
					{figure.kind} · source: {figure.source}
				</p>
			</div>
		);
	}
	return (
		<div className="chi-card">
			<p className="chi-hint">
				{stop === null
					? "Your train is the glowing one. Scroll to ride."
					: "End of the line. Scroll on for the dawn."}
			</p>
		</div>
	);
}

function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(max-width: 860px)");
		const update = () => setIsMobile(mq.matches);
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);
	return isMobile;
}

export default function AtlasRide() {
	const rideRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const stripRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const trainRef = useRef<SVGGElement>(null);
	const phaseRef = useRef(0);

	const [phase, setPhase] = useState(0);
	const [landmark, setLandmark] = useState<string | null>(null);
	const isMobile = useIsMobile();
	/** When a landmark is open, the camera glides onto it like a stop. */
	const landmarkFocusRef = useRef<Focus | null>(null);

	function selectLandmark(name: string | null) {
		setLandmark(name);
		if (!name) {
			landmarkFocusRef.current = null;
			return;
		}
		// Find the building's group by its aria-label and take its center in
		// viewBox units, so the camera focus needs no new data.
		const svg = svgRef.current;
		const group = svg?.querySelector<SVGGElement>(`g[aria-label^="${name}:"]`);
		if (group) {
			const box = group.getBBox();
			landmarkFocusRef.current = {
				x: box.x + box.width / 2,
				y: box.y + box.height / 2,
				zoom: isMobile ? 1.5 : 1.9,
			};
		}
	}

	/** Keep the stage aware of the real header height: phones wrap the bar to
	    two rows and every fixed offset guess has already been wrong once.
	    The bar is measured, never assumed. */
	useEffect(() => {
		const bar = document.getElementById("concept-bar");
		const stage = stageRef.current;
		if (!bar || !stage) return;
		const apply = () => {
			stage.style.setProperty("--bar-h", `${Math.round(bar.getBoundingClientRect().height)}px`);
		};
		apply();
		const observer = new ResizeObserver(apply);
		observer.observe(bar);
		window.addEventListener("resize", apply);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", apply);
		};
	}, []);

	const phaseCount = stops.length + 2;
	const stop = phase >= 1 && phase <= stops.length ? stops[phase - 1] : null;

	/** Camera targets: wide city, one per stop, wide again. Phones zoom less so
	    the whole stop stays legible on a small stage. */
	const focuses = useMemo<Focus[]>(
		() => [
			wideFocus,
			...stops.map((s) => ({
				x: s.x,
				y: s.y,
				zoom: s.kind === "terminal" ? (isMobile ? 1.15 : 1.3) : isMobile ? 1.3 : 2,
			})),
			// The outro is the terminal's own camera: the ride ENDS at the
			// agent, and the dawn sky plus the footer close it out instead
			// of a pull-back that abandons the booth.
			{ x: TERMINAL.x, y: TERMINAL.y, zoom: isMobile ? 1.15 : 1.3 },
		],
		[isMobile],
	);

	useEffect(() => {
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const narrow = window.matchMedia("(max-width: 860px)");
		const cam = { ...focuses[0] };
		const pos = { ...rail[0] };
		const rootCs = getComputedStyle(document.documentElement);
		const dusk = (["--atlas-sky-1", "--atlas-sky-2", "--atlas-sky-3"] as const).map((key) =>
			hexToRgb(rootCs.getPropertyValue(key)),
		);
		const night = dusk.map((c) => c.map((v) => v * 0.42));
		let raf = 0;
		let txPrev = 0;
		let tyPrev = 0;

		const tick = () => {
			const ride = rideRef.current;
			const svg = svgRef.current;
			if (ride && svg) {
				const rect = ride.getBoundingClientRect();
				const total = Math.max(1, rect.height - window.innerHeight);
				const raw = Math.min(1, Math.max(0, -rect.top / total));
				// Scroll warp: the stops run to raw 0.84, the terminal then
				// HOLDS through raw 0.92 (the agent screen sticks while you
				// keep scrolling), and the outro rides the last 8% with the
				// camera parked, so the booth is never scrolled past.
				const HOLD_END = 0.92;
				let f =
					raw <= 0.84
						? (raw / 0.84) * stops.length
						: raw <= HOLD_END
							? stops.length
							: stops.length + (raw - HOLD_END) / (1 - HOLD_END);
				f = Math.min(phaseCount - 1, f);
				const i = Math.min(phaseCount - 2, Math.floor(f));
				const t = smooth(f - i);

				const tgt = landmarkFocusRef.current ?? {
					x: lerp(focuses[i].x, focuses[i + 1].x, t),
					y: lerp(focuses[i].y, focuses[i + 1].y, t),
					zoom: lerp(focuses[i].zoom, focuses[i + 1].zoom, t),
				};
				const ease = reduce ? 1 : 0.08;
				cam.x += (tgt.x - cam.x) * ease;
				cam.y += (tgt.y - cam.y) * ease;
				cam.zoom += (tgt.zoom - cam.zoom) * ease;

				svg.style.transformOrigin = "0 0";
				// Real camera: explicit translate+scale keeps the focus point
				// anchored on screen at any zoom and aspect. The old pivot trick
				// only panned (zoom - 1) x the pivot distance, so phones (zoom
				// 1.3) crawled at 30% speed and the train walked off the east
				// edge. Careful: getBoundingClientRect on the svg is
				// POST-transform (this loop's own zoom scales it), so the
				// untransformed layout box is recovered by dividing out z and
				// subtracting the translate this loop set last frame.
				const stageR = stageRef.current?.getBoundingClientRect();
				if (stageR) {
					const z = cam.zoom;
					const rect = svg.getBoundingClientRect();
					const layoutW = rect.width / z;
					const layoutH = rect.height / z;
					const fit = Math.min(layoutW / vw, layoutH / vh);
					const Lx = rect.x - txPrev;
					const Ly = rect.y - tyPrev;
					const anchorX = stageR.x + stageR.width * 0.5;
					const anchorY = stageR.y + stageR.height * (narrow.matches ? 0.36 : 0.5);
					const tx = anchorX - Lx - cam.x * fit * z;
					const ty = anchorY - Ly - cam.y * fit * z;
					svg.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${z.toFixed(4)})`;
					txPrev = tx;
					tyPrev = ty;
				}

				// Dusk deepens to night through the middle of the ride, then
				// lifts toward the pre-dawn glow by the end.
				const skyT = raw < 0.55 ? raw / 0.55 : 1;
				const dawnT = raw < 0.55 ? 0 : (raw - 0.55) / 0.45;
				const stage = stageRef.current;
				if (stage) {
					const skyStops = dusk.map((from, k) =>
						rgbCss(mixRgb(mixRgb(from, night[k], skyT), PREDAWN[k], dawnT)),
					);
					stage.style.setProperty("--atlas-sky-1", skyStops[0]);
					stage.style.setProperty("--atlas-sky-2", skyStops[1]);
					stage.style.setProperty("--atlas-sky-3", skyStops[2]);
					stage.style.setProperty("--dawn", dawnT.toFixed(3));
					stage.style.setProperty("--ride-progress", raw.toFixed(4));
				}

				// The train reaches the terminal at the final stop and parks
				// there through the outro, instead of clipping off the map.
				const tf = Math.min(f, rail.length - 1);
				const ti = Math.min(rail.length - 2, Math.floor(tf));
				const tt = smooth(tf - ti);
				const train = { x: lerp(rail[ti].x, rail[ti + 1].x, tt), y: lerp(rail[ti].y, rail[ti + 1].y, tt) };
				pos.x += (train.x - pos.x) * (reduce ? 1 : 0.1);
				pos.y += (train.y - pos.y) * (reduce ? 1 : 0.1);
				trainRef.current?.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);

				const next = Math.round(f);
				if (next !== phaseRef.current) {
					phaseRef.current = next;
					setPhase(next);
					setLandmark(null);
					landmarkFocusRef.current = null;
				}
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [phaseCount, focuses]);

	/** After each phase renders, keep the active stop visible inside the
	    strip's own scroll track; the page itself never moves here. The
	    marquee caption follows the dots, so when it would clip past the
	    track's right edge the scroll reveals it instead of the dot alone.
	    Runs as an effect because the .hit class is committed by React
	    after the frame loop reads the phase. */
	useEffect(() => {
		const strip = stripRef.current;
		if (!strip) return;
		const hit = strip.querySelector<HTMLElement>(".trip-stop.hit");
		const text = strip.querySelector<HTMLElement>(".strip-text");
		if (!hit) return;
		const maxLeft = strip.scrollWidth - strip.clientWidth;
		strip.scrollLeft = Math.max(0, Math.min(maxLeft, hit.offsetLeft - strip.clientWidth / 2 + hit.offsetWidth / 2));
		if (text && text.offsetLeft + text.offsetWidth - strip.scrollLeft > strip.clientWidth) {
			strip.scrollLeft = Math.min(maxLeft, text.offsetLeft + text.offsetWidth - strip.clientWidth);
		}
	}, [phase]);

	function jumpToPhase(target: number) {
		const ride = rideRef.current;
		if (!ride) return;
		const total = ride.offsetHeight - window.innerHeight;
		const top = ride.getBoundingClientRect().top + window.scrollY;
		// Instant jump, warped like the scroll mapping: stops run over the
		// first 84% of the ride, the terminal holds to 92%, the outro beyond.
		const p =
			target <= stops.length
				? (target / stops.length) * 0.84
				: Math.min(0.94, 0.92 + (target - stops.length) * 0.02);
		// The camera lerp in the frame loop is the glide, so the browser's
		// smooth-scroll never fights the ride on phones.
		window.scrollTo({ top: top + p * total, behavior: "auto" });
	}

	/** Clicking a station scrolls the ride to that phase. */
	function goToStation(slug: string | null) {
		if (!slug) return;
		const index = stops.findIndex((s) => s.kind === "station" && s.slug === slug);
		if (index === -1) return;
		jumpToPhase(index + 1);
	}

	function skipRide() {
		const ride = rideRef.current;
		if (!ride) return;
		const top = ride.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ top: top + ride.offsetHeight + 8, behavior: "auto" });
	}

	const nextStop = stops[Math.min(stops.length, phase)];
	const activeStationSlug = stop && stop.kind === "station" ? stop.slug : null;
	const activeMosaic = stop && stop.kind === "figure" ? stop.figureIndex : -1;
	const atTerminal = (stop !== null && stop.kind === "terminal") || phase > stops.length;

	const stripText =
		stop === null
			? `NEXT STOP · ${nextStop ? nextStop.label.toUpperCase() : "END OF THE LINE"}`
			: atTerminal
				? "THE TERMINAL · ASK THE AGENT"
				: `${stop.kind === "station" ? "NOW STOPPING" : "PASSING"} · ${stop.label.toUpperCase()}`;
	const counter =
		phase >= 1 && phase <= stops.length && !(stop !== null && stop.kind === "terminal")
			? ` · STOP ${phase} OF ${stops.length}`
			: "";

	return (
		<div className={`ride${phase === 0 ? " ride-phase-0" : ""}`} ref={rideRef} style={{ ["--ride-phases" as string]: phaseCount + 2 }}>
			<div className="ride-stage atlas-hero" ref={stageRef}>
				<AtlasScene>
					<div className="atlas-scroll">
						<AtlasMap
							svgRef={svgRef}
							selected={landmark}
							onSelect={selectLandmark}
							stationSelected={activeStationSlug}
							onSelectStation={goToStation}
							activeStation={activeStationSlug}
							activeMosaic={activeMosaic}
							dimStations={!(stop !== null && atTerminal)}
							classNameOverride={`chi-map riding${activeMosaic >= 0 || landmark ? " figure-focus" : ""}`}
						>
							<g ref={trainRef} className="you-train" aria-hidden="true">
								<circle r="18" cx="10" cy="0" className="you-halo" />
								<rect x="-13" y="-5" width="30" height="10" rx="3" className="you-body" />
								<rect x="-9" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<rect x="-2.5" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<rect x="4" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<circle cx="16" cy="0" r="1.8" className="train-headlight" />
							</g>
						</AtlasMap>
					</div>

					<div className="trip-strip" ref={stripRef} role="group" aria-label="Trip progress">
						<span className="trip-dots">
							{stops.map((s, i) => (
								<button
									key={s.kind === "station" ? s.slug : `${s.kind}-${i}`}
									type="button"
									aria-label={`Jump to ${s.label}`}
									className={`trip-stop${phase === i + 1 ? " hit" : i + 1 < phase ? " past" : ""}`}
									style={{ ["--accent-dot" as string]: stopAccent(s) }}
									onClick={() => jumpToPhase(i + 1)}
								>
									<i className="trip-stop-dot" aria-hidden="true" />
									<em>{s.kind === "terminal" ? "Terminal" : s.label}</em>
								</button>
							))}
						</span>
						<b className="strip-text">{stripText}{counter}</b>
					</div>

					<div className="ride-progress" aria-hidden="true" />

					<div className={`ride-copy${phase === 0 ? "" : " faded"}`}>
						<span className="kicker">Facade 2: The Atlas</span>
						<h1>The city is the navigation.</h1>
						<p className="lede">Your train is the glowing one. Scroll to ride.</p>
						<p className="lede lede-second">Ride past the numbers in lit windows. Get off at the terminal to ask.</p>
						<p className="dye-note">River dye week: Chicago runs the river green ahead of St. Patrick's Day.</p>
						<button type="button" className="skip-ride" onClick={skipRide}>
							Skip the ride
						</button>
					</div>

					<div className={`ride-overlay${atTerminal ? " terminal-overlay" : ""}`} role="status" aria-live="polite">
						{atTerminal ? (
							<div className="chi-card terminal-card" key="terminal">
								<CtaLive />
								<AskBox
									variant="panel"
									examples={site.ask_examples}
									headingId="ride-ask"
									heading="Ask the agent"
								/>
							</div>
						) : (
							<RideCard stop={landmark ? null : stop} landmark={landmark} />
						)}
					</div>

					<div className="dawn-glow" aria-hidden="true" />
				</AtlasScene>
			</div>
		</div>
	);
}
