const CREDIT = "CTA Train Tracker data provided by Chicago Transit Authority. No CTA endorsement.";
const ROUTES = ["red", "blue", "brn", "g", "org", "p", "pink", "y"];
const flag = (value: unknown) => value === true || value === 1 || value === "1";
const list = (value: any): any[] => Array.isArray(value) ? value : value ? [value] : [];

/** One bounded request per feed, including concurrent cold-cache readers. */
function cachedFeed<T>(load: () => Promise<T>, ttlMs: number, empty: T) {
	let cached: { payload: T; expiresAt: number } | undefined;
	let pending: Promise<T> | undefined;
	return async (): Promise<T> => {
		if (cached && cached.expiresAt > Date.now()) return cached.payload;
		if (!pending) {
			pending = load().then((payload) => {
				cached = { payload, expiresAt: Date.now() + ttlMs };
				return payload;
			}).catch(() => empty).finally(() => { pending = undefined; });
		}
		return pending;
	};
}

async function request(url: string) {
	const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "adipat2003-portfolio-service/1.0" } });
	if (!response.ok) throw new Error("CTA unavailable");
	return response.json();
}

export type TrainPosition = {
	id: string; route: string; lat: number; lon: number; heading: number;
	destination: string; nextStation: string; nextStationId: string; arrivalTime: string;
	isApproaching: boolean; isDelayed: boolean; isScheduled: boolean;
};
export type Positions = { available: boolean; trains: TrainPosition[]; as_of: string; credit: string };
export type Alerts = { available: boolean; routes: { route: string; status: string }[]; as_of: string; credit: string };

export type Disruption = { id: string; headline: string; description: string; impact: string; severity: number; routes: string[]; stations: string[]; url: string };
export type Disruptions = { available: boolean; alerts: Disruption[]; as_of: string };
const plain = (value: unknown) => String(typeof value === "object" && value ? (value as Record<string, unknown>)["#cdata-section"] ?? "" : value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function createCtaNetworkProxy(opts: { apiKey?: string; ttlMs?: number }) {
	const positions = cachedFeed<Positions>(async () => {
		if (!opts.apiKey) throw new Error("CTA not configured");
		const data = await request(`https://lapi.transitchicago.com/api/1.0/ttpositions.aspx?key=${encodeURIComponent(opts.apiKey)}&rt=${ROUTES.join(",")}&outputType=JSON`);
		if (!data?.ctatt || Number(data.ctatt.errCd) !== 0) throw new Error("CTA error");
		const trains: TrainPosition[] = [];
		for (const entry of list(data.ctatt.route)) {
			const route = String(entry["@name"] ?? "").toLowerCase();
			if (!ROUTES.includes(route)) continue;
			for (const raw of list(entry.train)) {
				const lat = Number(raw.lat), lon = Number(raw.lon), heading = Number(raw.heading);
				if (!/^\d{1,5}$/.test(String(raw.rn)) || raw.lat == null || raw.lon == null ||
					!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 41.65 || lat > 42.12 || lon < -87.95 || lon > -87.5 ||
					!Number.isFinite(heading) || heading < 0 || heading >= 360 || flag(raw.isSch)) continue;
				trains.push({ id: `${route}-${raw.rn}`, route, lat, lon, heading,
					destination: String(raw.destNm ?? "").slice(0, 100), nextStation: String(raw.nextStaNm ?? "").slice(0, 100),
					nextStationId: String(raw.nextStaId ?? "").slice(0, 5), arrivalTime: String(raw.arrT ?? "").slice(0, 30),
					isApproaching: flag(raw.isApp), isDelayed: flag(raw.isDly), isScheduled: flag(raw.isSch) });
			}
		}
		return { available: true, trains, as_of: new Date().toISOString(), credit: CREDIT };
	}, opts.ttlMs ?? 15_000, { available: false, trains: [], as_of: "", credit: CREDIT });
	const alerts = cachedFeed<Alerts>(async () => {
		const data = await request("https://lapi.transitchicago.com/api/1.0/routes.aspx?type=rail&outputType=JSON");
		if (!data?.CTARoutes || Number(data.CTARoutes.ErrorCode) !== 0) throw new Error("CTA alerts unavailable");
		const routes = list(data.CTARoutes.RouteInfo).map((raw) => ({
			route: String(raw.ServiceId ?? "").toLowerCase(), status: String(raw.RouteStatus ?? "").slice(0, 100),
		})).filter((r) => ROUTES.includes(r.route) || r.route === "pexp");
		return { available: true, routes, as_of: new Date().toISOString(), credit: "Service status: Chicago Transit Authority" };
	}, 60_000, { available: false, routes: [], as_of: "", credit: "Service status: Chicago Transit Authority" });
	const disruptions = cachedFeed<Disruptions>(async () => {
		const data = await request(`https://lapi.transitchicago.com/api/1.0/alerts.aspx?routeid=${ROUTES.join(",")},pexp&activeonly=true&outputType=JSON`);
		if (!data?.CTAAlerts || Number(data.CTAAlerts.ErrorCode) !== 0) throw new Error("CTA disruptions unavailable");
		const entries = list(data.CTAAlerts.Alert).slice(0, 100).map((raw) => {
			const services = list(raw.ImpactedService?.Service);
			const id = String(raw.AlertId ?? raw.AlertID ?? "");
			return { id, headline: plain(raw.Headline).slice(0, 180), description: plain(raw.ShortDescription).slice(0, 1200),
				impact: plain(raw.Impact).slice(0, 80), severity: Math.max(0, Math.min(99, Number(raw.SeverityScore) || 0)),
				routes: services.filter((service) => service.ServiceType === "R").map((service) => String(service.ServiceId).toLowerCase()),
				stations: services.filter((service) => service.ServiceType === "T").map((service) => String(service.ServiceId)),
				url: `https://www.transitchicago.com/travel_information/alert_detail.aspx?AlertId=${encodeURIComponent(id)}` };
		}).filter((entry) => /^\d{1,10}$/.test(entry.id) && entry.headline).sort((a, b) => b.severity - a.severity);
		return { available: true, alerts: entries, as_of: new Date().toISOString() };
	}, 60_000, { available: false, alerts: [], as_of: "" });
	return { positions, alerts, disruptions };
}
