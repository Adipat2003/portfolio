import assert from "node:assert/strict";
import { fetchRiverObservation, getRiverEnvironment, parseRiverObservation } from "../src/lib/atlas-river-environment.ts";

// JPL Horizons observer ephemerides for 41.8848 N, 87.6325 W, 0.18 km.
// Targets Sun (10) and Moon (301), airless elevation, quantities 4, 10, 13.
// https://ssd.jpl.nasa.gov/horizons/manual.html
const fixtures = [
  ["2026-06-21T00:00Z", [289.062799, 14.027179, 1887.948], [199.565887, 49.012639, 1894.614, 40.69336]],
  ["2026-06-21T06:00Z", [1.945239, -24.655125, 1887.868], [277.815678, -7.222241, 1859.766, 42.89169]],
  ["2026-06-21T18:00Z", [185.495442, 71.483976, 1887.921], [94.198761, 1.536262, 1850.523, 49.21557]],
  ["2026-12-21T00:00Z", [253.872840, -17.473762, 1950.039], [108.393638, 50.038898, 1979.186, 86.79945]],
  ["2026-12-21T06:00Z", [8.313557, -71.396134, 1950.021], [258.149092, 46.385024, 1985.153, 88.14991]],
  ["2026-12-21T18:00Z", [182.846052, 24.623446, 1950.208], [36.256450, -15.431077, 1964.502, 92.15118]],
];

