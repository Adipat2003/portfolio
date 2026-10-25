/**
 * Bite Radar scoring, kept free of runtime imports so scripts/bite-check.mjs
 * can exercise it under plain Node, the same way season-check exercises
 * season.ts. The visits are passed in rather than imported.
 *
 * Everything here is personal and self-reported: the score ranks places on
 * Aditya's own Beli list, nothing more. It blends three signals he controls:
 *
 * - rating (50 percent): his 1-5 rating, 3 stars as neutral zero
 * - recency (30 percent): months since the last visit, decaying to zero at a year
 * - repeats (20 percent): places he keeps going back to, capped at 4 visits
 *
 * The statuses are labels on his own behavior, not claims about the city:
 * "rising" means climbing his list, not objectively up-and-coming.
 */

import type { BiteVisit } from "./schema";

export type BiteStatus = "rising" | "steady" | "cooling";

export type ScoredBite = BiteVisit & { score: number; status: BiteStatus };

/** Months since a YYYY-MM visit, in whole months; future dates count as 0. */
export function monthsSince(visitedOn: string, now: Date): number {
	const [y, m] = visitedOn.split("-").map(Number);
	const visited = Date.UTC(y, m - 1, 15);
	const months = (now.getTime() - visited) / (1000 * 60 * 60 * 24 * 30.4);
	return Math.max(0, months);
}

/** His 1-5 rating as 0 to 1, with 3 stars neutral. */
function ratingScore(rating: number): number {
	return Math.max(0, Math.min(1, (rating - 3) / 2));
}

function recencyScore(visitedOn: string, now: Date): number {
	return Math.max(0, 1 - monthsSince(visitedOn, now) / 12);
}

function repeatScore(visits: number | undefined): number {
	return Math.min(1, ((visits ?? 1) - 1) / 3);
}

function statusFor(score: number): BiteStatus {
	if (score >= 0.6) return "rising";
	if (score >= 0.3) return "steady";
	return "cooling";
}

/** Rank every visit, highest climb first. */
export function biteRadar(visits: BiteVisit[], now: Date): ScoredBite[] {
	return visits
		.map((visit) => {
			const score =
				Math.round(
					(ratingScore(visit.rating) * 0.5 +
						recencyScore(visit.visited_on, now) * 0.3 +
						repeatScore(visit.visits) * 0.2) *
						100,
				) / 100;
			return { ...visit, score, status: statusFor(score) };
		})
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
