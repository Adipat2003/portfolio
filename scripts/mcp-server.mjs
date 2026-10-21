#!/usr/bin/env node
/**
 * Read-only MCP endpoint for the portfolio site.
 *
 * Streamable HTTP transport per the MCP specification (2026-07-28 revision):
 * a single POST endpoint answering each JSON-RPC request with one JSON object.
 * No SSE, no sessions, no write tools, no secrets in responses.
 *
 * Backed by api/portfolio.json, the same records the page renders, so the two
 * surfaces cannot drift.
 *
 * Usage:  node scripts/mcp-server.mjs [--port 8787]
 * Zero dependencies; Node standard library only.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.MCP_PORT ?? 8787);
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PROTOCOL_VERSION = "2026-07-28";
const ALLOWED_ORIGINS = new Set(
  (process.env.MCP_ALLOWED_ORIGINS ?? "http://localhost,http://127.0.0.1").split(","),
);

const data = JSON.parse(readFileSync(join(ROOT, "api/portfolio.json"), "utf8"));

/* ---------------------------------------------------------------- tools */

const TOOLS = [
  {
    name: "list_projects",
    description:
      "List portfolio projects: slug, title, one-line summary, tags, and line. Use this to orient before fetching details.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_project",
    description:
      "Full record for one project: problem, role, approach, outcome, and figures with their hedging and sources.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Project slug from list_projects" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_impact_figures",
    description:
      "Headline figures. Each carries its kind (measured, projected, or self-reported) and its source document.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_artwork_provenance",
    description:
      "Which landmarks are authored SVG, where the geometry source lives, and what the routes and stations render from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ask",
    description:
      "Answer a question about the portfolio, grounded in its records and citing the source of each claim. Declines rather than guessing when the records do not support an answer.",
    inputSchema: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
      additionalProperties: false,
    },
  },
];

function toolResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function callTool(name, args) {
  switch (name) {
    case "list_projects":
      return toolResult(
        data.projects.map((p) => ({
          slug: p.slug,
          title: p.title,
          summary: p.summary,
          tags: p.tags,
          line: p.line,
          status: p.status ?? "published",
        })),
      );

    case "get_project": {
      const project = data.projects.find((p) => p.slug === args.slug);
      if (!project) {
        return {
          content: [{ type: "text", text: `No project with slug "${args.slug}". Call list_projects for valid slugs.` }],
          isError: true,
        };
      }
      return toolResult(project);
    }

    case "get_impact_figures":
      return toolResult(data.impact);

    case "get_artwork_provenance":
      return toolResult({
        landmarks: "Authored SVG abstractions of named Chicago buildings, geometry in content/atlas.json, rendered by scripts/build.py",
        generated_imagery: "not used",
        stock_imagery: "not used",
        routes_and_stations: "rendered from data, so the map is diffable source",
        public_safe_gate: "the build refuses to emit any project not marked public_safe",
      });

    case "ask": {
      const question = String(args.question ?? "").toLowerCase();
      const stopwords = new Set([
        "the", "and", "for", "you", "your", "with", "what", "how", "does", "did", "are",
        "was", "that", "this", "from", "have", "has", "can", "could", "would", "about",
        "into", "out", "get", "got", "its", "it's", "his", "her", "their", "our", "who",
        "whom", "when", "where", "which", "while", "also", "some", "any", "all", "one",
      ]);
      const keywords = question
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !stopwords.has(w));
      const scored = keywords.length === 0 ? [] : data.projects
        .map((p) => {
          const haystack = [p.title, p.summary, p.problem, p.role, ...(p.approach ?? []), ...(p.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const score = keywords.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
          return { p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (scored.length === 0) {
        return toolResult({
          answer: "The portfolio records do not cover that question, so no answer is offered rather than a guess.",
          grounded: false,
          suggestion: "Ask about a project, its role, approach, outcome, or a headline figure.",
        });
      }
      return toolResult({
        answer: scored.map((x) => `${x.p.title}: ${x.p.summary} Outcome: ${x.p.outcome ?? "see project record"}`).join("\n"),
        grounded: true,
        matches: scored.map((x) => x.p.slug),
        figures: scored.flatMap((x) => x.p.figures ?? []),
      });
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool "${name}"` }], isError: true };
  }
}

/* -------------------------------------------------------------- protocol */

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function handleMessage(message) {
  if (message === null || typeof message !== "object") return jsonRpcError(null, -32600, "invalid request");
  if (message.method === undefined) return jsonRpcError(message.id ?? null, -32600, "missing method");

  switch (message.method) {
    case "initialize":
      return jsonRpcResult(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "portfolio-mcp", version: "1.0.0" },
        instructions:
          "Read-only portfolio access. Every answer is grounded in the portfolio records; figures keep their hedging and a projected figure is a projection, not a realized result.",
      });

    case "ping":
      return jsonRpcResult(message.id, {});

    case "tools/list":
      return jsonRpcResult(message.id, { tools: TOOLS });

    case "tools/call": {
      const { name, arguments: args = {} } = message.params ?? {};
      if (!name) return jsonRpcError(message.id, -32602, "tools/call requires params.name");
      return jsonRpcResult(message.id, callTool(name, args));
    }

    default:
      return jsonRpcError(message.id, -32601, `method not found: ${message.method}`);
  }
}

/* ------------------------------------------------------------- http side */

const buckets = new Map();
const RATE_LIMIT = Number(process.env.MCP_RATE_LIMIT ?? 60); // requests per minute per IP

function rateLimited(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + 60_000 };
    buckets.set(ip, b);
  }
  b.count += 1;
  return b.count > RATE_LIMIT;
}

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonRpcError(null, -32000, "origin not allowed")));
    return;
  }
  if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonRpcError(null, -32600, "POST to /mcp only")));
    return;
  }

  const ip = req.socket.remoteAddress ?? "unknown";
  if (rateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonRpcError(null, -32000, "rate limited")));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      res.writeHead(413);
      res.end();
      req.destroy();
    }
  });
  req.on("end", () => {
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(jsonRpcError(null, -32700, "parse error")));
      return;
    }

    // Notifications (no id) get 202 with no body, per the transport spec.
    if (message && typeof message === "object" && message.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }

    const response = handleMessage(message);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`portfolio-mcp listening on http://${HOST}:${PORT}/mcp (read-only, ${TOOLS.length} tools)\n`);
});
