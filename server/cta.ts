/**
 * CTA Train Tracker proxy for the Node service, per docs/live-data-terms.md.
 *
 * The site is static, so the browser cannot hold the CTA key or call the
 * Tracker directly. This route keeps the key server-side, caches the
 * upstream's answer for theTracker's own freshness horizon, and returns an
 * honest 'available: false' payload when no key is configured, so the site
 * can degrade to the authored experience silently.
 *
 * Terms posture: credit line shown with the data, no endorsement implied,
 * no warranty relied upon, transient cache only, and the license agreement
 * is accepted by the key holder at registration.
 */

const UPSTREAM = "https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx";
const CREDIT =
	"CTA Train Tracker data provided by Chicago Transit Authority. The CTA Train Tracker logo is a trademark of Chicago Transit Authority.";

type Arrival = { line: string; destination: string; minutes: number };

type TransitPayload =
	| {
			available: true;
			station: string;
			arrivals: Arrival[];
			credit: string;
			as_of: string;
	  }
	| { available: false; reason: string; credit: string };

export function createCtaProxy(opts: { apiKey?: string; mapid: string; ttlMs: number }) {
	let cached: { payload: TransitPayload; expiresAt: number } | null = null;
	// Diagnostic only: the last raw upstream document, never containing the
	// key, exposed temporarily so clock-format bugs are visible from the
	// deployed service. Removed once /transit is verified.
	let lastRaw: unknown = null;

	/** CTA clock strings come as ISO '2026-10-26T11:28:55' (the JSON feed);
	    the space-separated '20261026 11:28:55' shape is also accepted.
	    Parsed as pseudo-UTC; the tmst-relative math below cancels whatever
	    clock zone CTA actually uses. */
	function parseCtaClock(raw: string): number {
		const m = /^(\d{4})-?(\d{2})-?(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
		if (!m) return NaN;
		return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
	}

	async function fetchArrivals(): Promise<Arrival[]> {
		const url = `${UPSTREAM}?key=${encodeURIComponent(opts.apiKey ?? "")}&mapid=${opts.mapid}&outputType=JSON`;
		const res = await fetch(url, {
			headers: { "User-Agent": "adipat2003-portfolio-service/1.0" },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`upstream ${res.status}`);
		const data: any = await res.json();
		lastRaw = data;
		const err = data?.ctatt?.errNm;
		if (err) throw new Error(String(err));
		const etas: any[] = data?.ctatt?.eta ?? [];
		const now = Date.now();
		// The Tracker reports its own clock (tmst) alongside every eta, so the
		// clock-zone offset comes from the data itself and cancels in the delta;
		// no hardcoded offset to drift across DST.
		const offsetMs = Number.isNaN(parseCtaClock(String(data?.ctatt?.tmst ?? "")))
			? 0
			: parseCtaClock(String(data.ctatt.tmst)) - now;
		const parsed = etas
			.map((eta) => {
				const dueMs = parseCtaClock(String(eta.prdt ?? ""));
				const realDueMs = Number.isNaN(dueMs) ? now : dueMs - offsetMs;
				return {
					line: String(eta.rt ?? "").toLowerCase(),
					destination: String(eta.destNm ?? ""),
					dueAt: realDueMs,
					minutes: Math.max(0, Math.min(120, Math.round((realDueMs - now) / 60_000))),
				};
			})
			.filter((a) => a.line && a.destination);
		// The feed includes trains that already left this platform; show the
		// next four actual arrivals, soonest first, keeping ones still at the
		// platform ('due') but dropping anything over a minute departed.
		const cutoff = now - 60_000;
		return parsed
			.filter((a) => a.dueAt >= cutoff)
			.sort((a, b) => a.dueAt - b.dueAt)
			.slice(0, 4)
			.map(({ line, destination, minutes }) => ({ line, destination, minutes }));
	}

	return {
		/** Diagnostic: the last raw upstream JSON (schedule data only, key never included). */
		raw(): unknown {
			return lastRaw;
		},

		async get(): Promise<TransitPayload> {
			if (!opts.apiKey) {
				return { available: false, reason: "CTA key not configured", credit: CREDIT };
			}
			const now = Date.now();
			if (cached && cached.expiresAt > now) return cached.payload;
			try {
				const arrivals = await fetchArrivals();
				const payload: TransitPayload = {
					available: true,
					station: "Clark/Lake",
					arrivals,
					credit: CREDIT,
					as_of: new Date().toISOString(),
				};
				cached = { payload, expiresAt: now + opts.ttlMs };
				return payload;
			} catch (err) {
				if (cached) return cached.payload;
				return {
					available: false,
					credit: CREDIT,
					reason: `upstream unavailable: ${err instanceof Error ? err.message : "unknown"}`,
				};
			}
		},
	};
}
