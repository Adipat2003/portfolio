"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { addWillisTower } from "@/content/willis-tower";
import { addMarinaCity } from "@/lib/atlas-marina-city";
import { mountRiverRenderer, riverCamera, riverEntryZoom, RIVER_MARINA, RIVER_WILLIS } from "@/lib/atlas-river-renderer";
import type { getRiverEnvironment } from "@/lib/atlas-river-environment";
import { orbitKeys } from "./WillisTowerOrbit";
import { riverCtaRoutes, riverCtaStations } from "@/lib/atlas-river-cta";
import type { RiverPan } from "@/lib/atlas-river-renderer";
import type { PanView, TowerOrbit } from "./WillisTowerOrbit";

type Props = {
	orbit: TowerOrbit;
	env: ReturnType<typeof getRiverEnvironment>;
	place: "willis" | "marina";
	snow: number;
	entry: boolean;
	autoZoom: boolean;
	showCta: boolean;
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
	const ctaLayer = useRef<SVGSVGElement>(null);
	const [selectedStop, setSelectedStop] = useState<string | null>(null);
	const ctaFrame = useRef("");
	const current = useRef(props);
	const entryFinished = useRef(!props.autoZoom);
	const entryFactor = useRef(1);
	const redraw = useRef<(() => void) | null>(null);
	const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
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
			current.current.pan !== props.pan || current.current.place !== props.place) {
			entryFinished.current = true;
		}
		if (current.current.showCta !== props.showCta) ctaFrame.current = "";
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
				const { orbit, env, place, snow, pan } = current.current;
				entryFactor.current = entryFinished.current || reduced.matches ? 1 : riverEntryZoom(time - started);
				entryFinished.current ||= entryFactor.current >= 1;
				const view = { ...orbit.view, zoom: orbit.view.zoom * entryFactor.current };
				const scheduledColors = orbit.lighting?.palette ?? [];
				const camera = renderer.draw(view, place === "willis" ? RIVER_WILLIS : RIVER_MARINA,
					env, scheduledColors, reduced.matches ? 0 : time / 1000, snow, pan);
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
				if (current.current.showCta) updateCta(camera, element, `${place}:${view.yaw}:${view.pitch}:${view.zoom}:${pan}`);
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

	function dragBy(element: HTMLCanvasElement, dx: number, dy: number) {
		const { movePan, orbit, place } = current.current;
		if (!movePan) {
			orbit.adjust(dx * .55, dy * .4);
			return;
		}
		const { width, height } = element.getBoundingClientRect();
		const target = place === "willis" ? RIVER_WILLIS : RIVER_MARINA;
		const { distance, focal } = riverCamera(orbit.view, target, width / Math.max(1, height));
		const metresPerPixel = 2 * distance * focal[1] / Math.max(1, height);
		movePan(-dx * metresPerPixel, dy * metresPerPixel * 1.5);
	}

	useEffect(() => {
		const element = canvas.current;
		if (!element) return;
		let touch: { id: number; x: number; y: number } | null = null;
		function startTouch(event: TouchEvent) {
			if (event.touches.length !== 1) {
				touch = null;
				return;
			}
			const finger = event.touches[0];
			touch = { id: finger.identifier, x: finger.clientX, y: finger.clientY };
			stopEntryZoom();
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

	function start(event: PointerEvent<HTMLCanvasElement>) {
		if (event.pointerType === "touch" || event.button !== 0 || pointer.current) return;
		stopEntryZoom();
		event.currentTarget.setPointerCapture(event.pointerId);
		pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
	}

	function drag(event: PointerEvent<HTMLCanvasElement>) {
		const old = pointer.current;
		if (!old || old.id !== event.pointerId) return;
		const dx = event.clientX - old.x, dy = event.clientY - old.y;
		if (Math.hypot(dx, dy) < 2) return;
		dragBy(event.currentTarget, dx, dy);
		old.x = event.clientX;
		old.y = event.clientY;
	}

	function finish(event: PointerEvent<HTMLCanvasElement>) {
		if (pointer.current?.id === event.pointerId) pointer.current = null;
	}

	return (
		<>
		<canvas ref={canvas} className="riverfront-canvas tower-orbit-model tower-orbit-drag"
			role="application" tabIndex={0} aria-label="Chicago River 3D view"
			aria-describedby="atlas-tower-orbit-help" data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom} data-pan={props.pan.join(",")}
			onPointerDown={start} onPointerMove={drag} onPointerUp={finish} onLostPointerCapture={finish} onPointerCancel={finish}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					props.close();
				} else orbitKeys(event, adjust, props.movePan);
			}}
		/>
		{props.showCta ? (
			<svg className="riverfront-cta" ref={ctaLayer} role="group" aria-label="CTA Red and Blue subway routes">
				{riverCtaRoutes.map((route) => (
					<g key={route.id} aria-hidden="true">
						<path className="cta-route-casing" data-route={route.id} />
						<path className="cta-route-line" data-route={route.id} stroke={route.color} />
					</g>
				))}
				{riverCtaStations.map((stop, i) => {
					const key = `${stop.route}-${stop.id}`;
					const select = () => setSelectedStop(selectedStop === key ? null : key);
					return (
						<g key={key} data-stop-index={i} role="button" tabIndex={0} className="riverfront-cta-stop"
							aria-label={`${stop.name}, CTA ${stop.route === "red" ? "Red" : "Blue"} Line`}
							aria-pressed={selectedStop === key}
							onClick={select} onKeyDown={(event) => {
								if (event.key === " " || event.key === "Enter") { event.preventDefault(); select(); }
							}}>
							<circle r="15" fill="transparent" />
							<circle className="riverfront-cta-dot" r="5" stroke={stop.color} />
							<text x="9" y="-8" aria-hidden="true">{stop.name}</text>
						</g>
					);
				})}
			</svg>
		) : null}
		</>
	);
}
