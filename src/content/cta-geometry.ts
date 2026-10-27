export type Point = [number, number];
export type RailRoute = { id: string; name: string; color: string; textColor: string; shapes: { id: string; points: number[][] }[] };
export type RailStation = { id: string; name: string; point: Point; routes: string[]; transfers: string[] };
export type RailNetwork = {
	metadata: { source: string; retrievedOn: string; packageUpdated: string; attribution: string };
	projection: { origin: number[]; radius: number; metresPerUnit: number };
	viewBox: [number, number, number, number]; routes: RailRoute[]; stations: RailStation[];
};

export function projectCoordinate(lat: number, lon: number, projection: RailNetwork["projection"]): Point {
	const { origin, radius, metresPerUnit } = projection;
	return [radius * (lon - origin[1]) * Math.PI / 180 * Math.cos(origin[0] * Math.PI / 180) / metresPerUnit,
		-radius * (lat - origin[0]) * Math.PI / 180 / metresPerUnit];
}

/** Snap reported track-circuit coordinates to this route, suppressing fixes over 500 m away. */
export function positionOnRoute(point: Point, route: RailRoute): Point | null {
	if (!point.every(Number.isFinite)) return null;
	let best: Point | null = null;
	let distance = 5;
	for (const shape of route.shapes) {
		for (let i = 1; i < shape.points.length; i++) {
			const [ax, ay] = shape.points[i - 1], [bx, by] = shape.points[i];
			const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
			const t = length ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / length)) : 0;
			const candidate: Point = [ax + t * dx, ay + t * dy];
			const d = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
			if (d <= distance) { distance = d; best = candidate; }
		}
	}
	return best;
}

/** Keep a finite illustration covering the stage throughout a camera glide. */
export function clampedCamera(layout: { width: number; height: number; left: number; top: number }, stage: { width: number; height: number }, focus: { x: number; y: number; zoom: number }, viewBox: { width: number; height: number }, anchorY: number) {
	const zoom = Math.max(focus.zoom, stage.width / layout.width);
	const fit = Math.min(layout.width / viewBox.width, layout.height / viewBox.height);
	const padX = (layout.width - viewBox.width * fit) / 2;
	const padY = (layout.height - viewBox.height * fit) / 2;
	const x = Math.max(stage.width - layout.width * zoom, Math.min(0, stage.width * .5 - (padX + focus.x * fit) * zoom));
	const y = stage.height * anchorY - (padY + focus.y * fit) * zoom;
	return { zoom, x: x - layout.left, y: y - layout.top };
}
