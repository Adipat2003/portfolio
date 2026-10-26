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
 *                           nvidia/llama-3.1-nemotron-70b-instruct; the
 *                           rephrase task wants a fast instruct model,
 *                           not a hybrid reasoner)
 *   NVIDIA_ENDPOINT         chat completions endpoint (default
 *                           https://integrate.api.nvidia.com/v1/chat/completions)
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { loadContent } from "./content";
import { handleMessage } from "./mcp";
import { createAskModel } from "./ask-model";
import { createCtaProxy } from "./cta";

const PORT = Number(process.env.PORT ?? process.env.SERVICE_PORT ?? 8788);
const HOST =
  process.env.SERVICE_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const ROOT = process.env.PORTFOLIO_ROOT ?? resolve(__dirname, "..", "..", "..");
const ALLOWED_ORIGINS = new Set(
  (
    process.env.SERVICE_ALLOWED_ORIGINS ??
    "https://adipat2003.github.io,http://localhost:1312,http://127.0.0.1:1312"
  ).split(","),
);
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY?.trim(); // never logged, never returned; trim guards against paste artifacts
const NVIDIA_MODEL =
  process.env.NVIDIA_MODEL ?? "nvidia/llama-3.1-nemotron-70b-instruct";
const NVIDIA_ENDPOINT =
  process.env.NVIDIA_ENDPOINT ??
  "https://integrate.api.nvidia.com/v1/chat/completions";

const content = loadContent(ROOT);
const cta = createCtaProxy({
  apiKey: process.env.CTA_API_KEY?.trim(),
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

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
) {
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
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
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

  if (route === "/model-probe" && req.method === "GET") {
    // Diagnostic: measures the deployed host's path to the model endpoint
    // with a deliberately invalid key. A fast 401 means connectivity is
    // fine and any /ask-model slowness is in the inference path; a hang
    // means the egress itself is broken. The real key is never used here.
    const started = Date.now();
    try {
      const probe = await fetch(NVIDIA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-probe",
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      sendJson(
        res,
        200,
        {
          endpoint: NVIDIA_ENDPOINT,
          model: NVIDIA_MODEL,
          status: probe.status,
          ms: Date.now() - started,
        },
        corsHeaders(origin),
      );
      return;
    } catch (err) {
      sendJson(
        res,
        200,
        {
          endpoint: NVIDIA_ENDPOINT,
          model: NVIDIA_MODEL,
          error: err instanceof Error ? err.message : "unknown",
          ms: Date.now() - started,
        },
        corsHeaders(origin),
      );
      return;
    }
  }

  if (route === "/transit" && req.method === "GET") {
    if (url.searchParams.get("raw") === "1") {
      // temporary diagnostic echo; removed once the clock math is verified live
      await cta.get();
      sendJson(
        res,
        200,
        cta.raw() ?? { note: "no upstream document yet" },
        corsHeaders(origin),
      );
      return;
    }
    const payload = await cta.get();
    sendJson(res, 200, payload, corsHeaders(origin));
    return;
  }

  if (route === "/mcp" && req.method === "POST") {
    let message: unknown;
    try {
      message = JSON.parse(await readBody(req, 1_000_000));
    } catch {
      sendJson(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      });
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
      sendJson(
        res,
        400,
        { error: "question must be a non-empty string" },
        corsHeaders(origin),
      );
      return;
    }
    const requested = (parsed as { model?: unknown })?.model;
    const modelOverride = typeof requested === "string" ? requested : undefined;
    const result = await askModel(question, modelOverride);
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
