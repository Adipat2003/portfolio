/**
 * Phase 5: the NVIDIA layer for the ask feature.
 *
 * Grounding contract (docs/ai-exposure.md): retrieval is the only source of
 * claims. The model rephrases what the retriever returned, keeps every
 * figure exactly with its hedging and source, and never adds facts. With no
 * API key configured the endpoint serves the grounded retrieval answer
 * directly and reports model_polish: false, so the feature degrades to
 * Layer 2 behavior instead of breaking.
 *
 * The key is read from the environment, never from a file or a commit, and
 * is never logged or returned.
 */
import type { Content } from "./content";
import { renderMatch } from "./mcp";
import type { Match } from "../src/content/retrieval";

const SYSTEM_CONTRACT = [
	"You rephrase grounded portfolio answers for a personal portfolio site.",
	"Answer ONLY from the RECORDS provided. Do not add facts, names, numbers, or claims.",
	"Keep every figure exactly as written, with its kind (measured, projected, or self-reported) and its source.",
	"Never upgrade a projection into a realized result.",
	"Scope: only Aditya Patel, his portfolio, his projects, his numbers, and the Chicago layer on this site.",
	"If the question falls outside that scope, or the records do not support an answer, say so in one short sentence and invite a portfolio question instead. Never improvise an answer.",
	"Answer in at most 120 words.",
].join(" ");

export type AskModelResult = {
	grounded: boolean;
	answer: string;
	model_polish: boolean;
	model?: string;
	retrieved: number;
	records?: unknown[];
	sources: string[];
	note?: string;
};

export function createAskModel(
	content: Content,
	opts: { apiKey?: string; model: string; endpoint: string },
) {
	return async function askModel(question: string): Promise<AskModelResult> {
		const matches: Match[] = content.retriever.retrieve(question, 3);
		if (matches.length === 0) {
			return {
				grounded: false,
				answer:
					"The portfolio records do not cover that question, so no answer is offered rather than a guess.",
				model_polish: false,
				retrieved: 0,
				sources: [],
			};
		}

		const baseAnswer = matches.map(renderMatch).join("\n");
		const records = matches.map((m) => ({ kind: m.kind, text: renderMatch(m) }));
		const sources = new Set<string>();
		for (const match of matches) {
			if (match.kind === "example") sources.add(match.example.source);
			if (match.kind === "fact") sources.add(match.source);
			if (match.kind === "figure") sources.add(match.figure.source);
			if (match.kind === "project") {
				for (const f of match.project.figures) sources.add(f.source);
			}
		}

		if (!opts.apiKey) {
			return {
				grounded: true,
				answer: baseAnswer,
				model_polish: false,
				retrieved: matches.length,
				records,
				sources: [...sources],
				note: "model polish disabled: no key configured",
			};
		}

		try {
			const res = await fetch(opts.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${opts.apiKey}`,
				},
				body: JSON.stringify({
					model: opts.model,
					temperature: 0,
					max_tokens: 500,
					messages: [
						{ role: "system", content: SYSTEM_CONTRACT },
						{
							role: "user",
							content: `QUESTION: ${question}\n\nRECORDS:\n${records
								.map((r) => `- ${r.text}`)
								.join("\n")}`,
						},
					],
				}),
				signal: AbortSignal.timeout(20_000),
			});
			if (!res.ok) throw new Error(`model endpoint ${res.status}`);
			const data: any = await res.json();
			const text: string | undefined = data?.choices?.[0]?.message?.content;
			if (!text) throw new Error("empty model response");
			return {
				grounded: true,
				answer: text,
				model_polish: true,
				model: opts.model,
				retrieved: matches.length,
				records,
				sources: [...sources],
			};
		} catch (err) {
			// The model layer is polish, never the source. On any failure the
			// grounded retrieval answer ships unchanged, with the status code
			// surfaced so a bad key or model id is diagnosable from the response
			// without ever exposing the key or the request payload.
			const reason =
				err instanceof Error ? err.message.replace(/Bearer\s+\S+/gi, "Bearer <redacted>") : "unknown";
			return {
				grounded: true,
				answer: baseAnswer,
				model_polish: false,
				retrieved: matches.length,
				records,
				sources: [...sources],
				note: `model polish unavailable (${reason}): serving the grounded retrieval answer`,
			};
		}
	};
}
