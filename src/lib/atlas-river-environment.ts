const LATITUDE = 41.8848;
const LONGITUDE = -87.6325;
const CHICAGO = "America/Chicago";
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const MAX_OBSERVATION_AGE = 2 * 60 * 60 * 1000;
const STATION_URL = "https://api.weather.gov/stations/KMDW/observations/latest";

type Direction = readonly [east: number, up: number, south: number];

type CelestialBody = {
  direction: Direction;
  /** Degrees clockwise from true north. */
  azimuth: number;
  /** Geometric elevation in degrees, before atmospheric refraction. */
  elevation: number;
  /** Angular diameter in degrees as seen from Chicago. */
  angularDiameter: number;
  distanceKm: number;
};

type Precipitation = "rain" | "snow" | "mixed" | "none";

export type RiverObservation = {
  observedAt: string;
  description: string | null;
  cloudCover: number | null;
  visibilityKm: number | null;
  windSpeedKmh: number | null;
  windFromDegrees: number | null;
  precipitation: Precipitation | null;
  temperatureC: number | null;
};

type RiverWeather = {
  status: "current" | "stale" | "unavailable";
} & Omit<RiverObservation, "observedAt"> & { observedAt: string | null };

const noWeather: RiverWeather = {
  status: "unavailable",
  observedAt: null,
  description: null,
  cloudCover: null,
  visibilityKm: null,
  windSpeedKmh: null,
  windFromDegrees: null,
  precipitation: null,
  temperatureC: null,
};

const sin = (degrees: number) => Math.sin(degrees * RAD);
const cos = (degrees: number) => Math.cos(degrees * RAD);
const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;
const normalize = (value: number) => Math.max(0, Math.min(1, value));

