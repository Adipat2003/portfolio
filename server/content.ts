/**
 * Loads and validates the content model at service startup.
 *
 * The service deliberately does not import src/content/load.ts: that module
 * resolves JSON at module scope, which is a bundler pattern. Here the same
 * files are read with fs and parsed through the same Zod schemas, so the
 * public_safe gate and the pending-content exclusion apply on this surface
 * exactly as they do on the rendered site.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { buildRetriever, type Retriever } from "../src/content/retrieval";
import {
	projectSchema,
	siteSchema,
	type Figure,
	type Project,
	type Site,
} from "../src/content/schema";

export type Content = {
	site: Site;
	/** Published records only, matching what the site renders. */
	projects: Project[];
	impact: Figure[];
	retriever: Retriever;
};

export function loadContent(root: string): Content {
	const site = siteSchema.parse(
		JSON.parse(readFileSync(join(root, "content", "site.json"), "utf8")),
	);
	const parsed = z
		.object({
			public_safe_reviewed: z.literal(true),
			projects: z.array(projectSchema),
		})
		.parse(JSON.parse(readFileSync(join(root, "content", "projects.json"), "utf8")));

	const projects = parsed.projects.filter((p) => p.status !== "pending-content");
	return {
		site,
		projects,
		impact: site.impact,
		retriever: buildRetriever({ site, projects }),
	};
}
