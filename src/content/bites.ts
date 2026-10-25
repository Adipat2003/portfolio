import rawBites from "../../content/bites.json";
import { bitesSchema, type BiteVisit } from "./schema";

/**
 * The Bite Radar visit log, parsed once at build time with the same guard
 * every record carries: public_safe_reviewed must be true, and a repeated
 * restaurant name fails the build the same way a repeated Chicago slug does.
 * Beli has no official public API, so this file IS the integration: records
 * are hand-approved from his private list, and nothing renders until they
 * arrive.
 */
const parsed = bitesSchema.parse(rawBites);
const seen = new Set<string>();
for (const visit of parsed.visits) {
	const key = visit.name.toLowerCase();
	if (seen.has(key)) {
		throw new Error(`bites.json has a duplicate restaurant name '${visit.name}'`);
	}
	seen.add(key);
}
export const bites: BiteVisit[] = parsed.visits;
