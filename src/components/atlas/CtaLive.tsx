"use client";

import { useEffect, useState } from "react";

/**
 * Live CTA departures, when the hosted service exists. On the static Pages
 * build SERVICE_URL is empty and this renders nothing; once
 * NEXT_PUBLIC_SERVICE_URL points at the service (with a CTA key on the
 * service side), the booth gains a real departure board, credit line
 * attached, per docs/live-data-terms.md.
 *
 * Where it lives: inside the terminal card, as a solari departure board
 * strip above the ask panel. The ride ends at Clark/Lake, so the live board
 * is the station's own: you ask the agent under the actual departures for
 * the station you are standing in. One compact row that wraps inside the
 * card it belongs to, never a screen-blocking block.
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
					arrivals: Array.isArray(data.arrivals) ? data.arrivals.slice(0, 3) : [],
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
			<div className="departures departures-connecting" aria-live="polite">
				<span className="departures-head">{state?.station || "CLARK/LAKE"}</span>
				<span className="departures-note">connecting to live &rsquo;L&rsquo; departures&hellip;</span>
			</div>
		);
	}

	return (
		<div className="departures" aria-label="Live CTA departures">
			<span className="departures-head">{state.station || "CLARK/LAKE"}</span>
			<span className="departures-list">
				{state.arrivals.map((a, i) => (
					<span key={`${a.line}-${a.destination}-${i}`} className="departure">
						<b className={`cta-line cta-${a.line}`}>{a.line.toUpperCase()}</b>
						<span className="departure-dest">{a.destination}</span>
						<span className="departure-min">{a.minutes <= 0 ? "due" : `${a.minutes}m`}</span>
					</span>
				))}
			</span>
			{state.asOf ? <span className="departures-asof">as of {state.asOf}</span> : null}
			<span className="cta-credit">CTA Train Tracker data provided by Chicago Transit Authority</span>
		</div>
	);
}
