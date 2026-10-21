#!/usr/bin/env node
/**
 * Boundary checks for the seasonal theme, over the real definition.
 *
 * The season walk is easy to get subtly wrong around the new year, which is
 * where a date falls before every boundary in its own year and belongs to the
 * season that started in December. Every boundary in both directions, plus a
 * mid-season date, is asserted so a definition edit cannot silently shift a
 * season on one surface.
 *
 * It imports the same module the page uses, so the check tests the shipped
 * logic rather than a copy of it.
 *
 * Usage: node scripts/season-check.mjs
 */
const { buildSeasons } = await import(new URL("../src/content/season.ts", import.meta.url).href);
const rawSeasons = JSON.parse(
  (await import("node:fs")).readFileSync(new URL("../content/seasons.json", import.meta.url), "utf8"),
);
const { seasonFor } = buildSeasons(rawSeasons);

/** A UTC timestamp is enough because only month and day are read. */
const at = (month, day) => Date.UTC(2026, month - 1, day, 12);

const BOUNDARIES = [
  ["03-20", "spring"],
  ["06-21", "summer"],
  ["09-22", "fall"],
  ["12-21", "winter"],
];

// The day before a boundary must still be the previous season, and the boundary
// itself must be the new one.
const BEFORE = [
  ["03-19", "winter"],
  ["06-20", "spring"],
  ["09-21", "summer"],
  ["12-20", "fall"],
];

const MID = [
  ["01-15", "winter"],
  ["02-28", "winter"],
  ["04-15", "spring"],
  ["07-04", "summer"],
  ["10-31", "fall"],
  ["11-30", "fall"],
];

let failures = 0;
function check(description, ok, detail) {
  if (ok) {
    console.log(`  ok   ${description}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${description}`);
  if (detail) console.error(`       ${detail}`);
}

console.log("season-check: boundary start");
for (const [date, expected] of BOUNDARIES) {
  const [m, d] = date.split("-").map(Number);
  const got = seasonFor(new Date(at(m, d)));
  check(`${date} -> ${expected}`, got === expected, `got ${got}`);
}

console.log("season-check: day before boundary");
for (const [date, expected] of BEFORE) {
  const [m, d] = date.split("-").map(Number);
  const got = seasonFor(new Date(at(m, d)));
  check(`${date} -> ${expected}`, got === expected, `got ${got}`);
}

console.log("season-check: mid-season");
for (const [date, expected] of MID) {
  const [m, d] = date.split("-").map(Number);
  const got = seasonFor(new Date(at(m, d)));
  check(`${date} -> ${expected}`, got === expected, `got ${got}`);
}

console.log(
  failures === 0
    ? `season-check: PASS (${BOUNDARIES.length + BEFORE.length + MID.length} dates)`
    : `season-check: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
