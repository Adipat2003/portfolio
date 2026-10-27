/**
 * End-to-end probe for the Node service. Builds must exist first
 * (npm run build:service). Spawns the service on a scratch port and asserts
 * the MCP protocol, the weather proxy, and the ask-model degradation path.
 *
 * Plain Node ESM, no dependencies, same style as the other check scripts.
 */
import assert from "node:assert/strict";
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

async function main() {
	await checkCtaNormalization();
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
