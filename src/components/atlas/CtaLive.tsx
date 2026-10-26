"use client";

import { useEffect, useState } from "react";

/**
 * Live CTA arrivals in the ride, when the hosted service exists. On the
 * static Pages build SERVICE_URL is empty and this renders nothing, so the
 * ride keeps its authored experience; once NEXT_PUBLIC_SERVICE_URL points at
 * the service (with a CTA key on the service side), the strip gains real
 * 'L' arrival predictions, credit line attached, per docs/live-data-terms.md.
 *
 * Clark/Lake is a hub where trains are often boarding, so the strip shows
 * four arrivals, not two: the spread of minutes is the proof of life. The
 * as-of clock makes the freshness legible, and until the first successful
 * poll the strip says it is connecting rather than sitting blank.
 */

const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";

type Arrival = { line: string; destination: string; minutes: number };
type Payload = { station: string; arrivals: Arrival[]; asOf: string };

function clockOf(iso: string): string {
	try {
		return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	} catch {
		return "";
	}
}

export default function CtaLive() {
	const [state, setState] = useState<Payload | null>(null);

	useEffect(() => {
		if (!SERVICE_URL) return;
		let cancelled = false;
		let timer = 0;
		let live = false;

		async function poll() {
			try {
				const res = await fetch(`${SERVICE_URL}/transit`);
				if (!res.ok) return;
				const data = await res.json();
				if (cancelled || data?.available !== true) return;
				live = true;
				setState({
					station: String(data.station ?? ""),
					arrivals: Array.isArray(data.arrivals) ? data.arrivals.slice(0, 4) : [],
					asOf: clockOf(String(data.as_of ?? "")),
				});
			} catch {
				/* silent: the authored experience is the fallback */
			} finally {
				if (!cancelled) {
					// Before the first success the service may be waking from
					// a cold start, so retry quickly; once live, the CTA's own
					// 45-second freshness horizon makes a minute the right pace.
					timer = window.setTimeout(poll, live ? 60_000 : 10_000);
				}
			}
		}

		poll();
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	if (!SERVICE_URL) return null;

	if (!state || state.arrivals.length === 0) {
		return (
			<div className="cta-live cta-connecting" aria-live="polite">
				connecting to live &rsquo;L&rsquo; arrivals&hellip;
			</div>
		);
	}

	return (
		<div className="cta-live" aria-label="Live CTA arrivals">
			{state.arrivals.map((a, i) => (
				<span key={`${a.line}-${a.destination}-${i}`} className="cta-chip">
					<b className={`cta-line cta-${a.line}`}>{a.line.toUpperCase()}</b> to {a.destination} ·{" "}
					{a.minutes <= 0 ? "due" : `${a.minutes} min`}
				</span>
			))}
			{state.asOf ? (
				<span className="cta-asof">
					{state.station} · as of {state.asOf}
				</span>
			) : null}
			<span className="cta-credit">CTA Train Tracker data provided by Chicago Transit Authority</span>
		</div>
	);
}
