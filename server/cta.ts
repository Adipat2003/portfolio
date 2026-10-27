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
export const CREDIT =
	"CTA Train Tracker data provided by Chicago Transit Authority. The CTA Train Tracker logo is a trademark of Chicago Transit Authority.";

type CtaStation = { id: string; name: string };
type Arrival = {
	line: string;
	destination: string;
	direction: string;
	minutes: number;
	isApproaching: boolean;
	isDelayed: boolean;
	isScheduled: boolean;
};

const LOOP_STATIONS: CtaStation[] = [
	{ id: "40380", name: "Clark/Lake" },
	{ id: "40260", name: "State/Lake" },
	{ id: "40730", name: "Washington/Wells" },
	{ id: "40040", name: "Quincy/Wells" },
];

type TransitPayload =
	| {
			available: true;
			station: string;
			station_id: string;
			stations: CtaStation[];
			arrivals: Arrival[];
			credit: string;
			as_of: string;
	  }
	| {
			available: false;
			reason: string;
			station: string;
			station_id: string;
			stations: CtaStation[];
			credit: string;
	  };

export function createCtaProxy(opts: { apiKey?: string; mapid: string; ttlMs: number; extraStations?: CtaStation[] }) {
	const stations = [
		...(LOOP_STATIONS.some((station) => station.id === opts.mapid)
			? []
			: [{ id: opts.mapid, name: "Configured station" }]),
		...LOOP_STATIONS,
	];
	const allowedStations = [...stations, ...(opts.extraStations ?? [])];
	const pending = new Map<string, Promise<TransitPayload>>();
	const cache = new Map<string, { payload: TransitPayload; expiresAt: number }>();

	/** CTA clock strings come as ISO '2026-10-26T11:28:55' (the JSON feed);
	    the space-separated '20261026 11:28:55' shape is also accepted.
	    Parsed as pseudo-UTC; the arrT/prdt difference cancels whatever
	    clock zone CTA actually uses. */
	function parseCtaClock(raw: string): number {
		const m = /^(\d{4})-?(\d{2})-?(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
		if (!m) return NaN;
		return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
	}

	async function fetchArrivals(station: CtaStation): Promise<Arrival[]> {
		const url = `${UPSTREAM}?key=${encodeURIComponent(opts.apiKey ?? "")}&mapid=${station.id}&outputType=JSON`;
		const res = await fetch(url, {
			headers: { "User-Agent": "adipat2003-portfolio-service/1.0" },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`upstream ${res.status}`);
		const data: any = await res.json();
		const err = data?.ctatt?.errNm;
		if (err) throw new Error(String(err));
		const etas: any[] = data?.ctatt?.eta ?? [];
		const parsed = etas
			.map((eta) => {
				// CTA gives prediction creation (prdt) and expected arrival (arrT).
				const dueAt = parseCtaClock(String(eta.arrT ?? ""));
				const remainingMs = dueAt - parseCtaClock(String(eta.prdt ?? ""));
				return {
					line: String(eta.rt ?? "").toLowerCase(),
					destination: String(eta.destNm ?? ""),
					direction: String(eta.stpDe ?? ""),
					dueAt,
					remainingMs,
					minutes: Math.max(0, Math.min(120, Math.round(remainingMs / 60_000))),
					isApproaching: eta.isApp === 1 || eta.isApp === "1" || eta.isApp === true,
					isDelayed: eta.isDly === 1 || eta.isDly === "1" || eta.isDly === true,
					isScheduled: eta.isSch === 1 || eta.isSch === "1" || eta.isSch === true,
				};
			})
			.filter((a) => a.line && a.destination && Number.isFinite(a.remainingMs));
		// The feed includes trains that already left this platform; show the
		// next four actual arrivals, soonest first, keeping ones still at the
		// platform ('due') but dropping anything over a minute departed.
		return parsed
			.filter((a) => a.remainingMs >= -60_000)
			.sort((a, b) => a.dueAt - b.dueAt)
			.slice(0, 4)
			.map(({ line, destination, direction, minutes, isApproaching, isDelayed, isScheduled }) => ({
				line,
				destination,
				direction,
				minutes,
				isApproaching,
				isDelayed,
				isScheduled,
			}));
	}

	return {
		stations,
		hasStation(id: string): boolean {
			return allowedStations.some((station) => station.id === id);
		},
		async get(stationId = opts.mapid): Promise<TransitPayload> {
			const station = allowedStations.find((candidate) => candidate.id === stationId);
			if (!station) throw new Error("unknown CTA station");
			if (!opts.apiKey) {
				return {
					available: false,
					reason: "CTA key not configured",
					station: station.name,
					station_id: station.id,
					stations,
					credit: CREDIT,
				};
			}
			const now = Date.now();
			const cached = cache.get(station.id);
			if (cached && cached.expiresAt > now) return cached.payload;
			if (pending.has(station.id)) return pending.get(station.id)!;
			const request = (async (): Promise<TransitPayload> => {
			try {
				const arrivals = await fetchArrivals(station);
				const payload: TransitPayload = {
					available: true,
					station: station.name,
					station_id: station.id,
					stations,
					arrivals,
					credit: CREDIT,
					as_of: new Date().toISOString(),
				};
				cache.set(station.id, { payload, expiresAt: now + opts.ttlMs });
				return payload;
			} catch {
				return {
					available: false,
					credit: CREDIT,
					station: station.name,
					station_id: station.id,
					stations,
					reason: "CTA upstream unavailable",
				};
			}
			})();
			pending.set(station.id, request);
			try { return await request; } finally { pending.delete(station.id); }
		},
	};
}
