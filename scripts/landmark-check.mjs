#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const atlas = JSON.parse(readFileSync(new URL("../content/atlas.json", import.meta.url), "utf8"));
const building = (name) => {
  const found = atlas.buildings.find((entry) => entry.name === name);
  assert.ok(found, `Missing landmark ${name}`);
  return found;
};
// Marina City's repeated outward-curving balcony bands are its defining profile.
// A rectangular box with a corncob tooltip must not pass this regression gate.
for (const side of ["west", "east"]) {
  const marina = building(`Marina City (${side})`);
  assert.ok((marina.extra?.match(/Q/g) ?? []).length >= 12,
    `Marina City (${side}) needs repeated curved balcony bands, not a blank rectangle`);
}
const bounds = (entry) => {
  const vertices = [...entry.d.matchAll(/[ML]([\d.]+)\s+([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
  const xs = vertices.map(([x]) => x), ys = vertices.map(([, y]) => y);
  return { top: Math.min(...ys), bottom: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};
const monadnock = bounds(building("Monadnock Building"));
assert.equal(monadnock.bottom, bounds(building("Chicago Board of Trade")).bottom,
  "Monadnock must share the ground baseline of its neighboring buildings");
assert.equal(monadnock.bottom, bounds(building("Fisher Building")).bottom);
assert.equal(monadnock.top, 360, "baseline correction must preserve the low 60-unit body");
assert.match(building("Monadnock Building").extra, /^M830 364 L882 364/, "window details must move with the body");
const aon = bounds(building("Aon Center"));
assert.ok(monadnock.height < aon.height * .45 && monadnock.width >= monadnock.height,
  "Monadnock must read as a low broad historic block, not a supertall needle");
const willis = bounds(building("Willis Tower"));
const hancock = bounds(building("Hancock Center"));
assert.ok(willis.height > hancock.height * 1.1,
  "Willis roof mass must stand above Hancock instead of being dwarfed by it");
const masts = [...(building("Hancock Center").extra ?? "").matchAll(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/g)]
  .filter(([, x1, y1, x2, y2]) => x1 === x2 && Math.min(Number(y1), Number(y2)) < hancock.top);
assert.equal(masts.length, 2, "Hancock needs its twin antenna masts above the tapered body");
assert.ok(bounds(building("Wrigley Building (north tower)")).height < bounds(building("Wrigley Building (south tower)")).height * .75,
  "Wrigley's north block must be distinctly lower than its south clock tower");
assert.match(building("Wrigley Building (south tower)").extra ?? "", /A[\d.]+ [\d.]+/,
  "Wrigley's clock tower needs a visible round clock face");
assert.ok(!building("Wrigley Building (north tower)").feature.includes("clock"),
  "The north block must not be mislabeled as a second clock tower");
console.log("landmark-check: balcony profiles, historic massing, tower hierarchy and Wrigley clock PASS");
