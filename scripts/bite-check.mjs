#!/usr/bin/env node
/**
 * Bite Radar scoring checks over the shipped module, with fixture visits so
 * the empty committed content never leaves the math untested. The module
 * takes its data as a parameter, so the checks test the real scoring, not a
 * copy of it.
 *
 * Usage: node scripts/bite-check.mjs
 */
const { biteRadar, monthsSince } = await import(
	new URL("../src/content/bite-radar.ts", import.meta.url).href
);

const NOW = new Date("2026-10-15T12:00:00Z");
let failures = 0;
function check(description, ok, detail) {
	if (ok) {
		console.log(`  ok   ${description}`);
		return;
	}
	failures += 1;
	console.error(`  FAIL ${description}`);
	if (detail) console.error(`       ${detail}`);
}

const at = (monthsAgo) => {
	const d = new Date(NOW);
	d.setUTCMonth(d.getUTCMonth() - monthsAgo);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

console.log("bite-check: monthsSince");
check("this month is 0", monthsSince(at(0), NOW) < 1, `got ${monthsSince(at(0), NOW)}`);
check("12 months ago decays to 12", monthsSince(at(12), NOW) >= 11, `got ${monthsSince(at(12), NOW)}`);
check("future visit is clamped to 0", monthsSince("2027-05", NOW) === 0);

console.log("bite-check: scoring");
const visit = (rating, monthsAgo, visits = 1) => ({
	name: `Place ${rating}-${monthsAgo}`,
	neighborhood: "Loop",
	kind: "food",
	rating,
	visited_on: at(monthsAgo),
	visits,
});

const scored = biteRadar([visit(5, 0), visit(5, 20), visit(4, 1, 4), visit(3, 0)], NOW);
check(
	"5 stars, this month, no repeats scores 0.5 + 0.3 = 0.8",
	scored[0].name === "Place 5-0" && scored[0].score === 0.8,
	JSON.stringify(scored[0]),
);
check(
	"recency decays to zero after a year",
	biteRadar([visit(5, 20)], NOW)[0].score === 0.5,
	`got ${biteRadar([visit(5, 20)], NOW)[0].score}`,
);
check(
	"repeats cap at 4 visits",
	biteRadar([visit(3, 12, 9)], NOW)[0].score === 0.2,
	`got ${biteRadar([visit(3, 12, 9)], NOW)[0].score}`,
);
check(
	"3 stars, a year ago, one visit scores 0 and cools",
	biteRadar([visit(3, 12)], NOW)[0].status === "cooling",
);
check(
	"4 stars, last month, 4 visits is 0.5 + ~0.28 + 0.2 = rising",
	biteRadar([visit(4, 1, 4)], NOW)[0].status === "rising",
	JSON.stringify(biteRadar([visit(4, 1, 4)], NOW)[0]),
);
check(
	"3 stars, this month is steady (0.3 recency only)",
	biteRadar([visit(3, 0)], NOW)[0].status === "steady",
	`got ${biteRadar([visit(3, 0)], NOW)[0].status}`,
);
check(
	"sort is by score, descending",
	scored[0].score >= scored[1].score && scored[1].score >= scored[2].score,
);
check(
	"ties break alphabetically",
	biteRadar([visit(5, 0), { ...visit(5, 0), name: "A Place" }], NOW)[0].name === "A Place",
);
check("empty log scores empty", biteRadar([], NOW).length === 0);

console.log(
	failures === 0
		? "bite-check: PASS (10 scoring checks)"
		: `bite-check: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
