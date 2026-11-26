"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { addWillisTower } from "@/content/willis-tower";
import { addMarinaCity } from "@/lib/atlas-marina-city";
import { mountRiverRenderer, RIVER_MARINA, RIVER_WILLIS } from "@/lib/atlas-river-renderer";
import type { getRiverEnvironment } from "@/lib/atlas-river-environment";
import { orbitKeys } from "./WillisTowerOrbit";
import type { TowerOrbit } from "./WillisTowerOrbit";

type Props = {
	orbit: TowerOrbit;
	env: ReturnType<typeof getRiverEnvironment>;
	place: "willis" | "marina";
	snow: number;
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
	const current = useRef(props);
	const redraw = useRef<(() => void) | null>(null);
	const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
	const { view, adjust } = props.orbit;

	useLayoutEffect(() => {
		canvas.current?.focus({ preventScroll: true });
	}, []);

	useLayoutEffect(() => {
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
			const paint = (time: number) => {
				const { orbit, env, place, snow } = current.current;
				const scheduledColors = orbit.lighting?.palette ?? [];
				const camera = renderer.draw(orbit.view, place === "willis" ? RIVER_WILLIS : RIVER_MARINA,
					env, scheduledColors, reduced.matches ? 0 : time / 1000, snow);
				const [x] = place === "willis" ? RIVER_WILLIS : RIVER_MARINA;
				const focus = place === "willis" ? [x - 22.86, 521, RIVER_WILLIS[2]] as const : [x, 173, RIVER_MARINA[2]] as const;
				const foot = place === "willis" ? [x, -6, RIVER_WILLIS[2]] as const : [x, -6, RIVER_MARINA[2]] as const;
				element.dataset.landmarkFrame = JSON.stringify({ tip: camera.project(focus), base: camera.project(foot) });
				element.dataset.mastColors = scheduledColors.join(",");
				element.dataset.frame = `${orbit.view.yaw}:${orbit.view.pitch}:${orbit.view.zoom}:${place}:${env.sun.elevation.toFixed(2)}`;
			};
			const schedule = () => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame((time) => {
					previous = time;
					paint(time);
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

			paint(performance.now());
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
			current.current.orbit.adjust(dx * .55, dy * .4);
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
		event.currentTarget.setPointerCapture(event.pointerId);
		pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
	}

	function drag(event: PointerEvent<HTMLCanvasElement>) {
		const old = pointer.current;
		if (!old || old.id !== event.pointerId) return;
		const dx = event.clientX - old.x, dy = event.clientY - old.y;
		if (Math.hypot(dx, dy) < 2) return;
		adjust(dx * .55, dy * .4);
		old.x = event.clientX;
		old.y = event.clientY;
	}

	function finish(event: PointerEvent<HTMLCanvasElement>) {
		if (pointer.current?.id === event.pointerId) pointer.current = null;
	}

	return (
		<canvas ref={canvas} className="riverfront-canvas tower-orbit-model tower-orbit-drag"
			role="application" tabIndex={0} aria-label="Chicago River 3D view"
			aria-describedby="atlas-tower-orbit-help" data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom}
			onPointerDown={start} onPointerMove={drag} onPointerUp={finish} onLostPointerCapture={finish} onPointerCancel={finish}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					props.close();
				} else orbitKeys(event, adjust);
			}}
		/>
	);
}
