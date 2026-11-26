import network from "../../content/cta-network.json";
import { coordinateFromPoint } from "../content/geographic-map";

type RiverPoint = readonly [x: number, z: number];
type RiverSegment = readonly [startX: number, startZ: number, endX: number, endZ: number];

// The gen-map scene manifest uses a local WGS84 transverse Mercator origin.
const ORIGIN_LAT = 41.8848;
const ORIGIN_LON = -87.6325;
const radians = Math.PI / 180;
const originLatitude = ORIGIN_LAT * radians;
const WGS84_EQUATORIAL_RADIUS = 6378137;
const WGS84_ECCENTRICITY_SQUARED = 0.00669437999014;
const eccentricityFactor = 1 - WGS84_ECCENTRICITY_SQUARED * Math.sin(originLatitude) ** 2;
const eastScale = WGS84_EQUATORIAL_RADIUS * Math.cos(originLatitude) / Math.sqrt(eccentricityFactor);
const northScale = WGS84_EQUATORIAL_RADIUS * (1 - WGS84_ECCENTRICITY_SQUARED) / eccentricityFactor ** 1.5;

const west = -1380;
const east = 1460;
const north = -1470;
const south = 1580;

function toRiverPoint(lon: number, lat: number): RiverPoint {
  // This local linearization is suitable for the few kilometres in the mesh.
  return [(lon - ORIGIN_LON) * radians * eastScale, (ORIGIN_LAT - lat) * radians * northScale];
}

function clipSegment([x, z]: RiverPoint, [endX, endZ]: RiverPoint): RiverSegment | null {
  const dx = endX - x;
  const dz = endZ - z;
  let start = 0;
  let end = 1;

  for (const [coordinate, delta, min, max] of [[x, dx, west, east], [z, dz, north, south]]) {
    if (delta === 0) {
      if (coordinate < min || coordinate > max) return null;
      continue;
    }
    const a = (min - coordinate) / delta;
    const b = (max - coordinate) / delta;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
  }

  if ((end - start) * Math.hypot(dx, dz) < 0.01) return null;
  return [x + start * dx, z + start * dz, x + end * dx, z + end * dz];
}

export const riverCtaRoutes = network.routes.filter(({ id }) => id === "red" || id === "blue").map((route) => {
  const segments: RiverSegment[] = [];
  const seen = new Set<string>();

  // The supplemental service patterns share the same downtown tracks. Use the
  // complete pattern so simplification differences do not draw parallel traces.
  const shape = route.shapes.reduce((longest, candidate) => candidate.points.length > longest.points.length
    ? candidate
    : longest);
  const points = shape.points.map((point) => toRiverPoint(...coordinateFromPoint(point, network.projection)));
  for (let i = 1; i < points.length; i += 1) {
    const segment = clipSegment(points[i - 1], points[i]);
    if (!segment) continue;

    const [ax, az, bx, bz] = segment.map(Math.round);
    const key = [`${ax},${az}`, `${bx},${bz}`].sort().join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    segments.push(segment);
  }

  return { id: route.id, color: route.color, segments };
});

export const riverCtaStations = network.stations.flatMap((station) => {
  const point = toRiverPoint(station.lon, station.lat);
  const [x, z] = point;
  if (x < west || x > east || z < north || z > south) return [];
  return riverCtaRoutes.flatMap(({ id: route, color }) => station.routes.includes(route)
    ? [{ id: station.id, name: station.name, route, color, point }]
    : []);
});
