"use client";

import { useEffect, useRef, useState } from "react";
import AtlasMap from "@/components/atlas/AtlasMap";
import AtlasScene from "@/components/atlas/AtlasScene";
import WeatherBadge from "@/components/WeatherBadge";
import { atlas, landmarkNote, LINE_COLORS, stations } from "@/content/load";
import { weather } from "@/content/weather";

/**
 * The Night Ride: the Atlas as one continuous scene you scroll through.
 *
 * The ride element is a tall scroll track (one viewport per phase); the stage
 * inside it is sticky, so the city stays on screen while a requestAnimationFrame
 * loop reads scroll position, lerps the camera (zoom and focus origin), moves
 * the you-are-here train along the station polyline, and swaps the overlay
 * card as each phase arrives. Clicking any station scrolls the ride to that
 * phase; clicking a landmark shows it in the same overlay. Under
 * prefers-reduced-motion the lerp is skipped (targets apply instantly), so the
 * same content arrives without motion.
 */

/** Left-to-right tour order: the ride crosses the city, not one line. */
const tour = [...stations].sort((a, b) => a.station.cx - b.station.cx);
const [, , vw, vh] = atlas.viewBox.split(/\s+/).map(Number);

type Focus = { x: number; y: number; zoom: number };

const wideFocus: Focus = { x: vw / 2, y: vh / 2 - 30, zoom: 1 };

/** Camera targets: wide city, one per station, wide again. */
const focuses: Focus[] = [
  wideFocus,
  ...tour.map((s) => ({ x: s.station.cx, y: s.station.cy, zoom: 2 })),
  { x: vw / 2, y: vh / 2 - 40, zoom: 1 },
];

/** Train polyline: enters from the west edge, stops at every station. */
const rail: Array<{ x: number; y: number }> = [
  { x: Math.max(-30, tour[0].station.cx - 170), y: tour[0].station.cy + 70 },
  ...tour.map((s) => ({ x: s.station.cx, y: s.station.cy })),
  { x: Math.min(vw + 30, tour[tour.length - 1].station.cx + 170), y: tour[tour.length - 1].station.cy - 50 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

export default function AtlasRide() {
	const rideRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const trainRef = useRef<SVGGElement>(null);
	const phaseRef = useRef(0);

	const [phase, setPhase] = useState(0);
	const [landmark, setLandmark] = useState<string | null>(null);

	// Ride geometry: one viewport-height phase per stop, plus in and out.
	const phaseCount = focuses.length;

	useEffect(() => {
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const cam = { ...focuses[0] };
		const pos = { ...rail[0] };
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
		const index = tour.findIndex((s) => s.slug === slug);
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

	const station = phase >= 1 && phase <= tour.length ? tour[phase - 1] : null;
	const nextStop = tour[Math.min(tour.length, phase)];
	const building = landmark ? atlas.buildings.find((b) => b.name === landmark) ?? null : null;
	const note = landmark ? landmarkNote(landmark) : null;

	return (
		<div className="ride" ref={rideRef} style={{ ["--ride-phases" as string]: phaseCount }}>
			<div className="ride-stage atlas-hero">
				<AtlasScene>
					<WeatherBadge className="atlas-weather" />
					<div className="atlas-scroll">
						<AtlasMap
							svgRef={svgRef}
							selected={landmark}
							onSelect={setLandmark}
							onSelectStation={goToStation}
							activeStation={station ? station.slug : null}
							classNameOverride="chi-map riding"
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
							{tour.map((s, i) => (
								<i
									key={s.slug}
									className={phase === i + 1 ? "hit" : i + 1 < phase ? "past" : ""}
									style={{ background: phase === i + 1 ? LINE_COLORS[s.project.line] : undefined }}
								/>
							))}
						</span>
						{station ? (
							<b>NOW STOPPING · {station.station.label}</b>
						) : (
							<b>NEXT STOP · {nextStop ? nextStop.station.label : "end of the line"}</b>
						)}
					</div>

					<div className={`ride-copy${phase === 0 ? "" : " faded"}`}>
						<span className="kicker">Facade 2: The Atlas</span>
						<h1>The city is the navigation.</h1>
						<p className="lede">
							Ride the line through the work: scroll to travel, click a station to jump to it,
							and the skyline answers with each project.
						</p>
						<p className="dye-note">River dye week: Chicago runs the river green ahead of St. Patrick's Day.</p>
						<button type="button" className="skip-ride" onClick={skipRide}>
							Skip the ride
						</button>
					</div>

					<div className="ride-overlay" role="status" aria-live="polite">
						{building ? (
							<div className="chi-card" key={building.name}>
								<h3>{building.name}</h3>
								<p className="chi-feature">{building.feature}</p>
								{note ? <p className="chi-note">{note}</p> : null}
							</div>
						) : station ? (
							<div className="chi-card station-card" key={station.slug}>
								<span
									className="line-band-dot"
									aria-hidden="true"
									style={{ background: LINE_COLORS[station.project.line] }}
								/>
								<p className="sign">{station.station.label}</p>
								<h3>
									<a href={`/portfolio/projects/${station.slug}/`}>{station.project.title}</a>
								</h3>
								<p className="chi-feature">{station.project.summary}</p>
							</div>
						) : phase === 0 ? (
							<div className="chi-card">
								<p className="chi-hint">Scroll to board. The next stop lights up as you travel.</p>
							</div>
						) : (
							<div className="chi-card">
								<p className="chi-hint">End of the line. The rest of the city is below.</p>
							</div>
						)}
					</div>

					<div className={`weather-fx ${weather.condition_kind}`} aria-hidden="true" />
				</AtlasScene>
			</div>
		</div>
	);
}
