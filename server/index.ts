/**
 * The Node service entry point: MCP endpoint and the
 * NVIDIA ask layer behind one Node-stdlib HTTP server. Zero runtime
 * dependencies beyond zod.
 *
 * Environment:
 *   SERVICE_PORT             listen port (default 8788)
 *   SERVICE_HOST             listen host (default 127.0.0.1)
 *   PORTFOLIO_ROOT           content root (default: the repository root)
 *   SERVICE_ALLOWED_ORIGINS  comma-separated allowed Origin values
 *   NVIDIA_API_KEY          optional; enables model polish on /ask-model
 *   NVIDIA_MODEL            model id for the ask layer (default
 *                           deepseek-ai/deepseek-v4.1-flash)
 *   NVIDIA_ENDPOINT         chat completions endpoint (default
 *                           https://integrate.api.nvidia.com/v1/chat/completions)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { loadContent } from "./content";
import { handleMessage } from "./mcp";
import { createAskModel } from "./ask-model";
import { createCtaProxy } from "./cta";

const PORT = Number(process.env.PORT ?? process.env.SERVICE_PORT ?? 8788);
const HOST = process.env.SERVICE_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const ROOT = process.env.PORTFOLIO_ROOT ?? resolve(__dirname, "..", "..", "..");
const ALLOWED_ORIGINS = new Set(
	(
		process.env.SERVICE_ALLOWED_ORIGINS ??
		"https://adipat2003.github.io,http://localhost:1312,http://127.0.0.1:1312"
	).split(","),
);
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY; // never logged, never returned
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "deepseek-ai/deepseek-v4.1-flash";
const NVIDIA_ENDPOINT =
	process.env.NVIDIA_ENDPOINT ?? "https://integrate.api.nvidia.com/v1/chat/completions";

const content = loadContent(ROOT);
const cta = createCtaProxy({
	apiKey: process.env.CTA_API_KEY,
	mapid: process.env.CTA_MAPID ?? "40380",
	ttlMs: 45_000,
});
const askModel = createAskModel(content, {
	apiKey: NVIDIA_API_KEY,
	model: NVIDIA_MODEL,
	endpoint: NVIDIA_ENDPOINT,
});

/* --------------------------------------------------------- rate limiting */

const RATE_LIMITS: Record<string, number> = {
	"/mcp": 60,
	"/transit": 20,
	"/ask-model": 10,
};
const buckets = new Map<string, { count: number; reset: number }>();

function rateLimited(route: string, ip: string): boolean {
	const limit = RATE_LIMITS[route] ?? 60;
	const now = Date.now();
	const key = `${route}:${ip}`;
	let bucket = buckets.get(key);
	if (!bucket || now > bucket.reset) {
		bucket = { count: 0, reset: now + 60_000 };
		buckets.set(key, bucket);
	}
	bucket.count += 1;
	return bucket.count > limit;
}

/* ------------------------------------------------------------- helpers */

function originAllowed(origin: string | undefined): boolean {
	return origin === undefined || ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(origin: string | undefined): Record<string, string> {
	if (origin === undefined || !ALLOWED_ORIGINS.has(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		Vary: "Origin",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "600",
	};
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
	const text = JSON.stringify(body);
	res.writeHead(status, { "Content-Type": "application/json", ...extra });
	res.end(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
	return new Promise((resolveBody, reject) => {
		let body = "";
		req.on("data", (chunk: string) => {
			body += chunk;
			if (body.length > limit) {
				reject(new Error("body too large"));
				req.destroy();
			}
		});
		req.on("end", () => resolveBody(body));
		req.on("error", reject);
	});
}

/* ------------------------------------------------------------- routing */

const startedAt = Date.now();

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const route = url.pathname.replace(/\/+$/, "") || "/";
	const origin = req.headers.origin;
	const ip = req.socket.remoteAddress ?? "unknown";

	if (req.method === "OPTIONS") {
		res.writeHead(204, corsHeaders(origin));
		res.end();
		return;
	}

	if (!originAllowed(origin)) {
		sendJson(res, 403, { error: "origin not allowed" });
		return;
	}

	if (rateLimited(route, ip)) {
		sendJson(res, 429, { error: "rate limited" }, corsHeaders(origin));
		return;
	}

	if (route === "/health" && (req.method === "GET" || req.method === "HEAD")) {
		sendJson(
			res,
			200,
			{
				ok: true,
				uptime_s: Math.floor((Date.now() - startedAt) / 1000),
				model_polish: Boolean(NVIDIA_API_KEY),
				model: NVIDIA_API_KEY ? NVIDIA_MODEL : null,
			},
			corsHeaders(origin),
		);
		return;
	}

	if (route === "/transit" && req.method === "GET") {
		const payload = await cta.get();
		sendJson(res, 200, payload, corsHeaders(origin));
		return;
	}

	if (route === "/mcp" && req.method === "POST") {
		let message: unknown;
		try {
			message = JSON.parse(await readBody(req, 1_000_000));
		} catch {
			sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
			return;
		}
		if (
			message !== null &&
			typeof message === "object" &&
			(message as { id?: unknown }).id === undefined
		) {
			res.writeHead(202);
			res.end();
			return;
		}
		sendJson(res, 200, handleMessage(content, message), corsHeaders(origin));
		return;
	}

	if (route === "/ask-model" && req.method === "POST") {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await readBody(req, 10_000));
		} catch {
			sendJson(res, 400, { error: "parse error" }, corsHeaders(origin));
			return;
		}
		const question = (parsed as { question?: unknown })?.question;
		if (typeof question !== "string" || question.trim().length === 0) {
			sendJson(res, 400, { error: "question must be a non-empty string" }, corsHeaders(origin));
			return;
		}
		const result = await askModel(question);
		sendJson(res, 200, result, corsHeaders(origin));
		return;
	}

	sendJson(res, 404, { error: "not found" }, corsHeaders(origin));
});

server.listen(PORT, HOST, () => {
	process.stdout.write(
		`portfolio-service on http://${HOST}:${PORT} (mcp, transit, ask-model; polish ${
			NVIDIA_API_KEY ? "enabled" : "disabled"
		})\n`,
	);
});
