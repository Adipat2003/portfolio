/**
 * End-to-end probe for the Node service. Builds must exist first
 * (npm run build:service). Spawns the service on a scratch port and asserts
 * the MCP protocol, the weather proxy, and the ask-model degradation path.
 *
 * Plain Node ESM, no dependencies, same style as the other check scripts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCtaNetworkProxy } from "../server/dist/server/cta-network.js";
import { clampedCamera, projectCoordinate, positionOnRoute } from "../server/dist/src/content/cta-geometry.js";
import { createTransitGuide } from "../server/dist/server/transit-guide.js";
import { createCtaProxy } from "../server/dist/server/cta.js";
import { spawn } from "node:child_process";
import process from "node:process";

const PORT = 8871;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
let child;

function ok(name, condition, detail = "") {
	const tag = condition ? "ok  " : "FAIL";
	if (!condition) failures += 1;
	console.log(`${tag} ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function post(path, body, headers = {}) {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
	return { status: res.status, json: await res.json().catch(() => null) };
}

async function get(path, headers = {}) {
	const res = await fetch(`${BASE}${path}`, { headers });
	return { status: res.status, json: await res.json().catch(() => null) };
}

function rpc(method, params, id = 1) {
	return { jsonrpc: "2.0", id, method, params };
}

async function checkTransitGuide() {
	const originalFetch = globalThis.fetch;
	const now = new Date().toISOString();
	const opts = { stations:[{id:"40380",name:"Clark/Lake",routes:["blue"]}], network:{
		positions:async()=>({available:true,trains:[],as_of:now}),
		alerts:async()=>({available:true,routes:[{route:"blue",status:"Minor Delays"}],as_of:now}),
		disruptions:async()=>({available:true,alerts:[{headline:"Station closure",description:"Use adjacent stations.",routes:["blue"],url:"https://www.transitchicago.com/alerts/"}],as_of:now}),
	}, cta:{ get:async()=>({available:true,station:"Clark/Lake",as_of:now,arrivals:[{line:"blue",destination:"Forest Park",minutes:7,isScheduled:true,isDelayed:true}]}) }, model:"fixture",endpoint:"https://model.invalid" };
	try {
		const fallback = await createTransitGuide(opts)("When is the next train?","40380");
		assert.match(fallback.answer,/7 min.*scheduled.*delay flagged/);
		assert.equal(fallback.model_used,false);
		assert.equal((await createTransitGuide(opts)("Tell me a cake recipe")).evidence.length,0);
		const blue = await createTransitGuide(opts)("Where are Blue Line trains?");
		assert.ok(blue.evidence.length > 0 && blue.evidence.every((record)=>record.text.startsWith("Blue")), "explicit line questions do not include other lines");
		const chicagoOpts={...opts,stations:[{id:"40710",name:"Chicago (Brown/Purple)",routes:["brn","p"]},{id:"41410",name:"Chicago (Blue)",routes:["blue"]}]};
		assert.match((await createTransitGuide(chicagoOpts)("Next train at Chicago?")).answer,/Which station/);
		assert.ok(!(await createTransitGuide(chicagoOpts)("How many trains in Chicago?")).answer.includes("Which station"));
		const alerts = await createTransitGuide(opts)("Any closures?");
		assert.match(alerts.answer,/Station closure/);
		globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"record_ids":["r0"]}'}}]});
		const answer=await createTransitGuide({...opts,apiKey:"fixture"})("Next train?","40380");
		assert.equal(answer.model_used,true);
		assert.equal(answer.evidence.length,1);
		assert.match(answer.answer,/scheduled/);
		globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"record_ids":["invented"],"answer":"Made-up blockade"}'}}]});
		const rejected=await createTransitGuide({...opts,apiKey:"fixture"})("Any closures?");
		assert.equal(rejected.model_used,false);
		assert.ok(!rejected.answer.includes("Made-up"));
		globalThis.fetch=async()=>Response.json({CTAAlerts:{ErrorCode:"0",Alert:{AlertId:"123",Headline:"<b>Closure</b>",ShortDescription:"<p>Use another station.</p>",SeverityScore:"12",ImpactedService:{Service:[{ServiceType:"R",ServiceId:"Blue"},{ServiceType:"T",ServiceId:"40380"}]},AlertURL:{"#cdata-section":"javascript:invalid"}}}});
		const proxy=createCtaNetworkProxy({ttlMs:0});
		const feed=await proxy.disruptions();
		assert.equal(feed.alerts[0].headline,"Closure");
		assert.deepEqual(feed.alerts[0].routes,["blue"]);
		assert.deepEqual(feed.alerts[0].stations,["40380"]);
		assert.match(feed.alerts[0].url,/^https:\/\/www\.transitchicago\.com\//);
		globalThis.fetch=async()=>{throw new Error("Offline");};
		const failed=await createCtaNetworkProxy({}).disruptions();
		assert.equal(failed.available,false);
		assert.deepEqual(failed.alerts,[]);
		ok("Transit guide uses current evidence, preserves uncertainty and rejects invented model facts; official alerts normalize safely",true);
	} finally {globalThis.fetch=originalFetch;}
}

async function checkCtaNormalization() {
	const originalFetch = globalThis.fetch;
	let calls = 0;
	let body = { ctatt: { tmst: "2026-10-27T23:58:00", eta: [
		{ rt: "Blue", destNm: "O'Hare", stpDe: "Service toward O'Hare", prdt: "2026-10-27T23:58:00", arrT: "2026-10-28T00:03:00", isApp: "0", isDly: "1", isSch: "0" },
		{ rt: "Brn", destNm: "Kimball", prdt: "20261027 23:58:00", arrT: "20261027 23:58:20", isApp: 1, isSch: true },
		{ rt: "G", destNm: "Harlem", prdt: "2026-10-27T23:58:00", arrT: "invalid" },
		{ rt: "Org", destNm: "Midway", prdt: "invalid", arrT: "2026-10-28T00:03:00" },
		{ rt: "P", destNm: "Linden", prdt: "2026-10-27T23:58:00", arrT: "2026-10-27T23:55:00" },
	] } };
	try {
		globalThis.fetch = async () => {
			calls++;
			return Response.json(body);
		};
		const proxy = createCtaProxy({ apiKey: "fixture", mapid: "40380", ttlMs: 60_000 });
		const result = await proxy.get();
		assert.equal(result.available, true);
		assert.deepEqual(result.arrivals, [
			{ line: "brn", destination: "Kimball", direction: "", minutes: 0, isApproaching: true, isDelayed: false, isScheduled: true },
			{ line: "blue", destination: "O'Hare", direction: "Service toward O'Hare", minutes: 5, isApproaching: false, isDelayed: true, isScheduled: false },
		]);
		await proxy.get();
		assert.equal(calls, 1, "cached station avoids another upstream call");
		const expiring = createCtaProxy({ apiKey: "fixture", mapid: "40380", ttlMs: 0 });
		await expiring.get();
		globalThis.fetch = async () => { throw new Error("upstream failure"); };
		assert.equal((await expiring.get()).available, false, "expired arrivals cannot masquerade as live");
		body = { ctatt: { eta: [] } };
		globalThis.fetch = async () => Response.json(body);
		const empty = await expiring.get();
		assert.equal(empty.available, true);
		assert.deepEqual(empty.arrivals, []);
		body = { ctatt: { errCd: "100", errNm: "invalid request" } };
		assert.equal((await expiring.get()).available, false);
		ok("CTA timestamps, midnight, flags, malformed/departed rows, cache and failures", true);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

async function checkNetworkFeed() {
	const originalFetch = globalThis.fetch;
	const network = JSON.parse(readFileSync("content/cta-network.json", "utf8"));
	const savedNow = Date.now;
	let now = savedNow();
	let calls = 0;
	const train = { rn: "123", lat: "41.885737", lon: "-87.630886", heading: "90", destNm: "O'Hare", nextStaId: "40380", nextStaNm: "Clark/Lake", arrT: "2026-10-27T00:30:00", isApp: "1", isDly: "1" };
	try {
		Date.now = () => now;
		globalThis.fetch = async (url) => {
			calls++;
			assert.ok(String(url).includes("rt=red,blue,brn,g,org,p,pink,y"));
			await new Promise((resolve) => setTimeout(resolve, 5));
			return Response.json({ ctatt: { errCd: "0", route: [{ "@name": "blue", train: [train,
				{ ...train, rn: "124", lat: "NaN" }, { ...train, rn: "125", lon: null },
				{ ...train, rn: "126", lat: "0" }, { ...train, rn: "127", heading: "360" },
				{ ...train, rn: "128", isSch: "1" } ] }] } });
		};
		const proxy = createCtaNetworkProxy({ apiKey: "fixture", ttlMs: 100 });
		const responses = await Promise.all([proxy.positions(), proxy.positions(), proxy.positions()]);
		assert.equal(calls, 1, "cold concurrent readers share one CTA request");
		assert.equal(responses[0].available, true);
		assert.equal(responses[0].trains.length, 1, "invalid/scheduled records never become live markers");
		assert.equal(responses[0].trains[0].isApproaching, true);
		assert.equal(responses[0].trains[0].isDelayed, true);
		await proxy.positions();
		assert.equal(calls, 1);
		now += 101;
		await proxy.positions();
		assert.equal(calls, 2, "positions refresh after TTL");
		now += 101;
		globalThis.fetch = async () => { throw new Error("upstream unavailable"); };
		assert.equal((await proxy.positions()).available, false, "no stale live markers after failure");
		assert.equal((await createCtaNetworkProxy({}).positions()).trains.length, 0);
		globalThis.fetch = async () => Response.json({ ctatt: { errCd: "0", route: [] } });
		assert.deepEqual((await proxy.positions()).trains, []);
		globalThis.fetch = async () => Response.json({ ctatt: { errCd: "100", route: [] } });
		now += 101;
		assert.equal((await proxy.positions()).available, false);
		globalThis.fetch = async () => Response.json({ CTARoutes: { ErrorCode: "0", RouteInfo: [
			{ ServiceId: "Red", RouteStatus: "Normal Service" }, { ServiceId: "Pexp", RouteStatus: "Planned Work" }, { ServiceId: "22", RouteStatus: "Normal Service" },
		] } });
		assert.deepEqual((await proxy.alerts()).routes, [{ route: "red", status: "Normal Service" }, { route: "pexp", status: "Planned Work" }]);
		let stationCalls = 0;
		globalThis.fetch = async () => { stationCalls++; await new Promise((resolve) => setTimeout(resolve, 5)); return Response.json({ ctatt: { eta: [] } }); };
		const arrivals = createCtaProxy({ apiKey: "fixture", mapid: "40380", ttlMs: 100, extraStations: network.stations });
		await Promise.all([arrivals.get("41290"), arrivals.get("41290")]);
		assert.equal(stationCalls, 1, "both map boards coalesce station arrivals");
		assert.equal(arrivals.hasStation("41290"), true);
		assert.equal(arrivals.hasStation("99999"), false);
		assert.deepEqual(projectCoordinate(41.9, -87.7, network.projection), [0, -0]);
		for (const station of network.stations) {
			const point = projectCoordinate(station.lat, station.lon, network.projection);
			assert.ok(Math.hypot(point[0] - station.point[0], point[1] - station.point[1]) < .01, "browser and converter projection agree within a metre");
		}
		const blue = network.routes.find((r) => r.id === "blue");
		assert.ok(positionOnRoute(projectCoordinate(41.885737, -87.630886, network.projection), blue));
		assert.equal(positionOnRoute([10000, 10000], blue), null);
		assert.equal(positionOnRoute([NaN, 0], blue), null);
		for (const [width, height] of [[1920,1080],[1440,900],[1366,768],[1280,800],[1024,768],[1280,600],[820,1180],[768,1024],[390,844]]) {
			const layout = { width: width <= 860 ? width * 3 : width, height: (width <= 860 ? width * 3 : width) * .45, top: 63, left: 0 };
			for (const x of [0, 200, 1140, 1200]) {
				const camera = clampedCamera(layout, { width, height }, { x, y: 300, zoom: 1.3 }, { width: 1200, height: 540 }, .5);
				assert.ok(camera.x <= 0 && camera.x + layout.width * camera.zoom >= width - .01, "camera cannot reveal a horizontal canvas edge");
			}
		}
		ok("CTA positions, shared caches, station coverage, service context, projection and bounded camera", true);
	} finally { globalThis.fetch = originalFetch; Date.now = savedNow; }
}

async function main() {
	await checkTransitGuide();
	await checkCtaNormalization();
	await checkNetworkFeed();
	child = spawn("node", ["server/dist/server/index.js"], {
		env: { ...process.env, CTA_API_KEY: "", NVIDIA_API_KEY: "", PORT: String(PORT), SERVICE_PORT: String(PORT), SERVICE_HOST: "127.0.0.1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	await new Promise((resolve) => child.stdout.once("data", resolve));

	try {
		// Health
		const health = await get("/health");
		ok("health responds", health.status === 200 && health.json.ok === true);
		ok(
			"model polish disabled without a key",
			health.json.model_polish === false,
			`model_polish=${health.json.model_polish}`,
		);

		// MCP protocol
		const init = await post("/mcp", rpc("initialize", {}));
		ok(
			"initialize returns protocol version",
			init.status === 200 && init.json.result.protocolVersion === "2026-07-28",
		);

		const tools = await post("/mcp", rpc("tools/list", {}));
		const toolNames = (tools.json.result.tools ?? []).map((t) => t.name);
		ok(
			"tools/list returns the five tools",
			toolNames.join(",") === "list_projects,get_project,get_impact_figures,get_artwork_provenance,ask",
			toolNames.join(","),
		);

		const project = await post("/mcp", rpc("tools/call", { name: "get_project", arguments: { slug: "ece391-os-kernel" } }));
		const projectRecord = JSON.parse(project.json.result.content[0].text);
		ok(
			"get_project returns the full record",
			projectRecord.slug === "ece391-os-kernel" && Array.isArray(projectRecord.figures),
		);

		const ask = await post("/mcp", rpc("tools/call", { name: "ask", arguments: { question: "How does the offline sync stay correct?" } }));
		const askResult = JSON.parse(ask.json.result.content[0].text);
		ok(
			"ask grounds the curated example",
			askResult.grounded === true && askResult.sources.includes("Contribution log, offline-first sync section"),
			`sources=${(askResult.sources ?? []).join("|")}`,
		);

		const decline = await post("/mcp", rpc("tools/call", { name: "ask", arguments: { question: "zzz qqq vvv" } }));
		const declineResult = JSON.parse(decline.json.result.content[0].text);
		ok("ask declines unsupported questions", declineResult.grounded === false);

		const unknown = await post("/mcp", rpc("tools/call", { name: "explode", arguments: {} }));
		ok("unknown tool errors", unknown.json.result.isError === true);

		const notification = await post("/mcp", { jsonrpc: "2.0", method: "notifications/initialized" });
		ok("notification gets 202", notification.status === 202);

		const badOrigin = await post("/mcp", rpc("initialize", {}), { Origin: "https://evil.example" });
		ok("disallowed origin gets 403", badOrigin.status === 403);

		// Ask-model degradation path
		const askModel = await post("/ask-model", { question: "What was the measurable impact?" });
		ok(
			"ask-model grounded without a key",
			askModel.status === 200 &&
				askModel.json.grounded === true &&
				askModel.json.model_polish === false &&
				askModel.json.answer.length > 0,
		);
		const askModelDecline = await post("/ask-model", { question: "zzz qqq vvv" });
		ok("ask-model declines unsupported questions", askModelDecline.json.grounded === false);
		const askModelBad = await post("/ask-model", { question: 42 });
		ok("ask-model rejects a non-string question", askModelBad.status === 400);

		// CORS preflight for the site origin
		const preflight = await fetch(`${BASE}/health`, {
			method: "OPTIONS",
			headers: { Origin: "https://adipat2003.github.io" },
		});
		ok(
			"preflight allows the site origin",
			preflight.status === 204 &&
				preflight.headers.get("access-control-allow-origin") === "https://adipat2003.github.io",
		);

		// CTA proxy degradation: no key configured means an honest
		// not-available payload with the credit line, never an error.
		const transit = await get("/transit");
		ok(
			"transit degrades honestly without a key",
			transit.status === 200 &&
				transit.json.available === false &&
				typeof transit.json.reason === "string" &&
				String(transit.json.credit).includes("Chicago Transit Authority"),
		);
		ok(
			"transit lists the supported Loop stations",
			transit.json.stations?.length === 4 && transit.json.stations.some((station) => station.id === "40380"),
		);
		const stateLake = await get("/transit?station=40260");
		ok(
			"transit selects an allowlisted station",
			stateLake.status === 200 && stateLake.json.available === false &&
				stateLake.json.station_id === "40260" && stateLake.json.station === "State/Lake",
		);
		const noPositions = await get("/positions");
		ok("positions degrade without a key", noPositions.status === 200 && noPositions.json.available === false && noPositions.json.trains.length === 0);
		ok("positions reject unsupported query", (await get("/positions?rt=bus")).status === 400);
		const invalidStation = await get("/transit?station=99999");
		ok("transit rejects an unknown station", invalidStation.status === 400);
		const transitAgain = await get("/transit");
		ok(
			"transit no-key response is stable across calls",
			transitAgain.json.available === false,
		);
	} finally {
		child.kill();
	}

	console.log(failures === 0 ? "service-check: PASS" : `service-check: ${failures} failure(s)`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("service-check crashed:", err);
	if (child) child.kill();
	process.exit(1);
});
