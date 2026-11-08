import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

const root = (file) => new URL(file, import.meta.url);
const read = (file) => readFileSync(root(file), "utf8");

const sprite = (() => {
  const js = ts.transpileModule(read("../src/content/train-sprite.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((path) => { throw new Error(`Unexpected dependency ${path}`); }, module, module.exports);
  return module.exports;
})();
const network = JSON.parse(read("../content/cta-network.json"));
const projection = network.projection;
const vector = (() => {
  const js = ts.transpileModule(read("../src/content/geographic-map.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((path) => {
    if (path === "./cta-geometry") {
      const geometry = ts.transpileModule(read("../src/content/cta-geometry.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
      const nested = { exports: {} };
      new Function("require", "module", "exports", geometry)(() => null, nested, nested.exports);
      return nested.exports;
    }
    return null;
  }, module, module.exports);
  return module.exports;
})();

/* ---------------------------------------------------------------- module --- */
const colorHex = "#f25b70";
const tinted = sprite.trainSprite(colorHex);
const neutral = sprite.trainSprite(sprite.SPRITE_FALLBACK_TINT);
assert.equal(sprite.trainSprite(colorHex).length, neutral.length, "an authored sprite has a stable shape count");
assert.equal(sprite.trainSprite("#123456").length, neutral.length);
assert.deepEqual(sprite.trainSprite("#zzzzzz"), neutral, "a malformed tint falls back to the neutral roof instead of drawing an unreadable band");

for (const [index, shapes] of [tinted, neutral].entries()) {
  const expectedTint = index === 0 ? colorHex : sprite.SPRITE_FALLBACK_TINT;
  for (const shape of shapes) {
    if (shape.shape === "rect") {
      assert.ok(shape.x >= -12.5 && shape.x + shape.w <= 12.5, `sprite stays inside its 25 unit footprint: ${JSON.stringify(shape)}`);
      assert.ok(shape.y >= -6 && shape.y + shape.h <= 6.2, `sprite stays inside its 12 unit height: ${JSON.stringify(shape)}`);
      assert.ok(shape.w > 0 && shape.h > 0, "no degenerate rects");
      assert.ok(shape.r >= 0 && shape.r <= Math.min(shape.w, shape.h) / 2, "corner radii stay drawable");
    } else {
      assert.ok(Math.abs(shape.cx) + shape.r <= 12.5, `circle stays inside the footprint: ${JSON.stringify(shape)}`);
      assert.ok(Math.abs(shape.cy) + shape.r <= 6.2, `circle stays inside the height: ${JSON.stringify(shape)}`);
      assert.ok(shape.r > 0, "no degenerate circles");
    }
    assert.match(shape.fill, /^#[0-9a-f]{6}$/i, `authored palette only: ${shape.fill}`);
  }
  assert.equal(shapes.filter((shape) => shape.shape === "circle" && shape.fill === sprite.SPRITE_PALETTE.lamp).length, 1, "exactly one warm headlamp");
  assert.equal(shapes.filter((shape) => shape.shape === "circle" && shape.fill === sprite.SPRITE_PALETTE.tail).length, 1, "exactly one tail marker");
  assert.equal(shapes.filter((shape) => shape.shape === "rect" && /^#[0-9a-f]{6}$/i.test(shape.fill) && shape.h > 2.5 && shape.w > 15).length, 2, "body plus roof band, and only those two large masses");
  assert.equal(shapes.filter((shape) => shape.shape === "rect" && shape.fill === sprite.SPRITE_PALETTE.glass && shape.h === 2.8).length, 4, "four passenger windows");
  assert.equal(shapes.filter((shape) => shape.fill === expectedTint).length, 1, "exactly one tinted roof band");
  assert.ok(shapes.some((shape) => shape.shape === "circle" && shape.cx > 8), "the headlamp belongs at the nose");
  assert.ok(shapes.some((shape) => shape.shape === "circle" && shape.cx < -8), "the tail marker belongs at the rear");
  assert.notEqual(shapes.find((shape) => shape.cx > 8).fill, shapes.find((shape) => shape.cx < -8).fill, "front and rear markers are distinct");
}
assert.equal(neutral.filter((shape) => shape.fill === colorHex).length, 0, "the neutral sprite carries no route colour");
assert.equal(tinted.filter((shape) => shape.fill === sprite.SPRITE_FALLBACK_TINT).length, 0, "the tinted sprite carries no leftover neutral roof");

assert.equal(sprite.spriteBearing(90), 0, "east heading stays level with the +x nose");
assert.equal(sprite.spriteBearing(0), -90, "north heading faces up");
assert.equal(sprite.spriteBearing(180), 90, "south heading faces down");
assert.equal(sprite.spriteBearing(270), 180, "west heading faces back");
assert.equal(sprite.spriteBearing(NaN), 0, "a missing heading must not rotate the sprite");
assert.equal(sprite.spriteBearing(Infinity), 0);
assert.equal(sprite.spriteBearing(undefined), 0);
assert.equal(sprite.spriteImageName("red"), "atlas-train-red");
assert.equal(sprite.spriteImageName("brn"), "atlas-train-brn");
assert.equal(sprite.spriteTint("#bd9271"), "#bd9271");
assert.equal(sprite.spriteTint("not-a-color"), sprite.SPRITE_FALLBACK_TINT);
assert.equal(sprite.spriteTint(undefined), sprite.SPRITE_FALLBACK_TINT);
assert.match(sprite.SPRITE_FALLBACK_TINT, /^#[0-9a-f]{6}$/i, "the fallback tint is an authored colour");
assert.deepEqual(sprite.spriteImageSize(), { width: 48, height: 24 }, "2x device pixels for a 24x12 sprite");
assert.deepEqual(sprite.spriteImageSize(3), { width: 72, height: 36 });
assert.equal(sprite.TRAIN_SPRITE_GRID.width / sprite.TRAIN_SPRITE_GRID.height, 2, "the sprite is a 2:1 car body");
assert.equal(sprite.TRAIN_SPRITE_PIXEL_RATIO, 2, "retina sprites stay cheap");

/* --------------------------------------------------------------- raster --- */
const meterW = 48, meterH = 24, meterTotal = meterW * meterH, unit = 2;
function paint(shapes) {
  const grid = { width: meterW, height: meterH, pixels: new Map() };
  const put = (x, y, shape) => {
    if (x < 0 || y < 0 || x >= meterW || y >= meterH) return;
    grid.pixels.set(`${x},${y}`, [shape.fill, Math.round((shape.opacity ?? 1) * 255)]);
  };
  for (const shape of shapes) {
    if (shape.shape === "rect") {
      const x0 = Math.round(meterW / 2 + shape.x * unit), y0 = Math.round(meterH / 2 + shape.y * unit);
      const x1 = Math.round(meterW / 2 + (shape.x + shape.w) * unit), y1 = Math.round(meterH / 2 + (shape.y + shape.h) * unit);
      const r = Math.round(shape.r * unit);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (r > 0) {
          const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
          if (Math.hypot(x - cx, y - cy) > r) continue;
        }
        put(x, y, shape);
      }
    } else {
      const cx = Math.round(meterW / 2 + shape.cx * unit), cy = Math.round(meterH / 2 + shape.cy * unit), rr = Math.round(shape.r * unit);
      for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) if (Math.hypot(x - cx, y - cy) <= rr) put(x, y, shape);
    }
  }
  return grid;
}
const pixels = paint(tinted);
assert.ok(pixels.pixels.size > meterTotal * 0.5 && pixels.pixels.size < meterTotal * 0.95,
  `the sprite reads as a solid car, not a blank frame: coverage ${(pixels.pixels.size / meterTotal * 100).toFixed(1)}%`);
assert.ok(new Set([...pixels.pixels.values()].map(([fill]) => fill)).size >= 8, "the sprite carries its authored palette");
// The route tint must be painted, and it must live on the roof band, not on an edge or the skirt.
const roof = tinted.find((shape) => shape.fill === colorHex);
const tintRows = [...pixels.pixels].filter(([, [fill]]) => fill === colorHex).map(([key]) => Number(key.split(",")[1]));
assert.ok(tintRows.length > 60, `the route stripe is a real band: ${tintRows.length} painted pixels`);
assert.ok(Math.min(...tintRows) >= Math.round(meterH / 2 + roof.y * unit) - 1, "the tint starts at the roof, not on the body");
assert.ok(Math.max(...tintRows) <= Math.round(meterH / 2 + (roof.y + roof.h) * unit), "the tint never paints below the roof band");
// Direction: a warm lamp paints in the nose box, and no warm headlamp sits in the mirrored tail box.
const lamp = tinted.find((shape) => shape.fill === sprite.SPRITE_PALETTE.lamp);
const tail = tinted.find((shape) => shape.fill === sprite.SPRITE_PALETTE.tail);
const box = (shape) => [Math.round(meterW / 2 + shape.cx * unit) - Math.round(shape.r * unit), Math.round(meterH / 2 + shape.cy * unit) - Math.round(shape.r * unit),
  Math.round(meterW / 2 + shape.cx * unit) + Math.round(shape.r * unit), Math.round(meterH / 2 + shape.cy * unit) + Math.round(shape.r * unit)];
const channels = (fill) => [parseInt(fill.slice(1, 3), 16), parseInt(fill.slice(3, 5), 16), parseInt(fill.slice(5, 7), 16)];
const filledIn = (fill, [x0, y0, x1, y1]) => [...pixels.pixels].filter(([key, [painted]]) => {
  const [x, y] = key.split(",").map(Number);
  return painted === fill && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}).length;
assert.ok(filledIn(sprite.SPRITE_PALETTE.lamp, box(lamp)) > 0, "the headlamp paints its warm light at the nose");
assert.equal(filledIn(sprite.SPRITE_PALETTE.lamp, box(tail)), 0, "no warm headlamp light sits in the tail box");
assert.ok(filledIn(sprite.SPRITE_PALETTE.tail, box(tail)) > 0, "the tail marker paints its own dim red at the rear");
const [lampR, lampG, lampB] = channels(sprite.SPRITE_PALETTE.lamp);
const [tailR, tailG, tailB] = channels(sprite.SPRITE_PALETTE.tail);
assert.ok(lampR > tailR && lampG > tailG, `the headlamp is brighter than the tail marker: ${lampR}/${lampG}/${lampB} vs ${tailR}/${tailG}/${tailB}`);
// Tinted and neutral sprites are the same drawing with one band swapped.
const neutralPixels = paint(neutral);
let different = 0;
for (const [key, [fill]] of pixels.pixels) if (neutralPixels.pixels.get(key)?.[0] !== fill) different++;
assert.ok(different > 60, `the route tint must be visible, not an edge artifact: ${different} pixels`);

/* -------------------------------------------------------------- canvas --- */
function recordingContext() {
  const calls = [];
  return Object.assign(Object.create({
    calls,
    beginPath() { calls.push(["beginPath"]); }, closePath() { calls.push(["closePath"]); },
    moveTo(x, y) { calls.push(["moveTo", x, y]); }, lineTo(x, y) { calls.push(["lineTo", x, y]); },
    arcTo(x1, y1, x2, y2, r) { calls.push(["arcTo", x1, y1, x2, y2, r]); },
    fill() { calls.push(["fill", this.fillStyle, this.globalAlpha]); }, stroke() { calls.push(["stroke", this.strokeStyle, this.lineWidth]); },
    save() { calls.push(["save"]); }, restore() { calls.push(["restore"]); },
    translate(x, y) { calls.push(["translate", x, y]); }, scale(sx, sy) { calls.push(["scale", sx, sy]); },
  }), { fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1 });
}
const context = recordingContext();
assert.deepEqual(sprite.drawTrainSprite(context, colorHex), { width: 48, height: 24 });
const fills = context.calls.filter(([op]) => op === "fill");
const strokes = context.calls.filter(([op]) => op === "stroke");
assert.equal(fills.length, tinted.length, "every authored shape is filled by the canvas renderer");
assert.equal(strokes.length, 1, "only the car body carries an outline");
assert.ok(context.calls.some(([op, x, y]) => op === "translate" && x === 24 && y === 12), "the canvas is centred on the sprite origin");
assert.ok(fills.some(([, style]) => style === colorHex), "the canvas renderer paints the route tint");
assert.ok(context.calls.filter(([op]) => op === "arcTo").length >= tinted.length * 4, "rounded corners are drawn as arcs, not skipped");
assert.ok(context.calls.some(([op, , alpha]) => op === "fill" && Math.abs(alpha - 0.4) < 1e-9), "the shadow keeps its authored opacity");

/* ------------------------------------------------------- vector layer --- */
const iconImage = createExpression(["case", ["any", ["!", ["has", "route"]], ["==", ["get", "route"], ""]], sprite.spriteImageName(""), ["concat", "atlas-train-", ["get", "route"]]], "layout.icon-image");
const iconRotate = createExpression(["get", "bearing"], "layout.icon-rotate");
assert.equal(iconImage.result, "success", "the sprite selection expression must validate");
assert.equal(iconRotate.result, "success", "the bearing expression must validate");
assert.equal(iconImage.value.evaluate({ zoom: 16 }, { type: 3, properties: { route: "red" } }), "atlas-train-red");
assert.equal(iconImage.value.evaluate({ zoom: 16 }, { type: 3, properties: {} }), sprite.spriteImageName(""), "trains without a route still resolve a registered image");
assert.equal(iconImage.value.evaluate({ zoom: 16 }, { type: 3, properties: { route: "" } }), sprite.spriteImageName(""), "empty routes explicitly resolve the neutral sprite");
assert.equal(iconRotate.value.evaluate({ zoom: 16 }, { type: 3, properties: { bearing: 45 } }), 45);

/* --------------------------------------------------- component wiring --- */
const componentSource = read("../src/components/atlas/GeographicMap.tsx");
const fallbackSource = read("../src/components/atlas/CtaRailMap.tsx");
assert.doesNotMatch(componentSource, /\.fillRect\(/, "GeographicMap must not author its own canvas sprite");
assert.match(componentSource, /train-sprite/, "GeographicMap must read the shared sprite");
assert.match(componentSource, /spriteBearing/, "both renderers must rotate by the same heading rule");
assert.match(componentSource, /spriteImageName/, "vector images are named by the shared helper");
assert.match(componentSource, /spriteTint/, "vector images take their tint from the shared helper");
assert.doesNotMatch(fallbackSource, /className="sprite-(car|window|shadow|roof|track|lamp|coupler)"/, "the SVG fallback must not redraw sprite markup by hand");
assert.match(fallbackSource, /train-sprite/, "the SVG fallback must read the shared sprite");
assert.match(fallbackSource, /spriteBearing/, "the SVG fallback must rotate by the shared heading rule");

// Drive the real component against a controlled renderer boundary.
const images = [], layers = [], layerInsertions = [], sources = [], data = [], fits = [], states = [];
const callbacks = new Map();
let effects = [], engine, removed = false, refCount = 0;
const host = { dataset: {}, getBoundingClientRect: () => ({ width: 1440, height: 900, right: 1440, bottom: 900 }), closest: () => null };
const canvas = { setAttribute() {}, addEventListener() {}, removeEventListener() {} };
const buffer = { width: 48, height: 24, data: new Uint8ClampedArray(48 * 24 * 4) };
const context2d = new Proxy({}, { get: (_target, key) => (key === "getImageData" ? () => buffer : () => {}) });
const interaction = { enable() {}, disable() {}, enableRotation() {}, disableRotation() {} };
const lib = {
  setWorkerUrl() {},
  Map: class {
    constructor() { engine = this; removed = false; this.dragRotate = interaction; this.touchZoomRotate = interaction; this.touchPitch = interaction; this.keyboard = interaction; }
    getCanvas() { return canvas; }
    on(name, callback) { callbacks.set(name, callback); }
    getStyle() { return { version: 8, sources: { basemap: { type: "vector" } }, layers: [
      { id: "base-building", type: "fill", source: "basemap", "source-layer": "building" },
      { id: "base-label", type: "symbol", source: "basemap", "source-layer": "place" },
    ] }; }
    addLayer(spec, beforeId) { layers.push(spec); layerInsertions.push({ id: spec.id, beforeId }); }
    addSource(id, spec) { sources.push({ id, spec }); }
    getSource(id) { return sources.some((source) => source.id === id) ? { setData(value) { data.push(value); } } : null; }
    addImage(id, image, options) { images.push({ id, options, image }); }
    setPaintProperty() {} setFilter() {} resize() {} easeTo() {} getLayer() { return false; } remove() { removed = true; } triggerRepaint() {}
    fitBounds(bounds, options) { fits.push({ bounds, options }); }
  },
};
const componentJS = ts.transpileModule(componentSource.replaceAll("import.meta.url", JSON.stringify(import.meta.url)), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const componentModule = { exports: {} };
new Function("require", "module", "exports", componentJS)((name) => {
  if (name === "react") return { forwardRef: (component) => component, useRef: (initial) => ({ current: refCount++ === 0 ? host : refCount === 2 ? (engine ?? null) : initial }), useEffect: (effect) => effects.push(effect), useState: (initial) => [initial === "loading" && engine && !removed ? "ready" : initial, () => {}], useImperativeHandle() {} };
  if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" };
  if (name === "maplibre-gl") return lib;
  if (name === "@/content/geographic-map") return vector;
  if (name === "@/content/train-sprite") return sprite;
  if (name.endsWith(".css")) return {};
  throw new Error(`Unexpected component dependency ${name}`);
}, componentModule, componentModule.exports);
const saved = new Map(["window", "document", "ResizeObserver", "fetch", "cancelAnimationFrame", "requestAnimationFrame"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let cleanup;
try {
  globalThis.cancelAnimationFrame = () => {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.window = { setTimeout: () => 1, clearTimeout() {}, matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.fetch = async () => ({ ok: true, url: "https://styles.example/style.json", json: async () => ({ version: 8, sources: {}, layers: [] }) });
  const colors = { red: "#f25b70", blue: "#36b9ee", brn: "#bd9271", g: "#48c17b", org: "#ff814d", p: "#b49be4", pink: "#ed9fc5", y: "#f9e300" };
  const props = {
    active: true, network, colors, box: [-220, -230, 420, 540], route: "all", selected: "", mode: "2d", onState() {}, onGesture() {},
    places: [{ id: "place", point: [0, 0] }],
    trains: [{ id: "t1", point: [10, 20], route: "red", heading: 90 }, { id: "t2", point: [30, 40], route: "brn", heading: 0 }, { id: "t3", point: [50, 60] }],
  };
  const render = (next) => { effects = []; refCount = 0; componentModule.exports.default(next, null); };
  render(props);
  cleanup = effects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(engine, "the controlled renderer must construct");
  callbacks.get("load")();
  assert.equal(layerInsertions.find((entry) => entry.id === "atlas-buildings")?.beforeId, "base-label", "3D buildings must paint beneath the basemap's first text label");
  const registered = new Set(images.map((image) => image.id));
  for (const route of network.routes) assert.ok(registered.has(sprite.spriteImageName(route.id)), `sprite registered for ${route.id}`);
  assert.ok(registered.has(sprite.spriteImageName("")), "the neutral fallback sprite is registered");
  assert.equal(images.length, network.routes.length + 1, "one sprite per line, plus the fallback");
  for (const image of images) {
    assert.deepEqual([image.options?.pixelRatio, image.image?.width, image.image?.height], [sprite.TRAIN_SPRITE_PIXEL_RATIO, 48, 24], "sprite images are 2x the authored 24x12 grid");
    assert.equal(image.image.data.length, 48 * 24 * 4, "the pixel buffer is a full RGBA image");
  }
  const trainLayer = layers.find((layer) => layer.id === "atlas-train");
  assert.ok(trainLayer, "the train layer is added");
  assert.equal(trainLayer.type, "symbol");
  assert.deepEqual(trainLayer.layout["icon-image"], ["case", ["any", ["!", ["has", "route"]], ["==", ["get", "route"], ""]], sprite.spriteImageName(""), ["concat", "atlas-train-", ["get", "route"]]], "absent and empty routes explicitly select the neutral sprite");
  const actualIcon = createExpression(trainLayer.layout["icon-image"], "layout.icon-image");
  assert.equal(actualIcon.result, "success");
  assert.equal(actualIcon.value.evaluate({ zoom: 16 }, { type: 3, properties: { route: "" } }), sprite.spriteImageName(""), "the normalized unknown route uses the registered image");
  assert.deepEqual(trainLayer.layout["icon-rotate"], ["get", "bearing"]);
  assert.equal(trainLayer.layout["icon-rotation-alignment"], "viewport");
  assert.equal(trainLayer.layout["icon-allow-overlap"], false, "train sprites must not stack");
  assert.ok(sources.some((spec) => spec.id === "atlas-trains"), "the train source is added");
  render({ ...props, trains: [{ id: "t4", point: [12, 34], route: "red", heading: 90 }] });
  effects[1]();
  const setTrains = data.at(-1);
  assert.equal(setTrains.type, "FeatureCollection");
  assert.deepEqual(setTrains.features[0].properties, { id: "t4", route: "red", bearing: sprite.spriteBearing(90) }, "the vector renderer carries the route and the shared rotation");
  render({ ...props, trains: [{ id: "unknown", point: [12, 34], route: "ZZ", heading: 0 }] });
  effects[1]();
  assert.equal(data.at(-1).features[0].properties.route, "", "an unrecognized route uses the registered neutral train image");
  const fallbackJS = ts.transpileModule(fallbackSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  assert.match(fallbackJS, /TrainSprite/, "the transpiled fallback uses the shared authored component");
  assert.match(read("../src/components/atlas/TrainSprite.tsx"), /trainSprite\(/, "the SVG component draws the shared authored shapes");
} finally {
  cleanup?.();
  for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
console.log("train-sprite-check: PASS (authored shapes, raster coverage, canvas renderer, vector sprite layer, shared geometry)");
