"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { projectWillisTower, WILLIS_BANDS, WILLIS_BAY, WILLIS_FLOOR, WILLIS_ORBIT_MAX_ZOOM } from "@/content/willis-tower";
import type { OrbitView } from "@/content/willis-tower";
import type { WillisLighting } from "@/content/willis-lighting";
import { WillisLightingNote } from "@/components/chicago/WillisLighting";

export type TowerOrbit = {
	view: OrbitView;
	lighting: WillisLighting | null;
	adjust: (yaw: number, pitch: number, zoom?: number) => void;
	reset: () => void;
};

const glazing = Array.from({ length: 36 }, (_, cell) => {
	const column = cell % 6;
	const row = Math.floor(cell / 6);
	const shade = [0, .17, .06, .12, .02, .08, .07][(cell * 13 + row * 3) % 7];
	return { x: column * WILLIS_BAY, y: row * WILLIS_FLOOR, shade };
});

export function orbitKeys(event: KeyboardEvent<Element>, adjust: TowerOrbit["adjust"]) {
	if (event.altKey || event.ctrlKey || event.metaKey) return;
	switch (event.key) {
		case "ArrowLeft": adjust(-15, 0); break;
		case "ArrowRight": adjust(15, 0); break;
		case "ArrowUp": adjust(0, 10); break;
		case "ArrowDown": adjust(0, -10); break;
		case "+": case "=": adjust(0, 0, 1.2); break;
		case "-": adjust(0, 0, 1 / 1.2); break;
		default: return;
	}
	event.preventDefault();
	event.stopPropagation();
}