function fade(value: number, start: number, end: number) {
  const t = normalize((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function solarOrbit(days: number) {
  const perihelion = 282.9404 + 4.70935e-5 * days;
  const eccentricity = 0.016709 - 1.151e-9 * days;
  const anomaly = wrap(356.047 + 0.9856002585 * days);
  const eccentricAnomaly = anomaly + eccentricity * sin(anomaly) * (1 + eccentricity * cos(anomaly)) / RAD;
  const x = cos(eccentricAnomaly) - eccentricity;
  const y = Math.sqrt(1 - eccentricity ** 2) * sin(eccentricAnomaly);
  return {
    anomaly,
    meanLongitude: anomaly + perihelion,
    longitude: Math.atan2(y, x) / RAD + perihelion,
    distance: Math.hypot(x, y),
  };
}

// The leading lunar perturbations and orbital elements follow Paul Schlyter's
// low-precision ephemeris. https://stjarnhimlen.se/comp/ppcomp.html
function lunarOrbit(days: number, sun: ReturnType<typeof solarOrbit>) {
  const node = wrap(125.1228 - 0.0529538083 * days);
  const inclination = 5.1454;
  const perihelion = wrap(318.0634 + 0.1643573223 * days);
  const anomaly = wrap(115.3654 + 13.0649929509 * days);
  const eccentricity = 0.0549;
  let eccentricAnomaly = anomaly * RAD;
  for (let i = 0; i < 3; i++) {
    eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - anomaly * RAD) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }
  const x = Math.cos(eccentricAnomaly) - eccentricity;
  const y = Math.sqrt(1 - eccentricity ** 2) * Math.sin(eccentricAnomaly);
  const orbitalLongitude = Math.atan2(y, x) / RAD + perihelion;
  const elongation = node + perihelion + anomaly - sun.meanLongitude;
  const argument = perihelion + anomaly;
  const twiceElongation = 2 * elongation;
  const longitude = node + Math.atan2(sin(orbitalLongitude) * cos(inclination), cos(orbitalLongitude)) / RAD
    - 1.274 * sin(anomaly - twiceElongation) + 0.658 * sin(twiceElongation)
    - 0.186 * sin(sun.anomaly) - 0.059 * sin(2 * anomaly - twiceElongation)
    - 0.057 * sin(anomaly - twiceElongation + sun.anomaly) + 0.053 * sin(anomaly + twiceElongation)
    + 0.046 * sin(twiceElongation - sun.anomaly) + 0.041 * sin(anomaly - sun.anomaly)
    - 0.035 * sin(elongation) - 0.031 * sin(anomaly + sun.anomaly)
    - 0.015 * sin(2 * argument - twiceElongation) + 0.011 * sin(anomaly - 2 * twiceElongation);
  const latitude = Math.asin(sin(orbitalLongitude) * sin(inclination)) / RAD
    - 0.173 * sin(argument - twiceElongation) - 0.055 * sin(anomaly - argument - twiceElongation)
    - 0.046 * sin(anomaly + argument - twiceElongation) + 0.033 * sin(argument + twiceElongation)
    + 0.017 * sin(2 * anomaly + argument);
  const distance = 60.2666 * Math.hypot(x, y)
    - 0.58 * cos(anomaly - twiceElongation) - 0.46 * cos(twiceElongation);
  return { longitude, latitude, distance };
}

function celestialBody(
  longitude: number, latitude: number, rangeKm: number, bodyRadiusKm: number,
  obliquity: number, localSiderealTime: number,
): CelestialBody {
  const eclipticX = cos(longitude) * cos(latitude) * rangeKm;
  const eclipticY = sin(longitude) * cos(latitude) * rangeKm;
  const eclipticZ = sin(latitude) * rangeKm;
  const equatorialY = eclipticY * cos(obliquity) - eclipticZ * sin(obliquity);
  const equatorialZ = eclipticY * sin(obliquity) + eclipticZ * cos(obliquity);
  const east = -eclipticX * sin(localSiderealTime) + equatorialY * cos(localSiderealTime);
  const acrossMeridian = eclipticX * cos(localSiderealTime) + equatorialY * sin(localSiderealTime);
  const north = equatorialZ * cos(LATITUDE) - acrossMeridian * sin(LATITUDE);
  const up = equatorialZ * sin(LATITUDE) + acrossMeridian * cos(LATITUDE);
  const earthRadiusKm = 6378.137;
  const earthEccentricitySquared = 0.00669438;
  const primeVerticalRadius = earthRadiusKm / Math.sqrt(1 - earthEccentricitySquared * sin(LATITUDE) ** 2);
  const observerNorth = -primeVerticalRadius * earthEccentricitySquared * sin(LATITUDE) * cos(LATITUDE);
  const observerUp = primeVerticalRadius * (1 - earthEccentricitySquared * sin(LATITUDE) ** 2) + 0.18;
  const localNorth = north - observerNorth;
  const localUp = up - observerUp;
  const distance = Math.hypot(east, localNorth, localUp);
  return {
    direction: [east / distance, localUp / distance, -localNorth / distance],
    azimuth: wrap(Math.atan2(east, localNorth) / RAD),
    elevation: Math.atan2(localUp, Math.hypot(east, localNorth)) / RAD,
    angularDiameter: 2 * Math.asin(bodyRadiusKm / distance) / RAD,
    distanceKm: distance,
  };
}

const chicagoMonthDay = new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, month: "numeric", day: "numeric" });

function foliageAt(now: Date) {
  // Calendar interpolation estimates canopy appearance until local foliage observations are available.
  const [month, day] = chicagoMonthDay.format(now).split("/").map(Number);
  const annualDay = Date.UTC(2025, month - 1, day) / DAY_MS;
  const date = (m: number, d: number) => Date.UTC(2025, m - 1, d) / DAY_MS;
  const growing = fade(annualDay, date(4, 8), date(5, 22));
  const falling = fade(annualDay, date(9, 28), date(11, 14));
  return {
    cover: growing * (1 - falling),
    autumn: fade(annualDay, date(9, 15), date(10, 23)),
  };
}

function currentWeather(now: Date, observation?: RiverObservation | null): RiverWeather {
  if (!observation) return noWeather;
  const age = +now - Date.parse(observation.observedAt);
  if (!Number.isFinite(age) || age < -10 * 60_000) return noWeather;
  if (age > MAX_OBSERVATION_AGE) {
    return { ...noWeather, status: "stale", observedAt: observation.observedAt };
  }
  return { ...observation, status: "current" };
}

