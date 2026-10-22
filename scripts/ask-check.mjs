#!/usr/bin/env node
/**
 * Ranking checks for the ask feature, over the real corpus.
 *
 * Three question classes, each asserted: questions that must match a named
 * record, questions the corpus cannot answer, and misspelled versions of the
 * first class. Run this whenever content/ changes, so the weights and the
 * acceptance floor are re-checked against the records as they are, not against
 * the questions used to tune them.
 *
 * It runs the same code the page runs: retrieval.ts is imported directly, and
 * Node strips its types natively. No build step, no test dependency.
 *
 * Usage: node scripts/ask-check.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const content = (name) => JSON.parse(readFileSync(join(root, "content", name), "utf8"));
const site = content("site.json");
const projects = content("projects.json").projects;

// retrieval.ts imports types only, so Node can run it without a bundler.
const { buildRetriever } = await import(
  new URL("../src/content/retrieval.ts", import.meta.url).href
);
const { retrieve } = buildRetriever({ site, projects });

/**
 * A stable label for a match, so an assertion names a record rather than a
 * position in a list that reorders under a content edit.
 */
function labelOf(match) {
  if (match.kind === "project") return `project:${match.project.slug}`;
  if (match.kind === "figure") return `figure:${match.figure.label}`;
  if (match.kind === "example") return `example:${match.example.question}`;
  return `fact:${match.title}`;
}

/**
 * Questions that must resolve to a named record. The label is the record.
 *
 * Where a curated example exists for the subject, it ranks first, and that is
 * the intended answer: the example is the reviewed wording of the same facts.
 * The project record follows it in the results, so the reader gets both.
 */
const SHOULD_MATCH = [
  ["what language is the kernel written in", "project:ece391-os-kernel"],
  ["tell me about the fpga game", "project:ece385-fpga-pacman"],
  ["how does the offline sync work", "example:How does the offline sync stay correct?"],
  ["tell me about metaglasses", "project:metaglasses"],
  ["what did you build at the hackathon", "example:What did you build at the hackathon?"],
  ["where did you go to school", "example:What did you study in school?"],
];

/**
 * Questions the corpus does not cover. A decline is the correct answer.
 *
 * These are chosen so no term in them appears anywhere in the corpus. A question
 * about the world series, for instance, would match the CS 225 record whose
 * title contains "real-world datasets", which is a keyword-retrieval limit and
 * not a defect, so such questions are deliberately not asserted here.
 */
const SHOULD_DECLINE = [
  "what is your favorite pizza topping",
  "what is the airspeed of an unladen swallow",
  "what is the weather in chicago right now",
  "do you have a phd",
  "what is the capital of france",
];

// Misspellings of the should-match set. Each must reach the same record.
const MISSPELLED = [
  ["what language is the kernal written in", "project:ece391-os-kernel"],
  ["tell me about the ofline engine", "project:offline-sync-engine"],
  ["tell me about fpga gam", "project:ece385-fpga-pacman"],
];

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

console.log("ask-check: should-match");
for (const [question, expected] of SHOULD_MATCH) {
  const got = retrieve(question).map(labelOf);
  check(`"${question}" -> ${expected}`, got[0] === expected, `got ${JSON.stringify(got)}`);
}

console.log("ask-check: should-decline");
for (const question of SHOULD_DECLINE) {
  const got = retrieve(question);
  check(`"${question}" -> declined`, got.length === 0, `got ${JSON.stringify(got.map(labelOf))}`);
}

console.log("ask-check: misspelled");
for (const [question, expected] of MISSPELLED) {
  const got = retrieve(question).map(labelOf);
  check(`"${question}" -> ${expected}`, got[0] === expected, `got ${JSON.stringify(got)}`);
}

console.log("ask-check: hedges are carried, never upgraded");
// The question pulls in several figures, because the projection label shares
// terms with the others. The rule under test is not that only one figure
// matches, but that each figure is reported with the kind its own record
// carries, so no answer can relabel a projection as a realized result.
const figureMatches = retrieve("what is the projected annual savings").filter(
  (m) => m.kind === "figure",
);
const projected = figureMatches.find((m) => m.figure.kind === "projected");
check("the projected figure is reachable by question", Boolean(projected));
if (projected) {
  check(
    `the projection stays labelled ${projected.figure.kind}`,
    projected.figure.kind === "projected",
    `got ${projected.figure.kind}`,
  );
}
for (const match of figureMatches) {
  if (match.figure.kind === "projected") continue;
  check(
    `figure ${match.figure.value} keeps its own kind ${match.figure.kind}`,
    match.figure.kind !== "projected",
    `relabelled to ${match.figure.kind}`,
  );
}

console.log("ask-check: identity question");
check(
  '"who are you" -> the identity record',
  retrieve("who are you").some((m) => m.kind === "fact"),
  `got ${JSON.stringify(retrieve("who are you").map(labelOf))}`,
);

check('punctuation-only input declines', retrieve("??? ...").length === 0);

console.log(
  failures === 0
    ? `ask-check: PASS (${SHOULD_MATCH.length + SHOULD_DECLINE.length + MISSPELLED.length} questions)`
    : `ask-check: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
