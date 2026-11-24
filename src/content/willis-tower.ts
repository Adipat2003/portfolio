// Willis Tower, Chicago. Tube layout and materials follow SOM and Skydeck's published references.
type Point = readonly [x: number, y: number, z: number];
type Material = "glass" | "roof" | "metal" | "antenna" | "beacon";
type Surface = {
	id: string;
	origin: Point;
	along: Point;
	up: Point;
	normal: Point;
	width: number;
	bottom: number;
	top: number;
	material: Material;
};

const TUBE_WIDTH = 22.86;
const ROOF_HEIGHT = 442.1;
const FLOOR_HEIGHT = ROOF_HEIGHT / 110;
const levels = [
	[50, 90, 66],
	[110, 110, 90],
	[66, 90, 50],
];

const SIDES = [
	{ dx: 0, dz: -1, x: 0, z: 0, along: [1, 0, 0] },
	{ dx: 1, dz: 0, x: 1, z: 0, along: [0, 0, 1] },
	{ dx: 0, dz: 1, x: 1, z: 1, along: [-1, 0, 0] },
	{ dx: -1, dz: 0, x: 0, z: 1, along: [0, 0, -1] },
] as const;

function roof(id: string, x: number, z: number, y: number, width: number, material: Material): Surface {
	return {
		id, origin: [x, y, z], normal: [0, 1, 0], along: [1, 0, 0], up: [0, 0, 1],
		width, bottom: 0, top: width, material,
	};
}

function walls(id: string, x: number, z: number, width: number, top: number, bottom: (dx: number, dz: number) => number, material: Material): Surface[] {
	return SIDES.flatMap(({ dx, dz, x: cornerX, z: cornerZ, along }, index) => {
		const lower = bottom(dx, dz);
		if (lower >= top) return [];
		return [{
			id: `${id}-side-${index}`,
			origin: [x + cornerX * width, 0, z + cornerZ * width],
			along, up: [0, 1, 0], normal: [dx, 0, dz],
			width, bottom: lower, top, material,
		}];
	});
}

const towers = levels.flatMap((row, j) => row.map((floors, i) => {
	const id = `tube-${i}-${j}`;
	const x = (i - 1.5) * TUBE_WIDTH;
	const z = (j - 1.5) * TUBE_WIDTH;
	const top = floors * FLOOR_HEIGHT;
	const surfaces = [
		...walls(id, x, z, TUBE_WIDTH, top, (dx, dz) => (levels[j + dz]?.[i + dx] ?? 0) * FLOOR_HEIGHT, "glass"),
		roof(`${id}-roof`, x, z, top, TUBE_WIDTH, "roof"),
	];
	if (floors === 110) {
		const tip = i === 0 ? 527 : 520;
		const centerX = x + TUBE_WIDTH / 2;
		const centerZ = z + TUBE_WIDTH / 2;
		const sections = [
			{ width: 5, from: top, to: top + 5, material: "metal" },
			{ width: 2.2, from: top + 5, to: top + 30, material: "antenna" },
			{ width: 1.4, from: top + 30, to: tip - 2, material: "antenna" },
			{ width: 1.1, from: tip - 2, to: tip, material: "beacon" },
		] as const;
		for (const { width, from, to, material } of sections) {
			const mount = `${id}-mast-${from}`;
			const left = centerX - width / 2;
			const front = centerZ - width / 2;
			surfaces.push(...walls(mount, left, front, width, to, () => from, material));
			surfaces.push(roof(`${mount}-top`, left, front, to, width, material));
		}
	}
	return { x: x + TUBE_WIDTH / 2, z: z + TUBE_WIDTH / 2, surfaces };
}));

export const WILLIS_TOWER = "Willis Tower";
export const WILLIS_BAY = TUBE_WIDTH / 6;
export const WILLIS_FLOOR = FLOOR_HEIGHT;
// The dark service bands are represented at their approximate positions.
export const WILLIS_BANDS = [29, 48, 64, 88, 107].map((floor) => floor * FLOOR_HEIGHT);
export const WILLIS_ORBIT_DEFAULT = { yaw: -28, pitch: 13, zoom: 1 };
export type OrbitView = typeof WILLIS_ORBIT_DEFAULT;

export function moveOrbit(view: OrbitView, yaw: number, pitch: number, zoom = 1): OrbitView {
	return {
		yaw: (view.yaw + yaw) % 360,
		pitch: Math.max(0, Math.min(78, view.pitch + pitch)),
		zoom: Math.max(.75, Math.min(2.35, view.zoom * zoom)),
	};
}

export function projectWillisTower(view: OrbitView) {
	const azimuth = view.yaw * Math.PI / 180;
	const elevation = view.pitch * Math.PI / 180;
	const sinYaw = Math.sin(azimuth);
	const cosYaw = Math.cos(azimuth);
	const sinPitch = Math.sin(elevation);
	// In the skyline, tilt reveals roofs without shrinking the tower into the river.
	const rise = 1 - .12 * sinPitch;
	const roofDepth = .8 * sinPitch;
	const facing: Point = [sinYaw * rise, roofDepth, cosYaw * rise];
	const depth = (x: number, z: number) => x * sinYaw + z * cosYaw;
	const project = ([x, y, z]: Point) => [
		view.zoom * (x * cosYaw - z * sinYaw),
		view.zoom * (263.5 - y * rise + depth(x, z) * roofDepth),
	];
	const offset = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
	const fixed = (value: number) => Number(value.toFixed(4));

	const surfaces = towers.slice().sort((a, b) => depth(a.x, a.z) - depth(b.x, b.z)).flatMap((tower) =>
		tower.surfaces.flatMap((surface) => {
			const normal = surface.normal;
			if (normal[0] * facing[0] + normal[1] * facing[1] + normal[2] * facing[2] < .001) return [];
			const [x, y] = project(surface.origin);
			const [alongX, alongY] = project(offset(surface.origin, surface.along));
			const [upX, upY] = project(offset(surface.origin, surface.up));
			const transform = [alongX - x, alongY - y, upX - x, upY - y, x, y].map(fixed).join(" ");
			const sun = Math.max(0, .72 * normal[0] + .69 * normal[1] + .18 * normal[2]);
			return [{ ...surface, transform: `matrix(${transform})`, sun }];
		}),
	);

	return { surfaces };
}
