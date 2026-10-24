"use client";

import { useEffect, useRef, useState } from "react";
import AtlasMap from "@/components/atlas/AtlasMap";
import AtlasScene from "@/components/atlas/AtlasScene";
import WeatherBadge from "@/components/WeatherBadge";
import { atlas, landmarkNote, LINE_COLORS, stations, site } from "@/content/load";
import { mosaics } from "@/content/mosaics";
import { weather } from "@/content/weather";
import { MOSAIC_CELL, mosaicWidth } from "@/content/windowfont";

/**
 * The Night Ride, in two forms.
 *
 * Desktop: the Atlas as one continuous scene you scroll through. The ride
 * element is a tall scroll track (one viewport per phase); the stage inside
 * it is sticky, so the city stays on screen while a requestAnimationFrame
 * loop lerps the camera, moves the you-are-here train along the stop
 * polyline, deepens the sky from dusk through night toward dawn, and swaps
 * the overlay card as each phase arrives. The stops are the stations AND the
 * window mosaics, woven into one west-to-east journey.
 *
 * Mobile: no scroll track. The city renders as a pannable strip with a row
 * of stop chips; tapping a chip or a station opens its card in normal page
 * flow, because thirteen viewport-heights of sticky scrolling is a bad phone
 * experience and this facade refuses to ship one.
 *
 * Under prefers-reduced-motion the desktop lerps snap instantly, so the same
 * content arrives without motion. The Dispatch stays the canonical readable
 * surface either way.
 */

const [, , vw, vh] = atlas.viewBox.split(/\s+/).map(Number);

type Stop =
	| { kind: "station"; slug: string; label: string; x: number; y: number }
	| { kind: "figure"; figureIndex: number; label: string; x: number; y: number };

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

type Focus = { x: number; y: number; zoom: number };

const wideFocus: Focus = { x: vw / 2, y: vh / 2 - 30, zoom: 1 };

/** Camera targets: wide city, one per stop, wide again. */
const focuses: Focus[] = [
	wideFocus,
	...stops.map((s) => ({ x: s.x, y: s.y, zoom: 2 })),
	{ x: vw / 2, y: vh / 2 - 40, zoom: 1 },
];

/** Train polyline: enters from the west edge, stops at every stop. */
const rail: Array<{ x: number; y: number }> = [
	{ x: Math.max(-30, stops[0].x - 170), y: stops[0].y + 70 },
	...stops.map((s) => ({ x: s.x, y: s.y })),
	{ x: Math.min(vw + 30, stops[stops.length - 1].x + 170), y: stops[stops.length - 1].y - 50 },
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

/** The overlay card, shared by both forms: a landmark, a station, a figure,
    or a hint. One renderer so the two surfaces cannot drift. */
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
					? "Pick a stop to see the project or the number behind it."
					: "End of the line. The rest of the city is below."}
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
	const isMobile = useIsMobile();
	return isMobile ? <RideMobile /> : <RideDesktop />;
}

