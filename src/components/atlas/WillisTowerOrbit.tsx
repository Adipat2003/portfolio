"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { moveOrbit, projectWillisTower, WILLIS_BANDS, WILLIS_BAY, WILLIS_FLOOR, WILLIS_ORBIT_DEFAULT, WILLIS_TOWER } from "@/content/willis-tower";

const glazing = Array.from({ length: 36 }, (_, cell) => {
	const column = cell % 6;
	const row = Math.floor(cell / 6);
	const shade = [0, .17, .06, .12, .02, .08, .07][(cell * 13 + row * 3) % 7];
	return { x: column * WILLIS_BAY, y: row * WILLIS_FLOOR, shade };
});

export default function WillisTowerOrbit({ onClose }: { onClose: () => void }) {
	const [view, setView] = useState(WILLIS_ORBIT_DEFAULT);
	const dialog = useRef<HTMLDialogElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	const drag = useRef<{ id: number; x: number; y: number } | null>(null);
	const nameId = useId();
	const helpId = useId();
	const windowId = useId();
	const lightId = useId();
	const { surfaces, base, shadow } = projectWillisTower(view);

	useLayoutEffect(() => {
		const element = dialog.current;
		if (!element) return;
		element.showModal();
		close.current?.focus({ preventScroll: true });
		return () => { if (element.open) element.close(); };
	}, []);

	function adjust(yaw: number, pitch: number, zoom = 1) {
		setView((current) => moveOrbit(current, yaw, pitch, zoom));
	}

	function startDrag(event: PointerEvent<HTMLDivElement>) {
		if (event.button !== 0 || drag.current) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
	}

	function dragTower(event: PointerEvent<HTMLDivElement>) {
		const pointer = drag.current;
		if (!pointer || pointer.id !== event.pointerId) return;
		adjust((event.clientX - pointer.x) * .65, (event.clientY - pointer.y) * .45);
		pointer.x = event.clientX;
		pointer.y = event.clientY;
	}

	function endDrag(event: PointerEvent<HTMLDivElement>) {
		if (drag.current?.id === event.pointerId) drag.current = null;
	}

	function keys(event: KeyboardEvent<HTMLDialogElement>) {
		event.stopPropagation();
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
	}

	return (
		<dialog
			className="tower-orbit" ref={dialog} aria-labelledby={nameId} aria-describedby={helpId}
			onClose={(event) => { if (!event.currentTarget.open) onClose(); }}
			onKeyDown={keys}
			onPointerDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
			onTouchMove={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			<div className="tower-orbit-frame">
				<header className="tower-orbit-header">
					<h2 id={nameId}>{WILLIS_TOWER}</h2>
					<button type="button" ref={close} aria-label="Close tower viewer" onClick={() => dialog.current?.close()}>✕</button>
				</header>
				<div className="tower-orbit-stage" data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom}
					onPointerDown={startDrag} onPointerMove={dragTower} onPointerUp={endDrag}
					onPointerCancel={endDrag} onLostPointerCapture={endDrag}
					onWheel={(event) => {
						if (event.ctrlKey || event.metaKey) return;
						const amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
						adjust(0, 0, Math.exp(Math.max(-.5, Math.min(.5, -amount / 560))));
					}}>
					<svg viewBox="-170 -286 340 572" role="img" aria-label="Three-dimensional model of Willis Tower">
						<defs>
							<pattern id={windowId} patternUnits="userSpaceOnUse" width={WILLIS_BAY * 6} height={WILLIS_FLOOR * 6}>
								{glazing.map(({ x, y, shade }) => (
									<rect key={`${x}-${y}`} x={x + .26} y={y + .33} width={WILLIS_BAY - .52} height={WILLIS_FLOOR - .60} fill="#b0a092" opacity={shade} />
								))}
							</pattern>
							<linearGradient id={lightId} x1="0" y1="0" x2="1" y2="1">
								<stop offset="0" stopColor="#0f131a" stopOpacity=".4" />
								<stop offset="1" stopColor="#b6a58a" stopOpacity=".18" />
							</linearGradient>
						</defs>
						<polygon points={base} fill="#c8c1b3" stroke="#aba497" strokeWidth=".8" />
						<polygon points={shadow} fill="#5b5146" opacity=".21" />
						{surfaces.map(({ id, transform, sun, material, width, bottom, top }) => {
							const glazingFace = material === "glass";
							const fill = glazingFace
								? `rgb(${34 + 33 * sun} ${34 + 26 * sun} ${36 + 15 * sun})`
								: { roof: "#77736c", metal: "#242523", antenna: "#cac6bd", beacon: "#9c5543" }[material];
							return (
								<g key={id} transform={transform} data-material={material}>
									<rect x={0} y={bottom} width={width} height={top - bottom} fill={fill}
										stroke={material === "antenna" ? "#827f77" : undefined} strokeWidth=".42" />
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
					</svg>
				</div>
				<footer className="tower-orbit-footer">
					<p id={helpId}>Drag to rotate and tilt.<span className="tower-orbit-key-help"> Use arrow keys for fine control.</span></p>
					<div className="tower-orbit-controls" role="group" aria-label="Tower view controls">
						<button type="button" aria-label="Rotate left" onClick={() => adjust(-30, 0)}>←</button>
						<button type="button" aria-label="Rotate right" onClick={() => adjust(30, 0)}>→</button>
						<button type="button" aria-label="Tilt up" disabled={view.pitch >= 78} onClick={() => adjust(0, 15)}>↑</button>
						<button type="button" aria-label="Tilt down" disabled={view.pitch <= 0} onClick={() => adjust(0, -15)}>↓</button>
						<button type="button" aria-label="Zoom out" disabled={view.zoom <= .75} onClick={() => adjust(0, 0, 1 / 1.2)}>−</button>
						<button type="button" aria-label="Zoom in" disabled={view.zoom >= 2.35} onClick={() => adjust(0, 0, 1.2)}>+</button>
						<button type="button" onClick={() => setView(WILLIS_ORBIT_DEFAULT)}>Reset</button>
					</div>
				</footer>
			</div>
		</dialog>
	);
}
