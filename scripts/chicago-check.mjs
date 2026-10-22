#!/usr/bin/env node
/**
 * Checks for the Chicago layer, over the shipped logic and the live content.
 *
 * src/content/chicago.ts keeps the shaping rules free of runtime imports so
 * this check can exercise them under plain Node, the same way season-check.mjs
 * exercises season.ts. The ordering of the spot strip and the wrap of the
 * rotating slot are easy to get subtly wrong, so both are asserted against
 * fixtures, and the committed content is held to the same invariants the
 * build-time guard enforces: a landmark note names a real building, and no
 * slug repeats.
 *
 * Usage: node scripts/chicago-check.mjs
 */
const { visibleSpots, eventAt, noteFor } = await import(
  new URL("../src/content/chicago.ts", import.meta.url).href
);
const fs = await import("node:fs");
const rawChicago = JSON.parse(
  fs.readFileSync(new URL("../content/chicago.json", import.meta.url), "utf8"),
);
const rawAtlas = JSON.parse(
  fs.readFileSync(new URL("../content/atlas.json", import.meta.url), "utf8"),
);

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

console.log("chicago-check: committed content invariants");
check("chicago.json is marked public_safe_reviewed", rawChicago.public_safe_reviewed === true);
check("spots is an array", Array.isArray(rawChicago.spots));
check("events is an array", Array.isArray(rawChicago.events));
const buildingNames = new Set(rawAtlas.buildings.map((b) => b.name));
for (const name of Object.keys(rawChicago.landmark_notes ?? {})) {
  check(`landmark note '${name}' names a building in atlas.json`, buildingNames.has(name));
}
for (const [list, kind] of [
  [rawChicago.spots, "spot"],
  [rawChicago.events, "event"],
]) {
  const seen = new Set();
  for (const record of list) {
    check(`${kind} slug '${record.slug}' is unique`, !seen.has(record.slug));
    seen.add(record.slug);
  }
}

console.log("chicago-check: spot ordering");
const spots = [
  { slug: "b-place", name: "Berwin", neighborhood: "West", favorite: false },
  { slug: "f-place", name: "Fave", neighborhood: "North", favorite: true },
  { slug: "a-place", name: "Ann", neighborhood: "West", favorite: false },
  { slug: "c-place", name: "Cid", neighborhood: "South", favorite: false },
];
const ordered = visibleSpots({ spots, events: [], landmark_notes: {} });
check(
  "favorites first, then neighborhood, then name",
  JSON.stringify(ordered.map((s) => s.slug)) === JSON.stringify(["f-place", "c-place", "a-place", "b-place"]),
  `got ${ordered.map((s) => s.slug).join(", ")}`,
);
check("empty content renders no spots", visibleSpots({ spots: [], events: [], landmark_notes: {} }).length === 0);
check("ordering does not mutate the input", spots[0].slug === "b-place" && spots.length === 4);

console.log("chicago-check: event rotation wrap");
const events = [
  { slug: "e1", title: "One", kind: "game", when: "Fri" },
  { slug: "e2", title: "Two", kind: "music", when: "Sat" },
  { slug: "e3", title: "Three", kind: "market", when: "Sun" },
];
check("index 0 shows the first event", eventAt(events, 0)?.slug === "e1");
check("the last index shows the last event", eventAt(events, 2)?.slug === "e3");
check("an index past the end wraps to the start", eventAt(events, 3)?.slug === "e1");
check("a negative index wraps from the end", eventAt(events, -1)?.slug === "e3");
check("no events shows nothing", eventAt([], 0) === null);

console.log("chicago-check: landmark notes");
check("a written note is returned", noteFor({ Willis: "Twin antennas" }, "Willis") === "Twin antennas");
check("a building without a note returns null", noteFor({ Willis: "Twin antennas" }, "Hancock") === null);
check("a blank note returns null", noteFor({ Willis: "   " }, "Willis") === null);

console.log(
  failures === 0
    ? "chicago-check: PASS"
    : `chicago-check: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
