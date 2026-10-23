"use client";

import { useRef } from "react";

/**
 * The full-bleed Atlas night scene. The only client behavior in PR 1: a warm
 * cursor light that follows fine pointers, written as CSS custom properties
 * on the scene element. It is decorative, inert for keyboards and touch, and
 * hidden entirely under prefers-reduced-motion.
 */
export default function AtlasScene({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
		const el = ref.current;
		if (!el || event.pointerType !== "mouse") return;
		const rect = el.getBoundingClientRect();
		el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
		el.style.setProperty("--my", `${event.clientY - rect.top}px`);
	}

	return (
		<div className="atlas-scene" ref={ref} onPointerMove={onPointerMove}>
			{children}
			<div className="cursor-light" aria-hidden="true" />
		</div>
	);
}
