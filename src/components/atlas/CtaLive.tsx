"use client";

import { useEffect, useState } from "react";

/**
 * Live CTA arrivals in the ride, when the hosted service exists. On the
 * static Pages build SERVICE_URL is empty and this renders nothing, so the
 * ride keeps its authored experience; once NEXT_PUBLIC_SERVICE_URL points at
 * the service (with a CTA key on the service side), the strip gains real
 * 'L' arrival predictions, credit line attached, per docs/live-data-terms.md.
 */

const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";

type Arrival = { line: string; destination: string; minutes: number };

export default function CtaLive() {
	const [state, setState] = useState<{ station: string; arrivals: Arrival[] } | null>(null);

	useEffect(() => {
		if (!SERVICE_URL) return;
		let cancelled = false;

		async function poll() {
			try {
				const res = await fetch(`${SERVICE_URL}/transit`);
				if (!res.ok) return;
				const data = await res.json();
				if (cancelled || data?.available !== true) return;
				setState({
					station: String(data.station ?? ""),
					arrivals: Array.isArray(data.arrivals) ? data.arrivals.slice(0, 2) : [],
				});
			} catch {
				/* silent: the authored experience is the fallback */
			}
		}

		poll();
		const timer = window.setInterval(poll, 60_000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	if (!SERVICE_URL || !state || state.arrivals.length === 0) return null;

	return (
		<div className="cta-live" aria-label="Live CTA arrivals">
			{state.arrivals.map((a, i) => (
				<span key={`${a.line}-${a.destination}-${i}`} className="cta-chip">
					<b className={`cta-line cta-${a.line}`}>{a.line.toUpperCase()}</b> to {a.destination} ·{" "}
					{a.minutes <= 0 ? "due" : `${a.minutes} min`}
				</span>
			))}
			<span className="cta-credit">CTA Train Tracker data provided by Chicago Transit Authority</span>
		</div>
	);
}
