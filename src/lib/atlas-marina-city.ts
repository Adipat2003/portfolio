type Point = [number, number, number];

const TURN = Math.PI * 2;
const GRADE = -6;
const BAYS = 16;
const BAY = TURN / BAYS;
const CONCRETE = 10;
const PARKING = 11;
const RAIL = 12;
const GLAZING = 13;

// Marina City. Commission on Chicago Landmarks designation report, pp. 32-34.
// Centers and footprint radii come from the OpenStreetMap-derived downtown export.
export function addMarinaCity(vertices: number[]): void {
  for (const [x, z, seed] of [[278.8, -350.7, 0.31], [333.0, -378.5, 0.67]]) {
    const at = (radius: number, angle: number, y: number): Point => [
      x + radius * Math.cos(angle),
      y + GRADE,
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
        triangle(at(0, 0, top), upperB, upperA, material);
      }
    }

    function column(angle: number, radius: number, width: number, bottom: number, top: number): void {
      const left = angle - width / (2 * radius);
      const right = angle + width / (2 * radius);
      const inside = radius - width;
      quad(at(radius, left, bottom), at(radius, left, top), at(radius, right, top), at(radius, right, bottom), CONCRETE);
      quad(at(inside, left, bottom), at(inside, left, top), at(radius, left, top), at(radius, left, bottom), CONCRETE);
      quad(at(radius, right, bottom), at(radius, right, top), at(inside, right, top), at(inside, right, bottom), CONCRETE);
      quad(at(inside, right, bottom), at(inside, right, top), at(inside, left, top), at(inside, left, bottom), CONCRETE);
    }

    cylinder(16.8, 0, 2, CONCRETE);
    cylinder(5.2, 2, 55, CONCRETE);

    // Nineteen turns of open helical floor plates, with scalloped concrete edges and open voids.
    const samplesPerTurn = 2 * BAYS;
    const parkingSegments = 19 * samplesPerTurn;
    for (let i = 0; i < parkingSegments; i += 1) {
      const a = i * TURN / samplesPerTurn;
      const b = (i + 1) * TURN / samplesPerTurn;
      const low = 2 + i * 49 / parkingSegments;
      const high = 2 + (i + 1) * 49 / parkingSegments;
      const rA = 16.35 - 0.4 * Math.cos(a * BAYS);
      const rB = 16.35 - 0.4 * Math.cos(b * BAYS);
      const outerA = at(rA, a, low);
      const outerB = at(rB, b, high);
      const soffitA = at(rA - 0.35, a, low - 0.38);
      const soffitB = at(rB - 0.35, b, high - 0.38);
      quad(at(5.15, a, low), at(5.15, b, high), outerB, outerA, PARKING);
      quad(at(5.15, a, low - 0.38), soffitA, soffitB, at(5.15, b, high - 0.38), PARKING);
      quad(soffitA, outerA, outerB, soffitB, CONCRETE);
    }

    // Slender perimeter columns connect the ramp, the glazed service story and the residences.
    for (let i = 0; i < BAYS; i += 1) {
      column(i * BAY, 15.7, 0.7, 2, 51);
      column(i * BAY, 16.35, 0.42, 51, 165);
    }

    cylinder(11.8, 51, 55, GLAZING);
    cylinder(16.25, 53.9, 55, CONCRETE);
    cylinder(17.2, 167, 169.3, CONCRETE);
    cylinder(8.2, 169.3, 175.7, CONCRETE, 24);
    cylinder(5.2, 175.7, 179.2, CONCRETE, 24);

    // Shortcut: photograph-derived balcony and railing proportions, replace with surveyed sections for a measured model.
    const balconySamples = 5;
    for (let bay = 0; bay < BAYS; bay += 1) {
      const start = bay * BAY;
      const end = start + BAY;
      const center = (start + end) / 2;
      const chord = 16.35 * Math.cos(BAY / 2);
      const halfWidth = 16.35 * Math.sin(BAY / 2);

      function glazedEdge(t: number, y: number, radius = 14.1): Point {
        const a = at(radius, start, y);
        const b = at(radius, end, y);
        return [a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t];
      }

      for (let pane = 1; pane < 3; pane += 1) {
        const left = pane / 3 - 0.008;
        const right = pane / 3 + 0.008;
        quad(glazedEdge(left, 55, 14.13), glazedEdge(left, 167, 14.13),
          glazedEdge(right, 167, 14.13), glazedEdge(right, 55, 14.13), RAIL);
      }
      quad(glazedEdge(0, 55), glazedEdge(0, 167), glazedEdge(1, 167), glazedEdge(1, 55), GLAZING);

      function petal(sample: number, y: number, lip = 0): Point {
        const section = sample / balconySamples * Math.PI;
        const forward = chord + 3.56 * Math.sin(section) - lip;
        const across = -halfWidth * Math.cos(section);
        return [
          x + forward * Math.cos(center) - across * Math.sin(center),
          y + GRADE,
          z + forward * Math.sin(center) + across * Math.cos(center),
        ];
      }

      for (let floor = 0; floor < 40; floor += 1) {
        const y = 55 + floor * 2.8;
        const deck = y + 0.30;
        const railBase = deck + 0.92;
        const railTop = railBase + 0.09;
        const topAnchor = at(12, center, deck);
        const bottomAnchor = at(12, center, y);
        for (let i = 0; i < balconySamples; i += 1) {
          const lowA = petal(i, y, 0.10);
          const lowB = petal(i + 1, y, 0.10);
          const highA = petal(i, deck);
          const highB = petal(i + 1, deck);
          triangle(topAnchor, highB, highA, CONCRETE);
          triangle(bottomAnchor, lowA, lowB, CONCRETE);
          quad(lowA, highA, highB, lowB, CONCRETE);
          quad(petal(i, railBase, 0.14), petal(i, railTop, 0.14),
            petal(i + 1, railTop, 0.14), petal(i + 1, railBase, 0.14), RAIL);
        }
        for (const post of [1.2, 3.8]) {
          quad(petal(post - 0.026, deck, 0.14), petal(post - 0.026, railTop, 0.14),
            petal(post + 0.026, railTop, 0.14), petal(post + 0.026, deck, 0.14), RAIL);
        }
      }
    }
  }
}
