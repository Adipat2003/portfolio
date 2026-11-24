"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AtlasMap from "@/components/atlas/AtlasMap";
import AtlasScene from "@/components/atlas/AtlasScene";
import TrainSprite from "@/components/atlas/TrainSprite";
import { TowerOrbitControls } from "@/components/atlas/WillisTowerOrbit";
import type { TowerOrbit } from "@/components/atlas/WillisTowerOrbit";
import AskBox from "@/components/AskBox";
import { clampedCamera } from "@/content/cta-geometry";
import { jumpInstantly, motionEase, ridePhaseAtProgress, ridePhaseOffset, rideSkipOffset, rideSnapPhase } from "@/content/ride-navigation";
import CtaLive from "@/components/atlas/CtaLive";
import { atlas, landmarkNote, LINE_COLORS, stations, site } from "@/content/load";
import { moveOrbit, WILLIS_ORBIT_DEFAULT, WILLIS_TOWER } from "@/content/willis-tower";

/**
 * The Night Ride: the secondary portfolio tour inside Atlas.
 *
 * One tall scroll track, one sticky stage, one experience on every screen
 * size. Animation frames settle the camera between stop focuses,
 * moves the you-are-here train (the glowing one) along the stop polyline,
 * deepens the sky from dusk through night toward dawn, and swaps the overlay
 * card as each phase arrives. The stops are project stations and the terminal,
 * where the ticket-booth ask box answers questions from inside the scene. Project
 * figures stay with their owning station instead of becoming separate stops.
 * Clicking a station on
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
	| { kind: "terminal"; label: string; x: number; y: number };

/** The journey: west to east across project stations, then the terminal. */
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
].sort((a, b) => a.x - b.x);

/** The terminal ends the line at the east edge: the ticket booth lives here. */
const TERMINAL: Stop = { kind: "terminal", label: "The terminal", x: 1140, y: 300 };
stops.push(TERMINAL);

type Focus = { x: number; y: number; zoom: number };
type LandmarkFocus = Pick<Focus, "x" | "y"> & { height: number; name: string };

const wideFocus: Focus = { x: vw / 2, y: vh / 2 - 30, zoom: 1 };

function rideFocuses(narrow: boolean): Focus[] {
	const destinations = stops.map(({ x, y, kind }) => ({
		x, y, zoom: kind === "terminal" ? (narrow ? 1.15 : 1.3) : (narrow ? 1.3 : 2),
	}));
	return [wideFocus, ...destinations, destinations[destinations.length - 1]];
}

const desktopFocuses = rideFocuses(false);
const mobileFocuses = rideFocuses(true);

/** Train polyline: enters from the west edge and parks at the terminal.
    The exit point used to sit past the viewBox, so the train clipped off
    the map during the outro; now it arrives and stays, which is what
    "end of the line" should look like. */
const rail: Array<{ x: number; y: number }> = [
	{ x: Math.max(-30, stops[0].x - 170), y: stops[0].y + 70 },
	...stops.map((s) => ({ x: s.x, y: s.y })),
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
	return "var(--night-ink)";
}

