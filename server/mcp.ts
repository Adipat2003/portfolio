/**
 * The MCP tool surface, ported from scripts/mcp-server.mjs to TypeScript with
 * one upgrade: the ask tool is now backed by the same retriever the site's
 * AskBox uses (src/content/retrieval.ts), so the endpoint and the page cannot
 * drift, and answers keep the curated examples, figure hedging, and sources.
 *
 * Read-only. No tool mutates state, no tool holds credentials.
 */
import type { Content } from "./content";
import type { Match } from "../src/content/retrieval";
import type { Figure } from "../src/content/schema";

export const PROTOCOL_VERSION = "2026-07-28";

export const TOOLS = [
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

function toolResult(payload: unknown) {
	return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function toolError(text: string) {
	return { content: [{ type: "text", text }], isError: true };
}

/** One match rendered as a cited line for the answer text. */
export function renderMatch(match: Match): string {
	switch (match.kind) {
		case "example":
			return `${match.example.answer} (source: ${match.example.source})`;
		case "project": {
			const parts = [`${match.project.title}: ${match.project.summary}`];
			if (match.project.role) parts.push(`Role: ${match.project.role}.`);
			if (match.project.outcome) parts.push(`Outcome: ${match.project.outcome}`);
			return parts.join(" ");
		}
		case "figure":
			return `${match.figure.value} ${match.figure.label} (${match.figure.kind}, source: ${match.figure.source})`;
		case "fact":
			return `${match.title}: ${match.body} (source: ${match.source})`;
	}
}

function figuresFrom(matches: Match[]): Figure[] {
	const figures: Figure[] = [];
	for (const match of matches) {
		if (match.kind === "project") figures.push(...match.project.figures);
		if (match.kind === "figure") figures.push(match.figure);
	}
	return figures;
}

export function callTool(content: Content, name: string, args: Record<string, unknown>) {
	switch (name) {
		case "list_projects":
			return toolResult(
				content.projects.map((p) => ({
					slug: p.slug,
					title: p.title,
					summary: p.summary,
					tags: p.tags,
					line: p.line,
				})),
			);

		case "get_project": {
			const slug = String(args.slug ?? "");
			const project = content.projects.find((p) => p.slug === slug);
			if (!project) {
				return toolError(`No project with slug "${slug}". Call list_projects for valid slugs.`);
			}
			return toolResult(project);
		}

		case "get_impact_figures":
			return toolResult(content.impact);

		case "get_artwork_provenance":
			return toolResult({
				landmarks:
					"Authored SVG abstractions of named Chicago buildings, geometry in content/atlas.json, rendered by both the Python renderer and the Next components",
				generated_imagery: "not used",
				stock_imagery: "not used",
				routes_and_stations: "rendered from data, so the map is diffable source",
				public_safe_gate:
					"the build and this service both refuse to emit any project not marked public_safe",
			});

		case "ask": {
			const question = String(args.question ?? "");
			const matches = content.retriever.retrieve(question, 3);
			if (matches.length === 0) {
				return toolResult({
					answer:
						"The portfolio records do not cover that question, so no answer is offered rather than a guess.",
					grounded: false,
					suggestion: "Ask about a project, its role, approach, outcome, or a headline figure.",
				});
			}
			const figures = figuresFrom(matches);
			const sources = new Set<string>();
			for (const match of matches) {
				if (match.kind === "example") sources.add(match.example.source);
				if (match.kind === "fact") sources.add(match.source);
				if (match.kind === "figure") sources.add(match.figure.source);
				if (match.kind === "project") {
					for (const f of match.project.figures) sources.add(f.source);
				}
			}
			return toolResult({
				answer: matches.map(renderMatch).join("\n"),
				grounded: true,
				matches: matches.map((m) => (m.kind === "project" ? m.project.slug : m.kind)),
				figures,
				sources: [...sources],
			});
		}

		default:
			return toolError(`Unknown tool "${name}"`);
	}
}

export function handleMessage(content: Content, message: unknown) {
	if (message === null || typeof message !== "object") {
		return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } };
	}
	const msg = message as { id?: unknown; method?: unknown; params?: unknown };
	if (msg.method === undefined) {
		return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32600, message: "missing method" } };
	}

	switch (msg.method) {
		case "initialize":
			return {
				jsonrpc: "2.0",
				id: msg.id,
				result: {
					protocolVersion: PROTOCOL_VERSION,
					capabilities: { tools: { listChanged: false } },
					serverInfo: { name: "portfolio-mcp", version: "2.0.0" },
					instructions:
						"Read-only portfolio access. Every answer is grounded in the portfolio records; figures keep their hedging and a projected figure is a projection, not a realized result.",
				},
			};

		case "ping":
			return { jsonrpc: "2.0", id: msg.id, result: {} };

		case "tools/list":
			return { jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } };

		case "tools/call": {
			const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
			if (!params.name) {
				return {
					jsonrpc: "2.0",
					id: msg.id,
					error: { code: -32602, message: "tools/call requires params.name" },
				};
			}
			return {
				jsonrpc: "2.0",
				id: msg.id,
				result: callTool(content, params.name, params.arguments ?? {}),
			};
		}

		default:
			return {
				jsonrpc: "2.0",
				id: msg.id,
				error: { code: -32601, message: `method not found: ${String(msg.method)}` },
			};
	}
}
