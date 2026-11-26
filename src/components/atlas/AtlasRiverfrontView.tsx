"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { addWillisTower, WILLIS_ORBIT_DEFAULT } from "@/content/willis-tower";
import { addMarinaCity } from "@/lib/atlas-marina-city";
import { mountRiverRenderer, riverCamera, riverEntryZoom, RIVER_MARINA, RIVER_WILLIS } from "@/lib/atlas-river-renderer";
import type { getRiverEnvironment } from "@/lib/atlas-river-environment";
import TrainSprite from "./TrainSprite";
import { orbitKeys } from "./WillisTowerOrbit";
import { guidedPosition, guidedTrain, guidedTransfer } from "@/lib/atlas-guided-route";
import { riverCtaRoutes, riverCtaStations } from "@/lib/atlas-river-cta";
import type { RiverGuide, RiverPan } from "@/lib/atlas-river-renderer";
import type { PanView, TowerOrbit } from "./WillisTowerOrbit";

type Props = {
	orbit: TowerOrbit;
	env: ReturnType<typeof getRiverEnvironment>;
	place: "willis" | "marina";
	snow: number;
	entry: boolean;
	autoZoom: boolean;
	showCta: boolean;
	guided?: boolean;
	guideProgress?: number;
	guideStops?: readonly string[];
	activeStop?: string;
	exploreGuide?: RiverGuide;
	exploreOnDrag?: PanView;
	selectStop?: (id: string) => void;
	pan: RiverPan;
	movePan?: PanView;
	close: () => void;
	status: (status: "ready" | "fallback") => void;
};

let meshPromise: Promise<Float32Array> | null = null;

function loadMesh() {
	meshPromise ??= fetch("/portfolio/atlas-river/riverfront.bin.gz").then(async (response) => {
		if (!response.ok || !response.body || typeof DecompressionStream === "undefined") {
			throw Error("Riverfront mesh unavailable");
		}
		const bytes = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
		if (!bytes.byteLength || bytes.byteLength % 96) throw Error("Invalid riverfront mesh");
		return new Float32Array(bytes);
	}).catch((error) => {
		meshPromise = null;
		throw error;
	});
	return meshPromise;
}

