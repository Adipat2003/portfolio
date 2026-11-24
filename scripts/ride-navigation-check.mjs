import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/content/ride-navigation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("exports", "module", js)(mod.exports, mod);
const { ridePhaseOffset, ridePhaseAtProgress, rideSnapPhase, rideSkipOffset, jumpInstantly, motionEase } = mod.exports;

const remaining60 = Math.pow(1 - motionEase(1000 / 60, false), 60);
const remaining15 = Math.pow(1 - motionEase(1000 / 15, false), 15);
assert.ok(Math.abs(remaining60 - remaining15) < 1e-12, "camera settling must depend on elapsed time, not frame rate");
assert.equal(motionEase(100, true), 1);
assert.equal(motionEase(0, false), 0);
assert.equal(motionEase(-5, false), 0);
assert.equal(motionEase(5000, false), motionEase(100, false), "returning from a suspended tab must not snap the ride camera in one frame");

const total = 12 * 844 - 844;
const stops = 8;
assert.equal(ridePhaseOffset({ rideTop: 300, rideHeight: 12 * 844, viewportHeight: 844, target: 1, stopCount: stops }), 300 + total * (.84 / stops));
assert.equal(ridePhaseOffset({ rideTop: 300, rideHeight: 12 * 844, viewportHeight: 844, target: stops, stopCount: stops }), 300 + total * .84);
for (let target = 0; target <= stops; target++) {
  const offset = ridePhaseOffset({ rideTop: 300, rideHeight: 12 * 844, viewportHeight: 844, target, stopCount: stops });
  assert.ok(Math.abs(ridePhaseAtProgress((offset - 300) / total, stops) - target) < 1e-12);
}
assert.equal(ridePhaseAtProgress(.88, stops), stops, "the terminal holds while scrolling through its section");
assert.equal(ridePhaseAtProgress(1, stops), stops + 1);
const approach = (phase) => phase / stops * .84;
assert.equal(rideSnapPhase(approach(1.4), stops), 1, "a nearby stop is selected looking back");
assert.equal(rideSnapPhase(approach(1.6), stops), 2, "a nearby stop is selected looking ahead");
assert.equal(rideSnapPhase(approach(1.5), stops), null, "the exact gap stays neutral");
assert.equal(rideSnapPhase(approach(.3), stops), null, "the opening scene stays free");
assert.equal(rideSnapPhase(approach(stops - .3), stops), stops, "the terminal can be reached by snapping");
assert.equal(rideSnapPhase(.88, stops), null, "the terminal hold does not pull readers back");
assert.equal(rideSnapPhase(1, stops), null, "the ride exit stays free");
assert.equal(rideSkipOffset({ rideTop: 300, rideHeight: 12 * 844 }), 300 + 12 * 844 + 8);
let call;
jumpInstantly(1234, (options) => { call = options; });
assert.deepEqual(call, { top: 1234, behavior: "instant" }, "a stop jump must never inherit smooth scrolling from the page");
console.log("ride-navigation-check: PASS (stable phase positions, skip destination, instant input response)");
