import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
const bin = process.env.PATH?.split(path.delimiter).find((dir) => existsSync(path.join(dir, "playwright")));
assert.ok(bin, "Put an existing Playwright CLI on PATH");
const { chromium } = createRequire(realpathSync(path.join(bin, "playwright")))("playwright");
const source = new URL("../../content/atlas.json", import.meta.url);
const atlas = JSON.parse(readFileSync(source, "utf8"));
const browser = await chromium.launch({ headless: true });
try {
 const page = await browser.newPage();
 const windows = await page.evaluate(({ buildings, window_size: [width, height] }) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  return buildings.flatMap((building, index) => {
   const body = document.createElementNS(svg.namespaceURI, "path");
   body.setAttribute("d", building.d); svg.append(body);
   const bounds = body.getBBox(), points = [];
   for (let y = Math.ceil(bounds.y) + 12, row = 0; y + height < bounds.y + bounds.height - 4; y += 15, row++) {
    for (let x = Math.ceil(bounds.x) + 5, col = 0; x + width < bounds.x + bounds.width - 4; x += 8, col++) {
     if ((col + row + index) % 3 !== 0) continue;
     if ([[x,y],[x+width,y],[x,y+height],[x+width,y+height]].every(([a,b]) => body.isPointInFill(new DOMPoint(a,b)))) points.push([x,y]);
    }
   }
   return points;
  });
 }, atlas);
 if (process.argv.includes("--write")) {
  atlas.window_lights = windows;
  writeFileSync(source, JSON.stringify(atlas, null, 2) + "\n");
  console.log(`window-layout: wrote ${windows.length} contained facade lights`);
 } else {
  assert.deepEqual(atlas.window_lights, windows, "regenerate window positions after changing landmark massing");
  console.log(`window-layout: PASS (${windows.length} contained facade lights)`);
 }
} finally { await browser.close(); }
