#!/usr/bin/env node
/**
 * Bakes content/weather.json from the latest NWS observation for Chicago
 * (Midway, KMDW). Run by the weather-bake workflow daily and by hand.
 *
 * Terms posture per docs/live-data-terms.md: NWS data is public domain, the
 * request carries a User-Agent naming the site, and the record keeps its
 * source and license so every rendered badge cites where it came from.
 * Fails loudly (exit 1) without writing when the upstream is unhappy, so a
 * stale snapshot is never silently replaced with a broken one.
 */
import { writeFileSync } from "node:fs";

const UA = "adipat2003-portfolio-bake/1.0 (https://adipat2003.github.io/portfolio)";
const OBSERVATION_URL = "https://api.weather.gov/stations/KMDW/observations/latest";

function classify(text) {
	const t = text.toLowerCase();
	if (t.includes("thunder")) return "storm";
	if (t.includes("rain") || t.includes("drizzle") || t.includes("shower")) return "rain";
	if (t.includes("snow") || t.includes("sleet") || t.includes("ice")) return "snow";
	if (t.includes("fog") || t.includes("haze") || t.includes("mist")) return "fog";
	if (t.includes("cloud") || t.includes("overcast")) return "cloudy";
	if (t.includes("clear") || t.includes("sunny") || t.includes("fair")) return "clear";
	return "cloudy";
}

const res = await fetch(OBSERVATION_URL, {
	headers: { "User-Agent": UA, Accept: "application/geo+json" },
	signal: AbortSignal.timeout(20_000),
});
if (!res.ok) {
	console.error(`weather-bake: upstream ${res.status}`);
	process.exit(1);
}
const data = await res.json();
const p = data.properties ?? {};
const tempC = p.temperature?.value;
if (typeof tempC !== "number") {
	console.error("weather-bake: no temperature in observation");
	process.exit(1);
}
const windKmh = p.windSpeed?.value;
const record = {
	source: "National Weather Service, api.weather.gov (Chicago Midway, KMDW)",
	license: "NWS data is in the public domain (weather.gov/disclaimer)",
	fetched_at: new Date().toISOString(),
	observed_at: p.timestamp ?? null,
	temperature: Math.round((tempC * 9) / 5 + 32),
	unit: "F",
	condition: p.textDescription ?? "Unknown",
	condition_kind: classify(p.textDescription ?? ""),
	wind:
		typeof windKmh === "number" ? `${Math.round(windKmh / 1.609)} mph` : null,
};

writeFileSync(
	new URL("../content/weather.json", import.meta.url),
	JSON.stringify(record, null, 2) + "\n",
);
console.log(
	`weather-bake: ${record.temperature}F, ${record.condition} (${record.condition_kind}) at ${record.observed_at}`,
);
