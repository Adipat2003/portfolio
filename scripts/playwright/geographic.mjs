import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, realpathSync, mkdirSync } from "node:fs";
import path from "node:path";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";

const bin = process.env.PATH?.split(path.delimiter).find((dir) => existsSync(path.join(dir, "playwright")));
if (!bin) throw new Error("Put an existing Playwright CLI on PATH; see scripts/playwright/README.md");
const { chromium } = createRequire(realpathSync(path.join(bin, "playwright")))("playwright");
const base = process.env.BASE_URL ?? "http://127.0.0.1:8270/portfolio/";
const screenshots = process.env.SCREENSHOT_DIR;
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
// Locally generated fixture geometry. It does not represent real buildings.
const square = (lon, height, hidden = false) => ({ type: "Feature", properties: { render_height: height, render_min_height: 0, hide_3d: hidden }, geometry: { type: "Polygon", coordinates: [[[lon, 41.88], [lon + .001, 41.88], [lon + .001, 41.881], [lon, 41.881], [lon, 41.88]]] } });
const buildings = new GeoJSONVT({ type: "FeatureCollection", features: [square(-87.63, 100), square(-87.632, 150, true)] }, { maxZoom: 14 });
const style = { version: 8, sources: { fixture: { type: "vector", tiles: ["https://fixture.invalid/tiles/{z}/{x}/{y}.pbf"], maxzoom: 14 } }, layers: [
 { id: "background", type: "background", paint: { "background-color": "#11232d" } },
 { id: "footprints", type: "fill", source: "fixture", "source-layer": "building", paint: { "fill-color": "#425664" } },
] };
const failures = [], results = [];
async function setup(viewport = { width: 1440, height: 900 }, mode = "fixture") {
 const page = await browser.newPage({ viewport });
 page.setDefaultTimeout(8_000);
 page.on("pageerror", (error) => failures.push(error.message));
 page.on("console", (message) => { if (message.type() === "error") console.error(message.text().slice(0, 500)); });
 let styleRequests = 0, tileRequests = 0, failedTiles = 0, failTiles = false, release;
 const gate = new Promise((resolve) => { release = resolve; });
 await page.route("https://tiles.openfreemap.org/**", (route) => {
  styleRequests++;
  return mode === "unavailable" ? route.abort() : route.fulfill({ contentType: "application/json", body: JSON.stringify(style) });
 });
 await page.route("https://fixture.invalid/tiles/**", async (route) => {
  tileRequests++;
  if (mode === "delayed") await gate;
  if (failTiles) { failedTiles++; return route.abort(); }
  const [, z, x, y] = new URL(route.request().url()).pathname.match(/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf/);
  const tile = buildings.getTile(Number(z), Number(x), Number(y));
  return route.fulfill({ contentType: "application/x-protobuf", body: Buffer.from(fromGeojsonVt({ building: tile ?? { features: [] } })) });
 });
 await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
 await page.route("**/positions", (route) => route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ available: true, trains: [], as_of: new Date().toISOString() }) }));
 await page.route("**/transit?*", (route) => route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ available: true, arrivals: [], as_of: new Date().toISOString() }) }));
 return { page, requests: () => styleRequests, tiles: () => tileRequests, failedTiles: () => failedTiles, release, fail: () => { failTiles = true; } };
}
async function capture(page, name) {
 if (!screenshots) return;
 mkdirSync(screenshots, { recursive: true });
 await page.screenshot({ path: path.join(screenshots, `${name}.jpg`), type: "jpeg", quality: 88 });
}
async function ready(page) {
 await page.locator('.rail-map-pane[data-renderer="vector"]').waitFor({ timeout: 25_000 }).catch(async (error) => {
  console.error({ url: page.url(), title: await page.title(), errors: failures, dom: await page.evaluate(() => ({ pane: document.querySelector(".rail-map-pane")?.outerHTML.slice(0, 500), state: document.querySelector(".geographic-map")?.dataset, bounds: document.querySelector(".rail-map-pane")?.getBoundingClientRect().toJSON() })) });
  throw error;
 });
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.renderedRoutes) > 0);
}
try {
 const live = await setup(), { page } = live;
 await page.goto(`${base}#atlas`);
 await page.locator(".ride-stage").waitFor();
 assert.match(await page.title(), /The Atlas/);
 assert.equal(live.requests(), 0, "vector resources are lazy until map entry");
 await page.locator(".rail-network").evaluate((element) => element.scrollIntoView());
 await ready(page);
 console.log("vector ready");
 assert.equal(await page.locator(".maplibregl-canvas").count(), 1);
 assert.equal(await page.locator(".rail-map-svg").isVisible(), false);
 await page.getByRole("button", { name: "3D tilted map", exact: true }).click();
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.pitch) > 54);
 await page.getByRole("button", { name: "Loop", exact: true }).click();
 for (let step = 0; step < 3; step++) { await page.getByRole("button", { name: "Zoom in", exact: true }).click(); await page.waitForTimeout(300); }
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.renderedBuildings) > 0);
 await capture(page, "vector-3d-fixture");
 await page.getByRole("button", { name: "2D", exact: true }).click();
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.pitch) < 1);
 await page.locator(".maplibregl-canvas").focus();
 await page.keyboard.press("Shift+ArrowUp");
 await page.keyboard.press("Shift+ArrowRight");
 await page.waitForTimeout(450);
 assert.equal(Number(await page.locator(".geographic-map").getAttribute("data-pitch")), 0, "2D stays flat under keyboard pitch gestures");
 assert.equal(Number(await page.locator(".geographic-map").getAttribute("data-bearing")), 0, "2D stays north-up under keyboard rotation gestures");
 await page.emulateMedia({ reducedMotion: "reduce" });
 await page.getByRole("button", { name: "3D tilted map" }).click();
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.pitch) === 55);
 await page.locator(".maplibregl-canvas").focus();
 await page.keyboard.press("Shift+ArrowRight");
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.bearing) > 10);
 await page.getByRole("button", { name: "Reset north" }).click();
 await page.waitForFunction(() => Number(document.querySelector(".geographic-map")?.dataset.bearing) === 0);
 await page.getByRole("button", { name: "2D", exact: true }).click();
 results.push("lazy resources, local worker, WebGL extrusion, 2D constraints, 3D keyboard/compass, reduced motion");
 const matrix = [];
 for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 600 }, { width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  await page.setViewportSize(viewport);
  await page.locator(".rail-network").evaluate((element) => element.scrollIntoView());
  await page.getByRole("button", { name: "Chicago", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search stations and places", exact: true }).fill("Kimball");
  await page.getByRole("group", { name: "Matching stations" }).getByRole("button", { name: "Kimball" }).click();
  await page.locator(".geographic-selected-label").waitFor();
  const geometry = await page.evaluate(() => {
   const r = (selector) => { const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height, right, bottom }; };
   return { viewport: { width: innerWidth, height: innerHeight }, pane: r(".rail-map-pane"), canvas: r(".maplibregl-canvas"), label: r(".geographic-selected-label"), sheet: r(".rail-sheet"), toolbar: r(".rail-topbar"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(Math.abs(geometry.canvas.height - geometry.pane.height) <= 1, "canvas fills the measured map pane within one device pixel");
  assert.ok(geometry.canvas.y >= geometry.toolbar.bottom && geometry.canvas.bottom <= viewport.height);
  assert.equal(geometry.overflow, 0);
  assert.ok(geometry.label.y >= geometry.toolbar.bottom && geometry.label.bottom <= viewport.height, `station clears controls at ${viewport.width}: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.label.right <= viewport.width && geometry.label.x >= 0);
  assert.ok(geometry.label.right <= geometry.sheet.x || geometry.label.x >= geometry.sheet.right || geometry.label.bottom <= geometry.sheet.y || geometry.label.y >= geometry.sheet.bottom, `station clears detail panel at ${viewport.width}: ${JSON.stringify(geometry)}`);
  matrix.push(geometry);
  await capture(page, `vector-station-${viewport.width}`);
  await page.getByRole("button", { name: "Close map details" }).press("Escape");
 }
 results.push("five-width vector geometry, selected station/card clearance, search and Escape");
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.getByRole("button", { name: "Food places and layers" }).click();
 await page.getByRole("button", { name: /Bavette/ }).click();
 assert.match(await page.locator(".rail-sheet").innerText(), /temporary closure/);
 await page.getByRole("button", { name: "Close map details" }).click();
 live.fail();
 for (let step = 0; step < 2; step++) { await page.getByRole("button", { name: "Zoom in", exact: true }).click(); await page.waitForTimeout(450); }
 assert.ok(live.failedTiles() > 0, "the recoverable failure test exercised a real tile request");
 assert.equal(await page.locator(".geographic-map").getAttribute("data-state"), "ready", "isolated tile errors retain the usable renderer");
 await page.locator(".maplibregl-canvas").evaluate((canvas) => canvas.dispatchEvent(new Event("webglcontextlost")));
 await page.getByText("Vector map unavailable. Local flat reference map shown.").waitFor();
 assert.ok(await page.getByRole("button", { name: "3D tilted map" }).isDisabled());
 await page.close();
 results.push("food selection, recoverable resource failure, fatal WebGL fallback");
 const delayed = await setup({ width: 1440, height: 900 }, "delayed");
 await delayed.page.goto(`${base}#map`);
 await delayed.page.locator(".maplibregl-canvas").waitFor({ state: "attached" });
 await delayed.page.getByRole("button", { name: "Loop", exact: true }).click();
 await delayed.page.waitForTimeout(400);
 delayed.release();
 await ready(delayed.page);
 assert.ok(Number(await delayed.page.locator(".geographic-map").getAttribute("data-zoom")) > 12, "latest camera survives delayed initial tiles");
 await delayed.page.close();
 results.push("camera selection during delayed initialization");
 const broken = await setup({ width: 390, height: 844 }, "unavailable");
 await broken.page.goto(`${base}#map`);
 await broken.page.getByText("Vector map unavailable. Local flat reference map shown.").waitFor();
 assert.equal(await broken.page.locator(".geographic-map").getAttribute("data-state"), "unavailable");
 assert.ok(await broken.page.locator(".rail-map-svg").isVisible());
 assert.ok(await broken.page.getByRole("button", { name: "3D tilted map" }).isDisabled());
 await broken.page.close();
 results.push("unavailable style preserves accessible flat fallback");
 assert.deepEqual(failures, []);
 console.log(JSON.stringify({ result: "passed", checks: results, matrix }, null, 2));
} finally { await browser.close(); }