/** The overlay card: a landmark, a station, a figure, or a hint. */
function RideCard({ stop, landmark, towerOrbit, closeTower }: {
	stop: Stop | null;
	landmark: string | null;
	towerOrbit: TowerOrbit;
	closeTower: () => void;
}) {
	const building = landmark ? atlas.buildings.find((b) => b.name === landmark) ?? null : null;
	const note = landmark ? landmarkNote(landmark) : null;
	const stationRecord =
		stop && stop.kind === "station" ? stations.find((st) => st.slug === stop.slug)! : null;

	if (building) {
		return (
			<div className="chi-card" key={building.name}>
				<h3>{building.name}</h3>
				<p className="chi-feature">{building.feature}</p>
				{note ? <p className="chi-note">{note}</p> : null}
				{building.name === WILLIS_TOWER ? <TowerOrbitControls {...towerOrbit} close={closeTower} /> : null}
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
				{stationRecord.project.figures.length > 0 ? (
					<ul className="station-evidence" aria-label={`${stationRecord.project.title} figures`}>
						{stationRecord.project.figures.map((figure) => (
							<li key={`${figure.value}-${figure.label}`}>
								<div className="station-evidence-heading">
									<b>{figure.value}</b>
									<span>{figure.kind}</span>
								</div>
								<p>{figure.label}</p>
								<small>Source: {figure.source}</small>
							</li>
						))}
					</ul>
				) : null}
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

export default function AtlasRide() {
	const rideRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const stripRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const trainRef = useRef<SVGGElement>(null);
	const phaseRef = useRef(0);
	const wakeScene = useRef<(() => void) | null>(null);
	const interruptSnap = useRef<(() => void) | null>(null);

	const [phase, setPhase] = useState(0);
	const [landmark, setLandmark] = useState<string | null>(null);
	const [towerView, setTowerView] = useState(WILLIS_ORBIT_DEFAULT);
	const landmarkFocusRef = useRef<LandmarkFocus | null>(null);

	const towerOrbit: TowerOrbit = {
		view: towerView,
		adjust: (yaw, pitch, zoom) => setTowerView((current) => moveOrbit(current, yaw, pitch, zoom)),
		reset: () => setTowerView(WILLIS_ORBIT_DEFAULT),
	};

	function closeTower() {
		selectLandmark(null);
		svgRef.current?.querySelector<SVGGElement>(`g[aria-label^="${WILLIS_TOWER}:"]`)?.focus({ preventScroll: true });
	}

	function selectLandmark(name: string | null) {
		interruptSnap.current?.();
		if (name === WILLIS_TOWER && landmark !== WILLIS_TOWER) towerOrbit.reset();
		setLandmark(name);
	}

	useLayoutEffect(() => {
		const group = landmark && svgRef.current?.querySelector<SVGGElement>(`g[aria-label^="${landmark}:"] > g`);
		const box = group ? group.getBBox() : null;
		landmarkFocusRef.current = box && landmark ? {
			name: landmark,
			x: box.x + box.width / 2,
			y: box.y + box.height / 2,
			height: box.height,
		} : null;
		wakeScene.current?.();
	}, [landmark]);

	const stop = phase >= 1 && phase <= stops.length ? stops[phase - 1] : null;

	useEffect(() => {
		const ride = rideRef.current;
		const stage = stageRef.current;
		const svg = svgRef.current;
		const strip = stripRef.current;
		const overlay = overlayRef.current;
		const trainSprite = trainRef.current;
		const bar = document.getElementById("concept-bar");
		if (!ride || !stage || !svg || !strip || !overlay || !trainSprite || !bar) return;

		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
		const narrow = window.matchMedia("(max-width: 860px)");
		const cam = { ...wideFocus };
		let anchorY = narrow.matches ? .6 : .5;
		const pos = { ...rail[0] };
		const rootCss = getComputedStyle(document.documentElement);
		const dusk = (["--atlas-sky-1", "--atlas-sky-2", "--atlas-sky-3"] as const).map((key) =>
			hexToRgb(rootCss.getPropertyValue(key)),
		);
		const night = dusk.map((color) => color.map((value) => value * 0.42));

		const measure = () => {
			const headerHeight = Math.round(bar.getBoundingClientRect().height);
			stage.style.setProperty("--bar-h", `${headerHeight}px`);
			const bounds = ride.getBoundingClientRect();
			const stageBounds = stage.getBoundingClientRect();
			const css = getComputedStyle(svg!);
			return {
				rideTop: bounds.top + window.scrollY,
				rideHeight: bounds.height,
				viewportHeight: stageBounds.height,
				travel: Math.max(1, bounds.height - stageBounds.height),
				chromeBottom: strip.offsetTop + strip.offsetHeight || headerHeight,
				cardTop: overlay.offsetTop,
				cardWidth: overlay.clientWidth,
				stage: { width: stage.clientWidth, height: stage.clientHeight },
				map: { width: svg.clientWidth, height: svg.clientHeight, left: parseFloat(css.left) || 0, top: parseFloat(css.top) || 0 },
			};
		};

		let layout: ReturnType<typeof measure> | undefined;
		let raf: number | null = null;
		let previousFrame: number | null = null;
		let previousProgress = -1;
		let previousTransform = "";
		let previousTrain = "";

		const schedule = () => {
			if (raf === null) raf = requestAnimationFrame(tick);
		};
		const resize = () => {
			layout = undefined;
			schedule();
		};

		const tick = (now: number) => {
			raf = null;
			const elapsed = previousFrame === null ? 1000 / 60 : now - previousFrame;
			const { rideTop, travel, chromeBottom, cardTop, cardWidth, stage: stageSize, map } = layout ??= measure();
			if (!map.width || !stageSize.height) return;

			const progress = Math.min(1, Math.max(0, (window.scrollY - rideTop) / travel));
			const position = ridePhaseAtProgress(progress, stops.length);
			const next = Math.round(position);
			if (next !== phaseRef.current) {
				phaseRef.current = next;
				setPhase(next);
				if (landmarkFocusRef.current?.name !== WILLIS_TOWER) {
					setLandmark(null);
					landmarkFocusRef.current = null;
				}
			}

			const focuses = narrow.matches ? mobileFocuses : desktopFocuses;
			const i = Math.min(focuses.length - 2, Math.floor(position));
			// Continuous movement through each stop, including small mouse-wheel steps.
			const fraction = position - i;
			const landmarkFocus = landmarkFocusRef.current;
			const landmarkTop = chromeBottom + 16;
			const cardBelow = narrow.matches && cardWidth > stageSize.width * .58;
			const landmarkBottom = cardBelow ? cardTop - 14 : stageSize.height - 16;
			const target = landmarkFocus ? {
				...landmarkFocus,
				zoom: Math.min(narrow.matches ? 1.5 : 1.9, Math.max(1, landmarkBottom - landmarkTop) /
					(landmarkFocus.height * Math.min(map.width / vw, map.height / vh))),
			} : {
				x: lerp(focuses[i].x, focuses[i + 1].x, fraction),
				y: lerp(focuses[i].y, focuses[i + 1].y, fraction),
				zoom: lerp(focuses[i].zoom, focuses[i + 1].zoom, fraction),
			};
			const targetAnchor = landmarkFocus ? (landmarkTop + landmarkBottom) / (2 * stageSize.height)
				: narrow.matches ? (next === 0 ? .6 : .42) : .5;

			const trainIndex = Math.min(i, rail.length - 2);
			const trainFraction = Math.min(1, position - trainIndex);
			const train = {
				x: lerp(rail[trainIndex].x, rail[trainIndex + 1].x, trainFraction),
				y: lerp(rail[trainIndex].y, rail[trainIndex + 1].y, trainFraction),
			};
			const remaining = Math.max(
				Math.abs(target.x - cam.x), Math.abs(target.y - cam.y), Math.abs(target.zoom - cam.zoom) * 100,
				Math.abs(targetAnchor - anchorY) * stageSize.height,
				Math.abs(train.x - pos.x), Math.abs(train.y - pos.y),
			);
			const settling = !reduce.matches && remaining > .2;
			const ease = settling ? motionEase(elapsed, false, 110) : 1;
			cam.x = lerp(cam.x, target.x, ease);
			cam.y = lerp(cam.y, target.y, ease);
			cam.zoom = lerp(cam.zoom, target.zoom, ease);
			anchorY = lerp(anchorY, targetAnchor, ease);
			pos.x = lerp(pos.x, train.x, ease);
			pos.y = lerp(pos.y, train.y, ease);

			const camera = clampedCamera(map, stageSize, cam, { width: vw, height: vh }, anchorY);
			const transform = `translate(${camera.x.toFixed(2)}px,${camera.y.toFixed(2)}px) scale(${camera.zoom.toFixed(4)})`;
			const trainTransform = `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`;
			if (transform !== previousTransform) {
				svg.style.transform = transform;
				previousTransform = transform;
			}
			if (trainTransform !== previousTrain) {
				trainSprite.setAttribute("transform", trainTransform);
				previousTrain = trainTransform;
			}

			if (progress !== previousProgress) {
				const skyT = Math.min(1, progress / .55);
				const dawnT = Math.max(0, (progress - .55) / .45);
				dusk.forEach((from, k) => {
					stage.style.setProperty(`--atlas-sky-${k + 1}`, rgbCss(mixRgb(mixRgb(from, night[k], skyT), PREDAWN[k], dawnT)));
				});
				stage.style.setProperty("--dawn", dawnT.toFixed(3));
				stage.style.setProperty("--ride-progress", progress.toFixed(4));
				previousProgress = progress;
			}

			// Leave no frame loop running while the scene is idle.
			previousFrame = settling ? now : null;
			if (settling) schedule();
		};

		const quietMs = 200;
		let lastInput = -Infinity;
		let lastScrollY = window.scrollY;
		let snapTimer: number | undefined;
		let gesture = false;
		let touching = false;
		let touchEnd: AbortController | undefined;
		let alignedStop: number | null = null;

		const cancelSnap = () => {
			window.clearTimeout(snapTimer);
			gesture = false;
			lastInput = -Infinity;
		};
		const snap = () => {
			cancelSnap();
			if (landmarkFocusRef.current) return;
			const extent = layout ??= measure();
			const y = window.scrollY;
			const target = rideSnapPhase((y - extent.rideTop) / extent.travel, stops.length);
			if (target === null || target === alignedStop) return;
			const offset = ridePhaseOffset({ ...extent, target, stopCount: stops.length });
			alignedStop = target;
			if (Math.abs(offset - y) > 1) jumpInstantly(offset, window.scrollTo.bind(window));
		};
		const waitToSnap = () => {
			window.clearTimeout(snapTimer);
			if (gesture && !touching) snapTimer = window.setTimeout(snap, quietMs);
		};
		const onScroll = () => {
			schedule();
			const before = lastScrollY;
			lastScrollY = window.scrollY;
			if (before === lastScrollY || (!gesture && performance.now() - lastInput > quietMs)) return;
			const extent = layout ??= measure();
			const nearest = (y: number) => rideSnapPhase((y - extent.rideTop) / extent.travel, stops.length);
			if (!gesture) {
				const from = nearest(before);
				if (from !== null && Math.abs(ridePhaseOffset({ ...extent, target: from, stopCount: stops.length }) - before) <= 1) {
					alignedStop = from;
				}
			}
			// Leave a stop freely, even if several small wheel steps are needed.
			if (nearest(lastScrollY) !== alignedStop) alignedStop = null;
			gesture = true;
			waitToSnap();
		};
		const release = () => {
			if (!landmarkFocusRef.current) return;
			landmarkFocusRef.current = null;
			setLandmark(null);
			schedule();
		};
		const navigationInput = () => {
			lastInput = performance.now();
			release();
			waitToSnap();
		};
		const wheel = (event: WheelEvent) => {
			if (!event.defaultPrevented && !event.ctrlKey && !event.shiftKey &&
				Math.abs(event.deltaY) > Math.abs(event.deltaX)) navigationInput();
		};
		const finishTouch = () => {
			touching = false;
			touchEnd?.abort();
			waitToSnap();
		};
		const touchEndEvent = (event: Event) => {
			if ((event as TouchEvent).touches.length === 0) finishTouch();
		};
		const touchStart = (event: TouchEvent) => {
			if (event.touches.length !== 1) return;
			touching = true;
			lastInput = performance.now();
			touchEnd?.abort();
			touchEnd = new AbortController();
			const options = { passive: true, signal: touchEnd.signal };
			// A stop change can remove the card the finger started on.
			event.target?.addEventListener("touchend", touchEndEvent, options);
			event.target?.addEventListener("touchcancel", touchEndEvent, options);
			waitToSnap();
		};
		const scrollEnd = () => {
			if (touching && gesture) finishTouch();
		};
		const touchMove = (event: TouchEvent) => {
			if (event.touches.length === 1 && !(event.target instanceof Element && strip.contains(event.target))) navigationInput();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				cancelSnap();
				release();
				return;
			}
			const editing = event.target instanceof Element &&
				event.target.closest("input,textarea,select,[contenteditable]");
			const activating = event.key === " " && event.target instanceof Element && event.target.closest("button,[role=button]");
			if (!event.defaultPrevented && !editing && !activating &&
				["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) navigationInput();
		};
		const scrollbar = (event: PointerEvent) => {
			if (event.clientX >= document.documentElement.clientWidth) navigationInput();
		};

		const listeners = new AbortController();
		const passive = { passive: true, signal: listeners.signal };
		window.addEventListener("scroll", onScroll, passive);
		window.addEventListener("wheel", wheel, passive);
		window.addEventListener("touchstart", touchStart, passive);
		window.addEventListener("touchmove", touchMove, passive);
		window.addEventListener("touchend", touchEndEvent, passive);
		window.addEventListener("touchcancel", touchEndEvent, passive);
		document.addEventListener("scrollend", scrollEnd, passive);
		window.addEventListener("pointerdown", scrollbar, passive);
		window.addEventListener("keydown", key, { signal: listeners.signal });
		interruptSnap.current = cancelSnap;

		const observer = new ResizeObserver(resize);
		for (const element of [bar, ride, stage, strip, svg, overlay]) observer.observe(element);
		window.addEventListener("resize", resize);
		narrow.addEventListener("change", resize);
		reduce.addEventListener("change", schedule);
		wakeScene.current = schedule;
		schedule();
		return () => {
			observer.disconnect();
			listeners.abort();
			touchEnd?.abort();
			cancelSnap();
			interruptSnap.current = null;
			window.removeEventListener("resize", resize);
			narrow.removeEventListener("change", resize);
			reduce.removeEventListener("change", schedule);
			if (raf !== null) cancelAnimationFrame(raf);
			wakeScene.current = null;
		};
	}, []);

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
		const text = strip.querySelector<HTMLElement>(".strip-counter:not(:empty)") ?? strip.querySelector<HTMLElement>(".strip-text");
		if (!hit) return;
		const maxLeft = strip.scrollWidth - strip.clientWidth;
		strip.scrollLeft = Math.max(0, Math.min(maxLeft, hit.offsetLeft - strip.clientWidth / 2 + hit.offsetWidth / 2));
		if (text && text.offsetLeft + text.offsetWidth - strip.scrollLeft > strip.clientWidth) {
			strip.scrollLeft = Math.min(maxLeft, text.offsetLeft + text.offsetWidth - strip.clientWidth);
		}
	}, [phase]);

	function jumpToPhase(target: number) {
		selectLandmark(null);
		const ride = rideRef.current;
		if (!ride) return;
		const rideTop = ride.getBoundingClientRect().top + window.scrollY;
		jumpInstantly(ridePhaseOffset({ rideTop, rideHeight: ride.offsetHeight, viewportHeight: stageRef.current?.clientHeight ?? window.innerHeight, target, stopCount: stops.length }), window.scrollTo.bind(window));
	}

	/** Clicking a station scrolls the ride to that phase. */
	function goToStation(slug: string | null) {
		if (!slug) return;
		const index = stops.findIndex((s) => s.kind === "station" && s.slug === slug);
		if (index === -1) return;
		jumpToPhase(index + 1);
	}

	function skipRide() {
		selectLandmark(null);
		const ride = rideRef.current;
		if (!ride) return;
		const rideTop = ride.getBoundingClientRect().top + window.scrollY;
		jumpInstantly(rideSkipOffset({ rideTop, rideHeight: ride.offsetHeight }), window.scrollTo.bind(window));
	}

	const nextStop = stops[Math.min(stops.length, phase)];
	const activeStationSlug = stop && stop.kind === "station" ? stop.slug : null;
	const atTerminal = landmark !== WILLIS_TOWER && ((stop !== null && stop.kind === "terminal") || phase > stops.length);

	const stripText =
		stop === null
			? `NEXT STOP · ${nextStop ? nextStop.label.toUpperCase() : "END OF THE LINE"}`
			: atTerminal
				? "THE TERMINAL · ASK THE AGENT"
				: `${stop.kind === "station" ? "NOW STOPPING" : "PASSING"} · ${stop.label.toUpperCase()}`;
	const counter =
		phase >= 1 && phase <= stops.length && !(stop !== null && stop.kind === "terminal")
			? `STOP ${phase} OF ${stops.length}`
			: atTerminal
				? "TERMINAL"
				: "";

	return (
		<div id="atlas-ride" className={`ride${phase === 0 ? " ride-phase-0" : ""}`} ref={rideRef} style={{ ["--ride-phases" as string]: stops.length + 4 }}>
			<div className="ride-stage atlas-hero" ref={stageRef}>
				<AtlasScene>
					<div className="atlas-scroll">
						<AtlasMap
							svgRef={svgRef}
							selected={landmark}
							onSelect={selectLandmark}
							towerOrbit={landmark === WILLIS_TOWER ? towerOrbit : undefined}
							stationSelected={landmark || atTerminal ? null : activeStationSlug}
							onSelectStation={goToStation}
							activeStation={landmark || atTerminal ? null : activeStationSlug}
							dimStations={atTerminal || landmark !== null || phase === 0}
							classNameOverride={`chi-map riding${landmark ? " figure-focus" : ""}`}
						>
							<g ref={trainRef} className="you-train" aria-hidden="true">
								<circle r="18" cx="10" cy="0" className="you-halo" />
								<g transform="scale(1.25 1)"><TrainSprite tint={LINE_COLORS.blue} /></g>
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
						<b className="strip-text">{stripText}{counter ? ` · ${counter}` : ""}</b>
						<b className="strip-counter" aria-hidden="true">{counter}</b>
					</div>

					<div className="ride-progress" aria-hidden="true" />

					<div className={`ride-copy${phase === 0 ? "" : " faded"}`}>
						<span className="kicker">The portfolio ride</span>
						<h1>Take the scenic route.</h1>
						<p className="lede">My work, one stop at a time. Scroll to ride.</p>
						<p className="dye-note">River dye week: Chicago runs the river green ahead of St. Patrick's Day.</p>
						<button type="button" className="skip-ride" onClick={skipRide}>
							Skip to the live map
						</button>
					</div>

					<div className={`ride-overlay${atTerminal ? " terminal-overlay" : ""}`} ref={overlayRef} role="status" aria-live="polite">
						{atTerminal ? (
							<div className="chi-card terminal-card" key="terminal">
								<CtaLive />
								<AskBox
									variant="panel"
									examples={site.ask_examples}
									headingId="ride-ask"
									heading="Ask the agent"
								/>
								<button type="button" className="terminal-continue" onClick={skipRide}>Continue to live map</button>
							</div>
						) : (
							<RideCard stop={landmark ? null : stop} landmark={landmark} towerOrbit={towerOrbit} closeTower={closeTower} />
						)}
					</div>

					<div className="dawn-glow" aria-hidden="true" />
				</AtlasScene>
			</div>
		</div>
	);
}
