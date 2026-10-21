#!/usr/bin/env node
/**
 * Exports the Atlas landmarks from content/atlas.json into standalone SVG
 * files, one per building, each naming its source building in a comment.
 *
 * The geometry is hand-authored inside content/atlas.json. These files are an
 * export of it, so a landmark can be opened and edited on its own. --check
 * verifies the files on disk match what the content model produces, so the
 * export can never drift from the source of truth.
 *
 * Usage: node scripts/art-export.mjs [--check]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const atlas = JSON.parse(readFileSync(join(root, "content", "atlas.json"), "utf8"));
const outDir = join(root, "art");
const check = process.argv.includes("--check");

function stops(g) {
  return g.stops.map((s) => `      <stop offset="${s.offset}" stop-color="${s.color}"/>`).join("\n");
}

function landmarkSvg(b) {
  const fill = `url(#${atlas.building_fill.id})`;
  const paths = [
    b.extra && b.extra_fill
      ? `      <path d="${b.extra}" fill="${b.extra_fill}" stroke="none"/>`
      : b.extra
        ? `      <path d="${b.extra}" stroke="${b.extra_stroke}" stroke-width="${b.extra_width}" fill="none"/>`
        : null,
    `      <path d="${b.d}" fill="${fill}" stroke="#3a4a6e" stroke-width="1"/>`,
  ]
    .filter(Boolean)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${b.name}: ${b.feature}. Authored geometry from content/atlas.json, exported by scripts/art-export.mjs. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${atlas.viewBox}" width="1200" height="470">
  <defs>
    <linearGradient id="${atlas.building_fill.id}" x1="${atlas.building_fill.x1}" y1="${atlas.building_fill.y1}" x2="${atlas.building_fill.x2}" y2="${atlas.building_fill.y2}">
${stops(atlas.building_fill)}
    </linearGradient>
  </defs>
  <rect width="1200" height="470" fill="#0b0e18"/>
  <g>
    <title>${b.name}: ${b.feature}</title>
${paths}
  </g>
</svg>
`;
}

/**
 * Willis Tower -> willis-tower, Marina City (west) -> marina-city-west.
 * Parenthesised qualifiers are kept, so two halves of one building stay
 * distinct files instead of overwriting each other.
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, "-$1")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const expected = new Map();
for (const b of atlas.buildings) {
  expected.set(`${slugify(b.name)}.svg`, landmarkSvg(b));
}

if (expected.size !== atlas.buildings.length) {
  console.error(
    `art-export: ${atlas.buildings.length} landmarks collide into ${expected.size} filenames`,
  );
  process.exit(1);
}

if (check) {
  let drift = 0;
  for (const [name, want] of expected) {
    let have = null;
    try {
      have = readFileSync(join(outDir, name), "utf8");
    } catch {
      console.error(`MISSING art/${name}`);
      drift += 1;
      continue;
    }
    if (have !== want) {
      console.error(`STALE   art/${name}`);
      drift += 1;
    }
  }
  if (drift) {
    process.exit(1);
  }
  console.log(`art-export: check PASS (${expected.size} landmarks)`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [name, svg] of expected) {
    writeFileSync(join(outDir, name), svg);
  }
  console.log(`art-export: wrote ${expected.size} landmarks to art/`);
}
