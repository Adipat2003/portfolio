import { riverCtaRoutes, riverCtaStations } from "./atlas-river-cta";

type Point = readonly [east: number, south: number];
type Route = "blue" | "red";

const itinerary: ReadonlyArray<readonly [id: string, route: Route, slug: string]> = [
	["40380", "blue", "offline-sync-engine"],
	["40370", "blue", "cross-platform-rollout"],
	["40790", "blue", "inspection-platform-api"],
	["40070", "blue", "ece391-os-kernel"],
	["40560", "red", "supervised-automation"],
	["41090", "red", "legacy-report-pipeline"],
	["41660", "red", "cs411-la-crime"],
];

export const guidedStops = itinerary.map(([id, route, slug]) => {
	const station = riverCtaStations.find((candidate) => candidate.id === id && candidate.route === route);
	if (!station) throw new Error(`Missing guided CTA station ${id} on the ${route} line`);
	return { ...station, route, slug };
});

export const guidedTransfer = [guidedStops[3].point, guidedStops[4].point] as const;

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function interpolate(a: Point, b: Point, fraction: number): Point {
	return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function traceBetween(from: Point, to: Point, line: Route): Point[] {
	const route = riverCtaRoutes.find(({ id }) => id === line);
	if (!route?.segments.length) throw new Error(`Missing guided ${line} line geometry`);
	const segments = route.segments.map(([ax, az, bx, bz]) => {
		const start: Point = [ax, az];
		const end: Point = [bx, bz];
		return { start, end, distance: distance(start, end) };
	});
	function project(point: Point) {
		return segments.reduce((closest, { start, end, distance: length }, index) => {
			const along = ((point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])) / (length * length);
			const fraction = Math.min(1, Math.max(0, along));
			const projected = interpolate(start, end, fraction);
			const offset = distance(point, projected);
			return offset < closest.offset ? { point: projected, order: index + fraction, offset } : closest;
		}, { point, order: 0, offset: Infinity });
	}

	const first = project(from);
	const last = project(to);
	const [lower, upper] = first.order <= last.order ? [first, last] : [last, first];
	const points = [lower.point];
	for (let i = Math.floor(lower.order) + 1; i < upper.order; i++) {
		points.push(segments[i - 1].end);
	}
	points.push(upper.point);
	if (first.order > last.order) points.reverse();
	return [from, ...points, to];
}

const legs = guidedStops.slice(1).map((stop, index) => {
	const previous = guidedStops[index];
	// The Jackson platforms have separate map coordinates. Connect them across the transfer.
	const points = stop.route === previous.route
		? traceBetween(previous.point, stop.point, stop.route)
		: [previous.point, stop.point];
	let total = 0;
	const segments = points.slice(1).flatMap((end, i) => {
		const start = points[i];
		const length = distance(start, end);
		if (!length) return [];
		const offset = total;
		total += length;
		return [{ start, end, length, offset }];
	});
	return { segments, total };
});

export function guidedPosition(position: number): { point: Point } {
	const clamped = Math.min(guidedStops.length, Math.max(1, Number.isNaN(position) ? 1 : position));
	if (Number.isInteger(clamped)) return { point: guidedStops[clamped - 1].point };
	const index = Math.floor(clamped) - 1;
	const { segments, total } = legs[index];
	const meter = ((clamped - 1) % 1) * total;
	const segment = segments.find(({ offset, length }) => meter <= offset + length);
	return { point: segment ? interpolate(segment.start, segment.end, (meter - segment.offset) / segment.length) : guidedStops[index + 1].point };
}
