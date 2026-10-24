/**
 * End-to-end probe for the Node service. Builds must exist first
 * (npm run build:service). Spawns the service on a scratch port and asserts
 * the MCP protocol, the weather proxy, and the ask-model degradation path.
 *
 * Plain Node ESM, no dependencies, same style as the other check scripts.
 */
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

async function main() {
	child = spawn("node", ["server/dist/server/index.js"], {
		env: { ...process.env, SERVICE_PORT: String(PORT), SERVICE_HOST: "127.0.0.1" },
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