export default function WillisTowerOrbit({ view, adjust, lighting, close }: TowerOrbit & { close: () => void }) {
	const model = useRef<SVGSVGElement>(null);
	const target = useRef<SVGGElement>(null);
	const drag = useRef<{ id: number; x: number; y: number } | null>(null);
	const moved = useRef(false);
	const windowId = useId();
	const lightId = useId();
	const antennaId = useId();
	const surfacesId = useId();
	const reflectionId = useId();
	const fadeId = useId();
	const rippleId = useId();
	const palette = lighting?.palette ?? [];
	const antennaFill = palette.length > 1 ? `url(#${antennaId})` : palette[0] ?? "#cac6bd";
	const { surfaces } = projectWillisTower(view);

	useLayoutEffect(() => {
		model.current?.focus({ preventScroll: true });
	}, []);

	useEffect(() => {
		const element = target.current;
		if (!element) return;
		// Mobile browsers can start a page pan from a transformed SVG hit.
		const holdGesture = (event: TouchEvent) => {
			if (event.touches.length !== 1) return;
			event.preventDefault();
			event.stopPropagation();
		};
		element.addEventListener("touchstart", holdGesture, { passive: false });
		element.addEventListener("touchmove", holdGesture, { passive: false });
		return () => {
			element.removeEventListener("touchstart", holdGesture);
			element.removeEventListener("touchmove", holdGesture);
		};
	}, []);

	function startDrag(event: PointerEvent<SVGGElement>) {
		if (event.button !== 0 || drag.current) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
		moved.current = false;
	}

	function dragTower(event: PointerEvent<SVGGElement>) {
		const pointer = drag.current;
		if (!pointer || pointer.id !== event.pointerId) return;
		const dx = event.clientX - pointer.x;
		const dy = event.clientY - pointer.y;
		if (!moved.current && Math.hypot(dx, dy) < 3) return;
		moved.current = true;
		adjust(dx * .65, dy * .45);
		pointer.x = event.clientX;
		pointer.y = event.clientY;
	}

	function endDrag(event: PointerEvent<SVGGElement>) {
		if (drag.current?.id === event.pointerId) drag.current = null;
	}

	return (
		<svg className="tower-orbit-model" ref={model} viewBox="-126 -550 252 550"
			preserveAspectRatio="xMidYMax meet" role="application" tabIndex={0} aria-label="Willis Tower 3D view"
			aria-describedby="atlas-tower-orbit-help" data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					close();
				}
				orbitKeys(event, adjust);
			}}>
			<defs>
				<linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="172">
					<stop offset="0" stopColor="white" />
					<stop offset=".36" stopColor="white" />
					<stop offset="1" stopColor="white" stopOpacity="0" />
				</linearGradient>
				<pattern id={rippleId} width="51" height="16" patternUnits="userSpaceOnUse">
					<path d="M0 1h51 M-12 7h49 m-17 5h39" fill="none" stroke="#080e14" strokeWidth="1.6" />
				</pattern>
				<mask id={reflectionId} maskUnits="userSpaceOnUse" x="-126" y="0" width="252" height="180">
					<rect x="-126" y="0" width="252" height="180" fill={`url(#${fadeId})`} />
					<rect x="-126" y="0" width="252" height="180" fill={`url(#${rippleId})`} />
				</mask>
			</defs>
			<g className="willis-reflection" mask={`url(#${reflectionId})`} aria-hidden="true">
				<use href={`#${surfacesId}`} transform="matrix(1.08 0 -.039 -.28 0 0)" />
			</g>
			<g className="tower-orbit-drag" ref={target} aria-hidden="true"
				onPointerDown={startDrag} onPointerMove={dragTower} onPointerUp={endDrag}
				onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
				<rect x="-78" y="-520" width="156" height="520" fill="transparent" />
				<g id={surfacesId} className="willis-surfaces" transform="scale(.85)">
					<defs>
						<pattern id={windowId} patternUnits="userSpaceOnUse" width={WILLIS_BAY * 6} height={WILLIS_FLOOR * 6}>
							{glazing.map(({ x, y, shade }) => (
								<rect key={`${x}-${y}`} x={x + .26} y={y + .33} width={WILLIS_BAY - .52} height={WILLIS_FLOOR - .60} fill={shade > .12 ? "#f7c77e" : "#b0a092"} opacity={shade > .12 ? .66 : shade} />
							))}
						</pattern>
						<linearGradient id={lightId} x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stopColor="#0f131a" stopOpacity=".4" />
							<stop offset="1" stopColor="#b6a58a" stopOpacity=".18" />
						</linearGradient>
						{palette.length > 1 ? (
							<linearGradient id={antennaId} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="447" y2="527">
								{palette.map((color, index) => (
									<stop key={index} offset={index / (palette.length - 1)} stopColor={color} />
								))}
							</linearGradient>
						) : null}
					</defs>
					{surfaces.map(({ id, transform, sun, material, width, bottom, top }) => {
						const glazingFace = material === "glass";
						const fill = glazingFace
							? `rgb(${42 + 39 * sun} ${38 + 32 * sun} ${34 + 23 * sun})`
							: { roof: "#817c71", metal: "#242523", antenna: antennaFill, beacon: "#9c5543" }[material];
						return (
							<g key={id} transform={transform} data-material={material}>
								<rect x={0} y={bottom} width={width} height={top - bottom} fill={fill}
									stroke="#a29c90" strokeOpacity={material === "antenna" ? .82 : .42} strokeWidth=".65" />
								{glazingFace ? (
									<>
										<rect x={0} y={bottom} width={width} height={top - bottom} fill={`url(#${lightId})`} />
										<rect x={0} y={bottom} width={width} height={top - bottom} fill={`url(#${windowId})`} />
										<path d={`M.3 ${bottom}V${top} M${width - .3} ${bottom}V${top}`} fill="none" stroke="#1d1c1d" strokeWidth=".6" />
										{WILLIS_BANDS.filter((y) => y > bottom && y < top).map((y) => (
											<rect key={y} y={Math.max(y - 3, bottom)} width={width} height={Math.min(y + 4, top) - Math.max(y - 3, bottom)} fill="#222120" />
										))}
									</>
								) : null}
							</g>
						);
					})}
				</g>
			</g>
			<path className="tower-orbit-focus" d="M-64 -499v-14h14m100 0h14v14m0 478v14H50m-100 0h-14v-14"
				fill="none" stroke="var(--signal)" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
		</svg>
	);
}

export function TowerOrbitControls({ view, adjust, reset, lighting, showLighting = true }: TowerOrbit & { showLighting?: boolean }) {
	return (
		<div className="tower-orbit-tools" onKeyDown={(event) => orbitKeys(event, adjust)}>
			<p id="atlas-tower-orbit-help">Drag to orbit. Use the arrow keys or controls to rotate and tilt.</p>
			<div className="tower-orbit-controls" role="group" aria-label="Tower view controls">
				<button type="button" aria-label="Rotate left" onClick={() => adjust(-30, 0)}>←</button>
				<button type="button" aria-label="Rotate right" onClick={() => adjust(30, 0)}>→</button>
				<button type="button" aria-label="Tilt up" disabled={view.pitch >= 78} onClick={() => adjust(0, 15)}>↑</button>
				<button type="button" aria-label="Tilt down" disabled={view.pitch <= 0} onClick={() => adjust(0, -15)}>↓</button>
				<button type="button" aria-label="Zoom out" disabled={view.zoom <= .75} onClick={() => adjust(0, 0, 1 / 1.2)}>−</button>
				<button type="button" aria-label="Zoom in" disabled={view.zoom >= WILLIS_ORBIT_MAX_ZOOM} onClick={() => adjust(0, 0, 1.2)}>+</button>
				<button type="button" aria-label="Reset view" onClick={reset}>↺</button>
			</div>
			{showLighting ? <WillisLightingNote lighting={lighting} /> : null}
		</div>
	);
}
