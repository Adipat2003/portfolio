import { weather } from "@/content/weather";

/**
 * The "Chicago right now" line, rendered on both facades from the same baked
 * NWS snapshot, so the Atlas never holds information the Dispatch does not.
 * It always carries the source and its observation time, so freshness is
 * visible rather than implied.
 */
function observed(iso: string): string {
	return new Date(iso).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: "America/Chicago",
	});
}

export default function WeatherBadge({ className }: { className?: string }) {
	const stamp = weather.observed_at ?? weather.fetched_at;
	return (
		<p className={className ?? "weather-badge"}>
			<b>
				{weather.temperature}
				&deg;F
			</b>{" "}
			{weather.condition} in Chicago
			<span className="weather-src">
				NWS, observed {observed(stamp)} CT
			</span>
		</p>
	);
}
