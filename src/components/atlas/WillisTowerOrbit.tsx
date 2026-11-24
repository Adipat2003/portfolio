"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { projectWillisTower, WILLIS_BANDS, WILLIS_BAY, WILLIS_FLOOR } from "@/content/willis-tower";
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

export default function WillisTowerOrbit({ view, adjust, lighting }: TowerOrbit) {
	const target = useRef<SVGGElement>(null);
	const drag = useRef<{ id: number; x: number; y: number } | null>(null);
	const moved = useRef(false);
	const windowId = useId();
	const lightId = useId();
	const antennaId = useId();
	const palette = lighting?.palette ?? [];
	const antennaFill = palette.length > 1 ? `url(#${antennaId})` : palette[0] ?? "#cac6bd";
	const { surfaces } = projectWillisTower(view);

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
		<g className="building-angle tower-orbit-model" data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom}>
			<rect className="tower-orbit-focus" x="102" y="47" width="116" height="369" rx="4"
				fill="none" stroke="var(--signal)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
			<svg x="91" y="40" width="138" height="380" viewBox="-105 -314 210 577.5" overflow="hidden" aria-hidden="true">
				<g className="tower-orbit-drag" ref={target}
					onPointerDown={startDrag} onPointerMove={dragTower} onPointerUp={endDrag}
					onPointerCancel={endDrag} onLostPointerCapture={endDrag}
					onClick={(event) => { if (moved.current) event.stopPropagation(); }}>
					<defs>
						<pattern id={windowId} patternUnits="userSpaceOnUse" width={WILLIS_BAY * 6} height={WILLIS_FLOOR * 6}>
							{glazing.map(({ x, y, shade }) => (
								<rect key={`${x}-${y}`} x={x + .26} y={y + .33} width={WILLIS_BAY - .52} height={WILLIS_FLOOR - .60} fill={shade > .12 ? "#f7c77e" : "#b0a092"} opacity={shade > .12 ? .54 : shade} />
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
							? `rgb(${36 + 33 * sun} ${33 + 26 * sun} ${31 + 16 * sun})`
							: { roof: "#77736c", metal: "#242523", antenna: antennaFill, beacon: "#9c5543" }[material];
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
			</svg>
		</g>
	);
}

export function TowerOrbitControls({ view, adjust, reset, close, lighting }: TowerOrbit & { close: () => void }) {
	return (
		<div className="tower-orbit-tools" onKeyDown={(event) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				close();
			}
			orbitKeys(event, adjust);
		}}>
			<p id="atlas-tower-orbit-help">Drag the tower to rotate and tilt.</p>
			<div className="tower-orbit-controls" role="group" aria-label="Tower view controls">
				<button type="button" aria-label="Rotate left" onClick={() => adjust(-30, 0)}>←</button>
				<button type="button" aria-label="Rotate right" onClick={() => adjust(30, 0)}>→</button>
				<button type="button" aria-label="Tilt up" disabled={view.pitch >= 78} onClick={() => adjust(0, 15)}>↑</button>
				<button type="button" aria-label="Tilt down" disabled={view.pitch <= 0} onClick={() => adjust(0, -15)}>↓</button>
				<button type="button" aria-label="Zoom out" disabled={view.zoom <= .75} onClick={() => adjust(0, 0, 1 / 1.2)}>−</button>
				<button type="button" aria-label="Zoom in" disabled={view.zoom >= 2.35} onClick={() => adjust(0, 0, 1.2)}>+</button>
				<button type="button" aria-label="Reset view" onClick={reset}>↺</button>
			</div>
			<WillisLightingNote lighting={lighting} />
			<button className="tower-orbit-close" type="button" aria-label="Close tower controls" onClick={close}>×</button>
		</div>
	);
}
