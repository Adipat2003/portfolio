type Point = [number, number, number];

const TURN = Math.PI * 2;
const CONCRETE = 10;
const PARKING = 11;
const RECESSED_GLAZING = 3;

// Marina City. Commission on Chicago Landmarks designation report, pp. 32–34.
// Centers and footprint radii come from the OpenStreetMap-derived downtown export.
export function addMarinaCity(vertices: number[]): void {
  for (const [x, z, seed] of [[278.8, -350.7, 0.31], [333.0, -378.5, 0.67]]) {
    const at = (radius: number, angle: number, y: number): Point => [
      x + radius * Math.cos(angle),
      y - 6,
      z + radius * Math.sin(angle),
    ];

    function triangle(a: Point, b: Point, c: Point, material: number): void {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      for (const [px, py, pz] of [a, b, c]) {
        vertices.push(px, py, pz, nx / length, ny / length, nz / length, material, seed);
      }
    }

    function quad(a: Point, b: Point, c: Point, d: Point, material: number): void {
      triangle(a, b, c, material);
      triangle(a, c, d, material);
    }

    function cylinder(radius: number, bottom: number, top: number, material: number, segments = 32): void {
      for (let i = 0; i < segments; i += 1) {
        const a = i * TURN / segments;
        const b = (i + 1) * TURN / segments;
        const upperA = at(radius, a, top);
        const upperB = at(radius, b, top);
        quad(at(radius, a, bottom), upperA, upperB, at(radius, b, bottom), material);
        triangle([x, top - 6, z], upperB, upperA, material);
      }
    }

    cylinder(16.8, 0, 2, CONCRETE);
    cylinder(5.2, 2, 55, CONCRETE);

    // Each parking level is one turn in an open slab with a concrete perimeter guard.
    const segmentsPerTurn = 20;
    const parkingSegments = 19 * segmentsPerTurn;
    for (let i = 0; i < parkingSegments; i += 1) {
      const a = i * TURN / segmentsPerTurn;
      const b = (i + 1) * TURN / segmentsPerTurn;
      const low = 2 + i * 49 / parkingSegments;
      const high = 2 + (i + 1) * 49 / parkingSegments;
      const outerA = at(16.75, a, low);
      const outerB = at(16.75, b, high);
      quad(at(5.15, a, low), at(5.15, b, high), outerB, outerA, PARKING);
      quad(outerA, at(16.75, a, low + 0.52), at(16.75, b, high + 0.52), outerB, CONCRETE);
    }

    for (let i = 0; i < 16; i += 1) {
      const angle = i * TURN / 16;
      const left = angle - 0.026;
      const right = angle + 0.026;
      const inside = 15.6;
      const outside = 16.5;
      quad(at(outside, left, 2), at(outside, left, 51), at(outside, right, 51), at(outside, right, 2), CONCRETE);
      quad(at(inside, left, 2), at(inside, left, 51), at(outside, left, 51), at(outside, left, 2), CONCRETE);
      quad(at(outside, right, 2), at(outside, right, 51), at(inside, right, 51), at(inside, right, 2), CONCRETE);
      quad(at(inside, right, 2), at(inside, right, 51), at(inside, left, 51), at(inside, left, 2), CONCRETE);
    }

    cylinder(13.25, 50, 168, RECESSED_GLAZING);
    cylinder(16.25, 53.9, 55, CONCRETE);
    cylinder(17.2, 167, 169.3, CONCRETE);
    cylinder(8.2, 169.3, 175.7, CONCRETE, 24);
    cylinder(5.2, 175.7, 179.2, CONCRETE, 24);

    // Three samples per petal preserve each scalloped floor with one small mesh.
    const outline = Array.from({ length: 48 }, (_, i) => ({
      angle: (i - 1.5) * TURN / 48,
      radius: i % 3 === 0 ? 16.8 : 19.85,
    }));
    for (let floor = 0; floor < 40; floor += 1) {
      const y = 55 + floor * 2.8;
      for (let i = 0; i < outline.length; i += 1) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const lowerA = at(a.radius, a.angle, y);
        const lowerB = at(b.radius, b.angle, y);
        const upperA = at(a.radius, a.angle, y + 0.48);
        const upperB = at(b.radius, b.angle, y + 0.48);
        triangle([x, y + 0.48, z], upperB, upperA, CONCRETE);
        triangle([x, y, z], lowerA, lowerB, CONCRETE);
        quad(lowerA, upperA, upperB, lowerB, CONCRETE);
      }
    }
  }
}
