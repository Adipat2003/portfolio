import { getRiverEnvironment } from "./atlas-river-environment";
import type { RiverObservation } from "./atlas-river-environment";

export type RiverTime = "live" | "dawn" | "daylight" | "dusk" | "night";
export type RiverWeatherMode = "live" | "clear" | "overcast" | "rain" | "snow";
export type RiverSeason = "auto" | "spring" | "summer" | "autumn" | "winter";

type RiverEnvironment = ReturnType<typeof getRiverEnvironment>;

const chicagoClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
});

const HOUR = 3_600_000;
const seasonDates = { spring: [4, 29], summer: [7, 15], autumn: [10, 18], winter: [1, 20] } as const;
const weatherPresets = {
  clear: { cloudCover: 0.08, visibilityKm: 24, windSpeedKmh: 8, precipitation: "none" },
  overcast: { cloudCover: 0.98, visibilityKm: 12, windSpeedKmh: 12, precipitation: "none" },
  rain: { cloudCover: 0.96, visibilityKm: 4, windSpeedKmh: 21, precipitation: "rain" },
  snow: { cloudCover: 0.96, visibilityKm: 3, windSpeedKmh: 18, precipitation: "snow" },
} as const;

function previewDate(now: Date, time: RiverTime, season: RiverSeason) {
  const parts = chicagoClock.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const [month, day] = season === "auto" ? [value("month"), value("day")] : seasonDates[season];
  const afternoonUtc = Date.UTC(value("year"), month - 1, day, 18);
  // The representative dates avoid DST transitions. Local noon also gives a
  // reliable reference on transition days when the current season is selected.
  const hourAtAfternoon = chicagoClock.formatToParts(afternoonUtc).find((part) => part.type === "hour");
  const noon = afternoonUtc + (12 - Number(hourAtAfternoon?.value)) * HOUR;
  if (time === "live") {
    return new Date(noon + (value("hour") - 12) * HOUR + value("minute") * 60_000 + value("second") * 1000);
  }
  if (time === "daylight") return new Date(noon);
  if (time === "night") return new Date(noon + 11 * HOUR);

  const dawn = time === "dawn";
  let early = dawn ? noon - 12 * HOUR : noon;
  let late = dawn ? noon : noon + 12 * HOUR;
  while (late - early > 1000) {
    const mid = (early + late) / 2;
    const belowTwilight = getRiverEnvironment(new Date(mid)).sun.elevation < -5;
    if (belowTwilight === dawn) early = mid;
    else late = mid;
  }
  return new Date((early + late) / 2);
}

export function riverPreview(
  now: Date,
  observation: RiverObservation | null,
  time: RiverTime,
  weather: RiverWeatherMode,
  season: RiverSeason,
): { env: RiverEnvironment; snow: number; simulated: boolean } {
  const live = getRiverEnvironment(now, observation);
  const sky = time === "live" && season === "auto" ? live : getRiverEnvironment(previewDate(now, time, season));
  const conditions = weather === "live" ? live.weather : {
    status: "unavailable" as const,
    observedAt: null,
    description: null,
    windFromDegrees: null,
    temperatureC: null,
    ...weatherPresets[weather],
  };
  return {
    env: { ...sky, weather: conditions },
    snow: weather === "snow" ? 0.85 : 0,
    simulated: time !== "live" || weather !== "live" || season !== "auto",
  };
}