function near(actual, expected, tolerance, subject) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${subject}: expected ${expected}, received ${actual}`);
}

for (const [date, solar, lunar] of fixtures) {
  const { sun, moon } = getRiverEnvironment(new Date(date));
  for (const [body, [azimuth, elevation, diameter], tolerance] of [[sun, solar, 0.07], [moon, lunar, 0.15]]) {
    near(body.azimuth, azimuth, tolerance, `${date} azimuth`);
    near(body.elevation, elevation, tolerance, `${date} elevation`);
    near(body.angularDiameter * 3600, diameter, 6, `${date} disk width (arcseconds)`);
    near(Math.hypot(...body.direction), 1, 1e-8, `${date} normalized vector`);
  }
  near(moon.illumination * 100, lunar[3], 0.35, `${date} lunar illumination percentage`);
}

const at = (date) => getRiverEnvironment(new Date(date));
assert.ok(at("2026-06-21T12:00Z").sun.direction[0] > 0, "morning sun is east");
assert.ok(at("2026-06-21T00:00Z").sun.direction[0] < 0, "evening sun is west");
assert.equal(at("2026-06-21T18:00Z").daylight, 1);
assert.equal(at("2026-06-21T06:00Z").night, 1);
assert.equal(at("2026-01-30T18:00Z").foliage.cover, 0);
assert.equal(at("2026-06-21T18:00Z").foliage.cover, 1);
assert.ok(at("2026-10-15T18:00Z").foliage.autumn > 0.8);
assert.deepEqual(at("2026-10-16T04:59Z").foliage, at("2026-10-15T18:00Z").foliage);

const now = new Date("2026-11-25T23:58Z");
const quantity = (value, unitCode) => ({ value, unitCode });
const observation = parseRiverObservation({
  properties: {
    timestamp: "2026-11-25T23:53:00+00:00",
    textDescription: "Light Rain Snow",
    cloudLayers: [{ amount: "BKN" }, { amount: "OVC" }],
    visibility: quantity(8000, "wmoUnit:m"),
    windSpeed: quantity(25.92, "wmoUnit:km_h-1"),
    windDirection: quantity(360, "wmoUnit:degree_(angle)"),
    temperature: quantity(-1, "wmoUnit:degC"),
  },
});
assert.deepEqual(getRiverEnvironment(now, observation).weather, {
  status: "current",
  observedAt: "2026-11-25T23:53:00+00:00",
  description: "Light Rain Snow",
  cloudCover: 1,
  visibilityKm: 8,
  windSpeedKmh: 25.92,
  windFromDegrees: 0,
  precipitation: "mixed",
  temperatureC: -1,
});
const stale = getRiverEnvironment(new Date("2026-11-26T02:00Z"), observation).weather;
assert.equal(stale.status, "stale");
assert.equal(stale.observedAt, observation.observedAt);
assert.equal(stale.precipitation, null);
assert.equal(stale.cloudCover, null);
assert.equal(getRiverEnvironment(new Date("2026-11-25T23:00Z"), observation).weather.status, "unavailable");
assert.equal(getRiverEnvironment(now).weather.status, "unavailable");
assert.equal(parseRiverObservation({ properties: { timestamp: "bad", textDescription: "Snow" } }), null);
assert.equal(parseRiverObservation({ properties: { timestamp: observation.observedAt } }), null);
assert.equal(parseRiverObservation({ properties: {
  timestamp: observation.observedAt,
  textDescription: "Rain in Vicinity Ice Pellets",
  presentWeather: [{ weather: "rain", inVicinity: true }, { weather: "ice_pellets" }],
} }).precipitation, "snow");
assert.equal(await fetchRiverObservation(AbortSignal.abort()), null);
console.log("atlas-river-environment-check: ephemerides, seasons, and observation fallback passed");

const { readFileSync } = await import("node:fs");
const { gunzipSync } = await import("node:zlib");
const rawMesh = readFileSync(new URL("../public/atlas-river/riverfront.bin.gz", import.meta.url));
assert.ok(rawMesh.length < 600_000, "bundled mesh remains under 600 KB");
const triangleBytes = 3 * 8 * Float32Array.BYTES_PER_ELEMENT;
const mesh = gunzipSync(rawMesh);
assert.ok(mesh.length > 0 && mesh.length % triangleBytes === 0);
const materialCounts = new Map();
for (let offset = 0; offset < mesh.length; offset += 32) {
  const vertex = Array.from({ length: 8 }, (_, i) => mesh.readFloatLE(offset + i * 4));
  assert.ok(vertex.every(Number.isFinite));
  near(Math.hypot(...vertex.slice(3, 6)), 1, 0.001, "mesh normal");
  const [, height, , nx, ny, nz, material, seed] = vertex;
  assert.ok(Number.isInteger(material) && ((material >= 0 && material <= 9) || (material >= 16 && material <= 21)) && seed >= 0 && seed <= 1);
  materialCounts.set(material, (materialCounts.get(material) ?? 0) + 1);
  if (material === 4) assert.ok(height === -5 && nx === 0 && ny === 1 && nz === 0, "level water");
  if (material === 8) assert.equal(height, -6, "land stays below the water");
}
for (const material of [0, 1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 18, 19, 20, 21]) assert.ok(materialCounts.get(material) > 0);
console.log("atlas-river-environment-check: river mesh size, normals, and water level passed");

const { moveRiverPan, riverCamera, riverEntryZoom, RIVER_WILLIS } = await import("../src/lib/atlas-river-renderer.ts");
const defaultView = { yaw: -28, pitch: 13, zoom: 1 };
const initial = riverCamera(defaultView, RIVER_WILLIS, 1.5);
assert.deepEqual(moveRiverPan(defaultView, RIVER_WILLIS, [0, 0], 70, 40), [70, -40]);
const moved = riverCamera(defaultView, RIVER_WILLIS, 1.5, [70, -40]);
near(moved.eye[0] - initial.eye[0], 70, 0.001, "pan east");
near(moved.eye[2] - initial.eye[2], -40, 0.001, "pan north");
assert.deepEqual(moved.back, initial.back, "panning does not rotate the city");
const clamped = moveRiverPan(defaultView, RIVER_WILLIS, [0, 0], 1e6, -1e6);
near(RIVER_WILLIS[0] + clamped[0], 1350, 0.001, "east mesh edge");
near(RIVER_WILLIS[2] + clamped[1], 1470, 0.001, "south mesh edge");
assert.equal(riverEntryZoom(0), .76);
assert.ok(riverEntryZoom(475) > .76 && riverEntryZoom(475) < 1);
assert.equal(riverEntryZoom(950), 1);
console.log("atlas-river-environment-check: camera pan and entry zoom passed");

const jackson = riverCamera(defaultView, RIVER_WILLIS, 1.5, [0, 0], { point: [266, 735], progress: 4 });
assert.ok(jackson.eye[1] > 400, "the guided view stays above the Loop streets");
near(jackson.project([266, 36, 735])[0], .5, 0.001, "camera centers on the mapped station");
const state = riverCamera(defaultView, RIVER_WILLIS, 1.5, [0, 0], { point: [408, 738], progress: 5 });
near(state.eye[0] - jackson.eye[0], 142, 0.001, "Jackson transfer spans Dearborn to State");
