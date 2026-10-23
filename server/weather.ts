/**
 * NWS weather proxy for the Chicago layer, per docs/live-data-terms.md.
 *
 * Terms posture: NWS information is public domain; the proxy identifies
 * itself with a User-Agent naming the site (the contact surface NWS
 * requests), honors the cache-friendly expiry the API was designed around,
 * and serves a stale cached answer with a clear status rather than an error
 * when the upstream is unavailable.
 */
const POINT_URL = "https://api.weather.gov/points/41.8781,-87.6298";
const USER_AGENT =
	"adipat2003-portfolio-proxy/1.0 (https://adipat2003.github.io/portfolio)";

export type WeatherPeriod = {
	name: string;
	temperature: number | null;
	temperatureUnit: string | null;
	windSpeed: string | null;
	shortForecast: string | null;
};

export type WeatherPayload = {
	source: "National Weather Service, api.weather.gov";
	license: "NWS data is in the public domain (weather.gov/disclaimer)";
	fetched_at: string;
	expires_at: string;
	fresh: boolean;
	periods: WeatherPeriod[];
};

type CacheEntry = { payload: WeatherPayload; expiresAt: number };

export function createWeatherProxy(opts: { minTtlMs: number; maxTtlMs: number }) {
	let cache: CacheEntry | null = null;

	async function fetchJson(url: string): Promise<{ json: any; cacheControl: string }> {
		const res = await fetch(url, {
			headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`upstream ${res.status}`);
		return { json: await res.json(), cacheControl: res.headers.get("cache-control") ?? "" };
	}

	function ttlFrom(cacheControl: string): number {
		const match = /max-age=(\d+)/.exec(cacheControl);
		const ttl = match ? Number(match[1]) * 1000 : 300_000;
		return Math.min(Math.max(ttl, opts.minTtlMs), opts.maxTtlMs);
	}

	function wrap(periods: WeatherPeriod[], fetchedAt: number, expiresAt: number, fresh: boolean): WeatherPayload {
		return {
			source: "National Weather Service, api.weather.gov",
			license: "NWS data is in the public domain (weather.gov/disclaimer)",
			fetched_at: new Date(fetchedAt).toISOString(),
			expires_at: new Date(expiresAt).toISOString(),
			fresh,
			periods,
		};
	}

	return {
		async get(): Promise<{ status: number; body: WeatherPayload | { error: string } }> {
			const now = Date.now();
			if (cache && cache.expiresAt > now) {
				return { status: 200, body: cache.payload };
			}
			try {
				const points = await fetchJson(POINT_URL);
				const forecastUrl: string | undefined = points.json?.properties?.forecast;
				if (!forecastUrl) throw new Error("no forecast url in points response");
				const forecast = await fetchJson(forecastUrl);
				const raw: any[] = forecast.json?.properties?.periods ?? [];
				const periods: WeatherPeriod[] = raw.slice(0, 6).map((p) => ({
					name: p.name ?? null,
					temperature: p.temperature ?? null,
					temperatureUnit: p.temperatureUnit ?? null,
					windSpeed: p.windSpeed ?? null,
					shortForecast: p.shortForecast ?? null,
				}));
				const ttl = ttlFrom(forecast.cacheControl);
				const payload = wrap(periods, now, now + ttl, true);
				cache = { payload, expiresAt: now + ttl };
				return { status: 200, body: payload };
			} catch (err) {
				if (cache) {
					return { status: 200, body: { ...cache.payload, fresh: false } };
				}
				return {
					status: 502,
					body: { error: "weather upstream unavailable" },
				};
			}
		},

		cacheState(): { cached: boolean; expiresAt: number | null } {
			return { cached: cache !== null, expiresAt: cache ? cache.expiresAt : null };
		},
	};
}