export default function AtlasRiverfrontView(props: Props) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const interaction = useRef<HTMLDivElement>(null);
	const trainMarker = useRef<SVGGElement>(null);
	const ctaLayer = useRef<SVGSVGElement>(null);
	const [selectedStop, setSelectedStop] = useState<string | null>(null);
	const ctaFrame = useRef("");
	const current = useRef(props);
	const entryFinished = useRef(!props.autoZoom);
	const entryFactor = useRef(1);
	const redraw = useRef<(() => void) | null>(null);
	const pointer = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
	const { view, adjust } = props.orbit;

	function updateCta(camera: ReturnType<typeof riverCamera>, element: HTMLCanvasElement, frameKey: string) {
		const overlay = ctaLayer.current;
		if (!overlay) {
			ctaFrame.current = "";
			return;
		}
		const width = element.clientWidth, height = element.clientHeight;
		const key = `${frameKey}:${width}:${height}`;
		if (key === ctaFrame.current) return;
		ctaFrame.current = key;
		overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
		const ground = -3;
		const near = 4;
		function screen(x: number, z: number) {
			const [u, v] = camera.project([x, ground, z]);
			return [u * width, v * height];
		}

		const marker = trainMarker.current;
		if (marker) {
			const { point, start, end } = guidedTrain(current.current.guideProgress ?? 0);
			const [x, y] = screen(...point);
			const [a, b] = screen(...start);
			const [c, d] = screen(...end);
			const angle = Math.atan2(d - b, c - a) * 180 / Math.PI;
			const visible = camera.depthOf([point[0], ground, point[1]]) > near &&
				x >= -16 && x <= width + 16 && y >= 4 && y <= height + 16;
			marker.style.display = visible ? "" : "none";
			if (visible) {
				marker.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
				const reverse = Math.abs(angle) > 90;
				const tilt = reverse ? angle - Math.sign(angle) * 180 : angle;
				marker.querySelector("[data-train-car]")?.setAttribute("transform",
					`translate(0 -19) rotate(${tilt.toFixed(1)}) scale(${reverse ? -1.35 : 1.35} 1.35)`);
			}
		}
		if (!current.current.showCta) return;

		for (const route of riverCtaRoutes) {
			let path = "";
			for (let [x1, z1, x2, z2] of route.segments) {
				const a = camera.depthOf([x1, ground, z1]), b = camera.depthOf([x2, ground, z2]);
				if (a <= near && b <= near) continue;
				if (a < near) {
					const t = (near - a) / (b - a);
					x1 += (x2 - x1) * t;
					z1 += (z2 - z1) * t;
				} else if (b < near) {
					const t = (near - b) / (a - b);
					x2 += (x1 - x2) * t;
					z2 += (z1 - z2) * t;
				}
				const [u1, v1] = screen(x1, z1);
				const [u2, v2] = screen(x2, z2);
				path += `M${u1.toFixed(1)},${v1.toFixed(1)}L${u2.toFixed(1)},${v2.toFixed(1)}`;
			}
			overlay.querySelectorAll(`[data-route="${route.id}"]`).forEach((element) => element.setAttribute("d", path));
		}
		if (current.current.guided) {
			const visible = guidedTransfer.every(([x, z]) => camera.depthOf([x, ground, z]) > near);
			const transfer = visible ? guidedTransfer.map(([x, z]) => screen(x, z).map((coordinate) => coordinate.toFixed(1)).join(",")).join("L") : "";
			overlay.querySelectorAll("[data-transfer]").forEach((element) => element.setAttribute("d", transfer ? `M${transfer}` : ""));
		}
		for (const [i, stop] of riverCtaStations.entries()) {
			const station = overlay.querySelector<SVGGElement>(`[data-stop-index="${i}"]`);
			if (!station) continue;
			const [x, z] = stop.point;
			const [u, v] = screen(x, z);
			const visible = camera.depthOf([x, ground, z]) > near && u > 8 && v > 8 && u < width - 8 && v < height - 8;
			station.style.display = visible ? "" : "none";
			if (visible) station.setAttribute("transform", `translate(${u.toFixed(1)} ${v.toFixed(1)})`);
		}
	}

	useLayoutEffect(() => {
		if (!current.current.entry) canvas.current?.focus({ preventScroll: true });
	}, []);

	useLayoutEffect(() => {
		if (current.current.orbit.view !== props.orbit.view ||
			current.current.pan !== props.pan || current.current.place !== props.place || (props.guideProgress ?? 0) > .02) {
			entryFinished.current = true;
		}
		if (current.current.showCta !== props.showCta || current.current.guided !== props.guided) ctaFrame.current = "";
		current.current = props;
		redraw.current?.();
	}, [props]);

	useEffect(() => {
		const element = canvas.current;
		if (!element) return;
		let cleanup: (() => void) | undefined;
		let stopped = false;
		const unavailable = () => current.current.status("fallback");
		element.addEventListener("webglcontextlost", unavailable);

		loadMesh().then((mesh) => {
			if (stopped) return;
			const landmarks: number[] = [];
			addWillisTower(landmarks, RIVER_WILLIS[0], RIVER_WILLIS[2]);
			addMarinaCity(landmarks);
			const renderer = mountRiverRenderer(element, mesh, new Float32Array(landmarks));
			if (!renderer) return unavailable();

			const reduced = matchMedia("(prefers-reduced-motion: reduce)");
			let frame = 0;
			let previous = 0;
			const started = performance.now();
			const paint = (time: number) => {
				const { orbit, env, place, snow, pan, guided, guideProgress = 0, exploreGuide } = current.current;
				const guide = guided && guideProgress > .02 ? { ...guidedPosition(guideProgress), progress: guideProgress } : undefined;
				const cameraGuide = guided ? guide : exploreGuide;
				entryFactor.current = entryFinished.current || reduced.matches ? 1 : riverEntryZoom(time - started);
				entryFinished.current ||= entryFactor.current >= 1;
				const baseView = guide ? WILLIS_ORBIT_DEFAULT : orbit.view;
				const cameraPan = guide ? [0, 0] as const : pan;
				const view = { ...baseView, zoom: baseView.zoom * entryFactor.current };
				const scheduledColors = orbit.lighting?.palette ?? [];
				const camera = renderer.draw(view, place === "willis" ? RIVER_WILLIS : RIVER_MARINA,
					env, scheduledColors, reduced.matches ? 0 : time / 1000, snow, cameraPan, cameraGuide);
				const [x] = place === "willis" ? RIVER_WILLIS : RIVER_MARINA;
				const focus = place === "willis" ? [x - 22.86, 521, RIVER_WILLIS[2]] as const : [x, 173, RIVER_MARINA[2]] as const;
				const foot = place === "willis" ? [x, -6, RIVER_WILLIS[2]] as const : [x, -6, RIVER_MARINA[2]] as const;
				element.dataset.landmarkFrame = JSON.stringify({ tip: camera.project(focus), base: camera.project(foot) });
				element.dataset.mastColors = scheduledColors.join(",");
				element.dataset.renderZoom = view.zoom.toFixed(4);
				element.dataset.initialZoom ??= element.dataset.renderZoom;
				element.dataset.weather = env.weather.precipitation ?? "unknown";
				element.dataset.snow = String(snow);
				element.dataset.foliage = env.foliage.cover.toFixed(3);
				element.dataset.ride = guided ? (guideProgress ?? 0).toFixed(4) : "explore";
				updateCta(camera, element, `${place}:${view.yaw}:${view.pitch}:${view.zoom}:${cameraPan}:${guideProgress}:${cameraGuide?.progress}`);
				element.dataset.frame = `${orbit.view.yaw}:${orbit.view.pitch}:${orbit.view.zoom}:${place}:${env.sun.elevation.toFixed(2)}`;
			};
			const schedule = () => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame((time) => {
					previous = time;
					paint(time);
					if (!entryFinished.current) schedule();
				});
			};
			// Cap atmospheric animation while retaining immediate direct manipulation.
			const timer = window.setInterval(() => {
				if (reduced.matches || document.hidden || performance.now() - previous < 80) return;
				schedule();
			}, 100);
			const resize = new ResizeObserver(schedule);
			resize.observe(element);
			redraw.current = schedule;
			reduced.addEventListener("change", schedule);
			cleanup = () => {
				window.clearInterval(timer);
				cancelAnimationFrame(frame);
				resize.disconnect();
				reduced.removeEventListener("change", schedule);
				renderer.dispose();
				redraw.current = null;
			};

			paint(started);
			if (!entryFinished.current) schedule();
			current.current.status("ready");
		}).catch(() => {
			if (!stopped) unavailable();
		});
		return () => {
			stopped = true;
			cleanup?.();
			element.removeEventListener("webglcontextlost", unavailable);
		};
	}, []);

	function stopEntryZoom() {
		if (entryFinished.current) return;
		entryFinished.current = true;
		current.current.orbit.adjust(0, 0, entryFactor.current);
	}

	useEffect(() => {
		const element = interaction.current;
		if (!element) return;
		function zoom(event: WheelEvent) {
			const { entry, guided, orbit } = current.current;
			if (!entry || guided || event.ctrlKey || event.shiftKey || !event.deltaY) return;
			event.preventDefault();
			orbit.adjust(0, 0, Math.exp(-Math.sign(event.deltaY) * .06));
		}
		element.addEventListener("wheel", zoom, { passive: false });
		return () => element.removeEventListener("wheel", zoom);
	}, []);

	// The separate landmark view captures the whole touch gesture, including vertical drags.
	useEffect(() => {
		const element = canvas.current;
		if (!element || current.current.entry) return;
		let touch: { id: number; x: number; y: number } | null = null;
		function startTouch(event: TouchEvent) {
			if (event.touches.length !== 1) {
				touch = null;
				return;
			}
			const finger = event.touches[0];
			touch = { id: finger.identifier, x: finger.clientX, y: finger.clientY };
			event.preventDefault();
			event.stopPropagation();
		}
		function moveTouch(event: TouchEvent) {
			const finger = event.touches[0];
			if (!touch || !finger || event.touches.length !== 1 || finger.identifier !== touch.id) return;
			event.preventDefault();
			event.stopPropagation();
			const dx = finger.clientX - touch.x, dy = finger.clientY - touch.y;
			if (Math.hypot(dx, dy) < 2) return;
			if (element) dragBy(element, dx, dy);
			touch.x = finger.clientX;
			touch.y = finger.clientY;
		}
		function endTouch() { touch = null; }
		element.addEventListener("touchstart", startTouch, { passive: false });
		element.addEventListener("touchmove", moveTouch, { passive: false });
		element.addEventListener("touchend", endTouch);
		element.addEventListener("touchcancel", endTouch);
		return () => {
			element.removeEventListener("touchstart", startTouch);
			element.removeEventListener("touchmove", moveTouch);
			element.removeEventListener("touchend", endTouch);
			element.removeEventListener("touchcancel", endTouch);
		};
	}, []);

	function start(event: PointerEvent<HTMLDivElement>) {
		if (!current.current.entry && event.pointerType === "touch") return;
		if (event.button !== 0 || !event.isPrimary || pointer.current) return;
		pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
	}

	function dragBy(element: HTMLElement, dx: number, dy: number) {
		const { guided, guideProgress = 0, movePan, exploreOnDrag, exploreGuide, orbit, place } = current.current;
		const panView = exploreOnDrag ?? movePan;
		if (!panView) {
			orbit.adjust(dx * .55, dy * .4);
			return;
		}
		const { width, height } = element.getBoundingClientRect();
		const target = place === "willis" ? RIVER_WILLIS : RIVER_MARINA;
		const ride = guided && guideProgress > .02
			? { ...guidedPosition(guideProgress), progress: guideProgress }
			: undefined;
		const { distance, focal } = riverCamera(ride ? WILLIS_ORBIT_DEFAULT : orbit.view, target,
			width / Math.max(1, height), undefined, ride ?? exploreGuide);
		const metresPerPixel = 2 * distance * focal[1] / Math.max(1, height);
		panView(-dx * metresPerPixel, dy * metresPerPixel * 1.5);
	}

	function drag(event: PointerEvent<HTMLDivElement>) {
		const old = pointer.current;
		if (!old || old.id !== event.pointerId) return;
		const { guided } = current.current;
		const dx = event.clientX - old.x, dy = event.clientY - old.y;
		const firstMove = !old.dragging;
		if (Math.hypot(dx, dy) < (firstMove ? 5 : 2)) return;
		// A vertical touch swipe still drives the native scroll ride.
		if (guided && event.pointerType === "touch" && Math.abs(dy) >= Math.abs(dx)) return;
		if (guided && !firstMove) return;
		if (firstMove) {
			old.dragging = true;
			stopEntryZoom();
			canvas.current?.focus({ preventScroll: true });
			event.currentTarget.setPointerCapture(event.pointerId);
		}
		dragBy(event.currentTarget, dx, dy);
		old.x = event.clientX;
		old.y = event.clientY;
	}

	function finish(event: PointerEvent<HTMLDivElement>) {
		if (pointer.current?.id === event.pointerId) pointer.current = null;
	}

	const train = props.entry ? guidedTrain(props.guideProgress ?? 0) : null;

	return (
		<div className="riverfront-interaction" ref={interaction} data-guided={Boolean(props.guided)}
			onPointerDown={start} onPointerMove={drag} onPointerUp={finish}
			onPointerLeave={(event) => { if (!pointer.current?.dragging) finish(event); }}
			onLostPointerCapture={(event) => { if (event.target === event.currentTarget) finish(event); }} onPointerCancel={finish}>
			<canvas ref={canvas} className={`riverfront-canvas tower-orbit-model${props.guided ? "" : " tower-orbit-drag"}`}
				role="application" tabIndex={0} aria-label="Chicago River 3D view"
				aria-describedby={props.guided ? "atlas-riverfront-guide-help" : "atlas-tower-orbit-help"} data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom} data-pan={props.pan.join(",")}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						props.close();
					} else if (!props.guided) orbitKeys(event, adjust, props.movePan);
				}}
			/>
			{props.showCta || train ? (
				<svg className="riverfront-cta" ref={ctaLayer} role="group" aria-label={props.showCta ? "CTA Red and Blue subway routes" : "Atlas ride position"}>
					{props.showCta ? riverCtaRoutes.map((route) => (
						<g key={route.id} aria-hidden="true">
							<path className="cta-route-casing" data-route={route.id} />
							<path className="cta-route-line" data-route={route.id} stroke={route.color} />
						</g>
					)) : null}
					{props.guided && props.showCta ? (
						<g aria-hidden="true">
							<path className="cta-route-casing" data-transfer="" />
							<path className="cta-transfer-line" data-transfer="" />
						</g>
					) : null}
					{props.showCta ? riverCtaStations.map((stop, i) => {
						const projectStop = props.guideStops?.includes(stop.id);
						if (props.guided && !projectStop) return null;
						const key = `${stop.route}-${stop.id}`;
						const select = () => {
							if (projectStop && props.selectStop) props.selectStop(stop.id);
							else setSelectedStop(selectedStop === key ? null : key);
						};
						return (
							<g key={key} data-stop-index={i} role="button" tabIndex={0} className="riverfront-cta-stop"
								aria-label={`${stop.name}, CTA ${stop.route === "red" ? "Red" : "Blue"} Line`}
								aria-pressed={props.activeStop === stop.id || selectedStop === key}
								onClick={select} onKeyDown={(event) => {
									if (event.key === " " || event.key === "Enter") { event.preventDefault(); select(); }
								}}>
								<circle r="15" fill="transparent" />
								<circle className="riverfront-cta-dot" r="5" stroke={stop.color} />
								<text x="9" y="-8" aria-hidden="true">{stop.name}</text>
							</g>
						);
					}) : null}
					{train ? (
						<g ref={trainMarker} className="riverfront-ride-train" role="img"
							aria-label={train.transfer ? "Your position in the Jackson transfer" : "Your train on the Atlas route"}
							data-train-progress={(props.guideProgress ?? 0).toFixed(4)}
							data-transfer-marker={train.transfer}>
							{!train.transfer ? <line x1="0" y1="-13" x2="0" y2="0" /> : null}
							<circle r={train.transfer ? 5 : 3.5} />
							{!train.transfer ? <g data-train-car=""><TrainSprite tint={train.color} /></g> : null}
						</g>
					) : null}
				</svg>
			) : null}
		</div>
	);
}