function RideDesktop() {
	const rideRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const trainRef = useRef<SVGGElement>(null);
	const phaseRef = useRef(0);

	const [phase, setPhase] = useState(0);
	const [landmark, setLandmark] = useState<string | null>(null);

	const phaseCount = focuses.length;
	const stop = phase >= 1 && phase <= stops.length ? stops[phase - 1] : null;

	useEffect(() => {
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const cam = { ...focuses[0] };
		const pos = { ...rail[0] };
		const rootCs = getComputedStyle(document.documentElement);
		const dusk = (["--atlas-sky-1", "--atlas-sky-2", "--atlas-sky-3"] as const).map((key) =>
			hexToRgb(rootCs.getPropertyValue(key)),
		);
		const night = dusk.map((c) => c.map((v) => v * 0.42));
		let raf = 0;

		const tick = () => {
			const ride = rideRef.current;
			const svg = svgRef.current;
			if (ride && svg) {
				const rect = ride.getBoundingClientRect();
				const total = Math.max(1, rect.height - window.innerHeight);
				const raw = Math.min(1, Math.max(0, -rect.top / total));
				const f = raw * (phaseCount - 1);
				const i = Math.min(phaseCount - 2, Math.floor(f));
				const t = smooth(f - i);

				const tgt = {
					x: lerp(focuses[i].x, focuses[i + 1].x, t),
					y: lerp(focuses[i].y, focuses[i + 1].y, t),
					zoom: lerp(focuses[i].zoom, focuses[i + 1].zoom, t),
				};
				const ease = reduce ? 1 : 0.08;
				cam.x += (tgt.x - cam.x) * ease;
				cam.y += (tgt.y - cam.y) * ease;
				cam.zoom += (tgt.zoom - cam.zoom) * ease;

				svg.style.transform = `scale(${cam.zoom.toFixed(4)})`;
				svg.style.transformOrigin = `${((cam.x / vw) * 100).toFixed(2)}% ${((cam.y / vh) * 100).toFixed(2)}%`;

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
				}

				const ti = Math.min(rail.length - 2, i);
				const train = { x: lerp(rail[ti].x, rail[ti + 1].x, t), y: lerp(rail[ti].y, rail[ti + 1].y, t) };
				pos.x += (train.x - pos.x) * (reduce ? 1 : 0.1);
				pos.y += (train.y - pos.y) * (reduce ? 1 : 0.1);
				trainRef.current?.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);

				const next = Math.round(f);
				if (next !== phaseRef.current) {
					phaseRef.current = next;
					setPhase(next);
					setLandmark(null);
				}
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [phaseCount]);

	/** Clicking a station scrolls the ride to that phase. */
	function goToStation(slug: string | null) {
		if (!slug) return;
		const index = stops.findIndex((s) => s.kind === "station" && s.slug === slug);
		if (index === -1) return;
		const ride = rideRef.current;
		if (!ride) return;
		const total = ride.offsetHeight - window.innerHeight;
		const top = ride.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ top: top + ((index + 1) / (phaseCount - 1)) * total, behavior: "smooth" });
	}

	function skipRide() {
		const ride = rideRef.current;
		if (!ride) return;
		const top = ride.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ top: top + ride.offsetHeight + 8, behavior: "smooth" });
	}

	const nextStop = stops[Math.min(stops.length, phase)];
	const activeStationSlug = stop && stop.kind === "station" ? stop.slug : null;
	const activeMosaic = stop && stop.kind === "figure" ? stop.figureIndex : -1;

	return (
		<div className="ride" ref={rideRef} style={{ ["--ride-phases" as string]: phaseCount }}>
			<div className="ride-stage atlas-hero" ref={stageRef}>
				<AtlasScene>
					<WeatherBadge className="atlas-weather" />
					<div className="atlas-scroll">
						<AtlasMap
							svgRef={svgRef}
							selected={landmark}
							onSelect={setLandmark}
							stationSelected={activeStationSlug}
							onSelectStation={goToStation}
							activeStation={activeStationSlug}
							activeMosaic={activeMosaic}
							dimStations={stop !== null}
							classNameOverride={`chi-map riding${activeMosaic >= 0 ? " figure-focus" : ""}`}
						>
							<g ref={trainRef} className="you-train" aria-hidden="true">
								<circle r="16" cx="10" cy="0" className="you-halo" />
								<rect x="-13" y="-5" width="30" height="10" rx="3" className="you-body" />
								<rect x="-9" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<rect x="-2.5" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<rect x="4" y="-2.6" width="4.5" height="3" rx="0.8" className="train-window" />
								<circle cx="16" cy="0" r="1.8" className="train-headlight" />
							</g>
						</AtlasMap>
					</div>

					<div className="trip-strip" aria-hidden="true">
						<span className="trip-dots">
							{stops.map((s, i) => (
								<i
									key={s.kind === "station" ? s.slug : `figure-${s.figureIndex}`}
									className={phase === i + 1 ? "hit" : i + 1 < phase ? "past" : ""}
									style={{
										background:
											phase === i + 1
												? s.kind === "station"
													? LINE_COLORS[stations.find((st) => st.slug === s.slug)!.project.line]
													: "var(--signal)"
												: undefined,
									}}
								/>
							))}
						</span>
						{stop ? (
							<b>
								{stop.kind === "station" ? "NOW STOPPING" : "PASSING"} · {stop.label.toUpperCase()}
							</b>
						) : (
							<b>NEXT STOP · {nextStop ? nextStop.label.toUpperCase() : "end of the line"}</b>
						)}
					</div>

					<div className={`ride-copy${phase === 0 ? "" : " faded"}`}>
						<span className="kicker">Facade 2: The Atlas</span>
						<h1>The city is the navigation.</h1>
						<p className="lede">
							Ride the line through the work: scroll to travel, click a station to jump to it,
							and watch the skyline spell the numbers in lit windows as you pass.
						</p>
						<p className="dye-note">River dye week: Chicago runs the river green ahead of St. Patrick's Day.</p>
						<button type="button" className="skip-ride" onClick={skipRide}>
							Skip the ride
						</button>
					</div>

					<div className="ride-overlay" role="status" aria-live="polite">
						<RideCard stop={landmark ? null : stop} landmark={landmark} />
					</div>

					<div className="dawn-glow" aria-hidden="true" />
					<div className={`weather-fx ${weather.condition_kind}`} aria-hidden="true" />
				</AtlasScene>
			</div>
		</div>
	);
}

function RideMobile() {
	const [pick, setPick] = useState<number | null>(null);
	const [landmark, setLandmark] = useState<string | null>(null);
	const stop = pick !== null ? stops[pick] : null;

	function choose(index: number) {
		setPick(index);
		setLandmark(null);
	}

	return (
		<header className="atlas-hero ride-mobile">
			<WeatherBadge className="atlas-weather" />
			<div className="atlas-scroll">
				<AtlasMap
					selected={landmark}
					onSelect={(name) => {
						setLandmark(name);
						if (name) setPick(null);
					}}
					onSelectStation={(slug) => {
						if (!slug) return;
						const index = stops.findIndex((s) => s.kind === "station" && s.slug === slug);
						if (index !== -1) choose(index);
					}}
				/>
			</div>
			<p className="swipe-cue">Swipe the skyline to explore the whole map.</p>

			<div className="stop-chips" role="tablist" aria-label="Stops on the map">
				{stops.map((s, i) => (
					<button
						key={s.kind === "station" ? s.slug : `figure-${s.figureIndex}`}
						type="button"
						role="tab"
						aria-selected={pick === i}
						onClick={() => choose(i)}
					>
						{s.label}
					</button>
				))}
			</div>

			<div className="ride-overlay static-overlay" role="status" aria-live="polite">
				<RideCard stop={landmark ? null : stop} landmark={landmark} />
			</div>

			<div className="ride-copy">
				<span className="kicker">Facade 2: The Atlas</span>
				<h1>The city is the navigation.</h1>
				<p className="lede">
					The skyline holds the work: tap a stop, or a landmark on the map, and the city answers.
				</p>
				<p className="dye-note">River dye week: Chicago runs the river green ahead of St. Patrick's Day.</p>
			</div>
			<div className={`weather-fx ${weather.condition_kind}`} aria-hidden="true" />
		</header>
	);
}