export function getRiverEnvironment(now: Date, observation?: RiverObservation | null) {
  const days = now.getTime() / DAY_MS + 2440587.5 - 2451543.5;
  const obliquity = 23.4393 - 3.563e-7 * days;
  const localSidereal = wrap(280.46061837 + 360.98564736629 * (days - 1.5) + LONGITUDE);
  const solar = solarOrbit(days);
  const lunar = lunarOrbit(days, solar);
  const sunRangeKm = solar.distance * 149_597_870.7;
  const moonRangeKm = lunar.distance * 6378.137;
  const sun = celestialBody(solar.longitude, 0, sunRangeKm, 695_700, obliquity, localSidereal);
  const moon = celestialBody(lunar.longitude, lunar.latitude, moonRangeKm, 1737.4, obliquity, localSidereal);
  const cosineSeparation = sun.direction.reduce((total, direction, i) => total + direction * moon.direction[i], 0);
  const phaseAngle = Math.atan2(
    sun.distanceKm * Math.sqrt(Math.max(0, 1 - cosineSeparation ** 2)),
    moon.distanceKm - sun.distanceKm * cosineSeparation,
  );
  const daylight = fade(sun.elevation, -5, 8);
  const night = 1 - fade(sun.elevation, -16, -3);
  return {
    sun,
    moon: {
      ...moon,
      illumination: (1 + Math.cos(phaseAngle)) / 2,
      waxing: wrap(lunar.longitude - solar.longitude) < 180,
    },
    daylight,
    twilight: (1 - daylight) * (1 - night),
    night,
    foliage: foliageAt(now),
    weather: currentWeather(now, observation),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function measure(value: unknown, unit: string): number | null {
  const quantity = record(value);
  return quantity.unitCode === unit && typeof quantity.value === "number" && Number.isFinite(quantity.value)
    ? quantity.value
    : null;
}

const skyAmount: Record<string, number> = { CLR: 0, SKC: 0, FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, VV: 1 };

function reportedPrecipitation(weatherText: string): Precipitation {
  const snow = /\b(?:snow|ice pellets|ice crystals|sleet|wintry)\b/i.test(weatherText);
  const rain = /\b(?:rain|drizzle)\b/i.test(weatherText);
  if (snow && rain) return "mixed";
  if (snow) return "snow";
  return rain ? "rain" : "none";
}

export function parseRiverObservation(payload: unknown): RiverObservation | null {
  const properties = record(record(payload).properties);
  const observedAt = properties.timestamp;
  if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) return null;
  const description = typeof properties.textDescription === "string" && properties.textDescription.trim()
    ? properties.textDescription.trim()
    : null;
  const presentWeather = Array.isArray(properties.presentWeather)
    ? properties.presentWeather.map(record).filter((event) => typeof event.weather === "string")
    : [];
  const localPhenomena = presentWeather.filter((event) => event.inVicinity !== true)
    .map((event) => String(event.weather).replaceAll("_", " ")).join(" ");
  const cloudLayers = Array.isArray(properties.cloudLayers)
    ? properties.cloudLayers.flatMap((layer) => {
      const amount = record(layer).amount;
      return typeof amount === "string" && Object.hasOwn(skyAmount, amount) ? [skyAmount[amount]] : [];
    })
    : [];
  const visibility = measure(properties.visibility, "wmoUnit:m");
  const windSpeed = measure(properties.windSpeed, "wmoUnit:km_h-1");
  const windDirection = measure(properties.windDirection, "wmoUnit:degree_(angle)");
  const observation = {
    observedAt,
    description,
    cloudCover: cloudLayers.length ? Math.max(...cloudLayers) : null,
    visibilityKm: visibility === null || visibility < 0 ? null : visibility / 1000,
    windSpeedKmh: windSpeed === null || windSpeed < 0 ? null : windSpeed,
    windFromDegrees: windDirection === null || windDirection < 0 || windDirection > 360 ? null : windDirection % 360,
    precipitation: presentWeather.length
      ? reportedPrecipitation(localPhenomena)
      : description ? reportedPrecipitation(description) : null,
    temperatureC: measure(properties.temperature, "wmoUnit:degC"),
  };
  return Object.entries(observation).some(([key, value]) => key !== "observedAt" && value !== null) ? observation : null;
}

export async function fetchRiverObservation(signal?: AbortSignal): Promise<RiverObservation | null> {
  const controller = new AbortController();
  if (signal?.aborted) return null;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  try {
    const response = await fetch(STATION_URL, { signal: controller.signal });
    return response.ok ? parseRiverObservation(await response.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
