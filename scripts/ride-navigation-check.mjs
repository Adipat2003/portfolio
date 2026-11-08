import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/content/ride-navigation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("exports", "module", js)(mod.exports, mod);
const { ridePhaseOffset, rideSkipOffset, jumpInstantly, motionEase } = mod.exports;

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
assert.equal(rideSkipOffset({ rideTop: 300, rideHeight: 12 * 844 }), 300 + 12 * 844 + 8);
let call;
jumpInstantly(1234, (options) => { call = options; });
assert.deepEqual(call, { top: 1234, behavior: "instant" }, "a stop jump must never inherit smooth scrolling from the page");
console.log("ride-navigation-check: PASS (stable phase positions, skip destination, instant input response)");
