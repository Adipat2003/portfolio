/**
 * Grounded retrieval over the portfolio records.
 *
 * This is the retrieval half of the RAG feature: it answers a typed question
 * from the same content the page renders, and it cites where the answer came
 * from. It never composes a sentence that is not in a record. The NVIDIA model
 * step planned for Phase 5 will rephrase what this returns into prose, with the
 * citations intact, so a model can never be the source of a claim.
 *
 * The rules it has to keep, from docs/ai-exposure.md:
 * - answers only from the records, citing the source of each claim
 * - refuses to upgrade a projection into a realized result
 * - refuses to invent figures
 * - says plainly when the records do not support the question
 *
 * This module has no runtime imports on purpose. The corpus is passed in, so
 * scripts/ask-check.mjs can exercise the real scoring under plain Node, with no
 * Next build and no test dependency, and the check stays honest as content
 * changes.
 */
import type { Figure, Project, Site } from "./schema";

export type AskExample = { question: string; answer: string; source: string };

export type Match =
  | { kind: "project"; project: Project; score: number }
  | { kind: "figure"; figure: Figure; score: number }
  | { kind: "example"; example: AskExample; score: number }
  | { kind: "fact"; title: string; body: string; source: string; score: number };

export type CorpusInput = { site: Site; projects: Project[] };

export type Retriever = {
  /** Ranked record matches for a question. Empty means the corpus cannot answer. */
  retrieve(question: string, limit?: number): Match[];
};

const STOPWORDS = new Set([
  // Question words and filler carry no subject, and matching them pulls in
  // unrelated records: "where did you go to school" scored a course project
  // above the education record because "to" landed in its description.
  "the", "and", "for", "with", "that", "this", "what", "how", "why", "you",
  "your", "did", "does", "doing", "done", "was", "were", "are", "can", "could",
  "about", "into", "from", "have", "has", "had", "his", "her", "their", "they",
  "them", "there", "here", "when", "where", "which", "while", "who", "whom",
  "will", "would", "should", "than", "then", "also", "some", "any", "all",
  "one", "two", "get", "got", "make", "made", "use", "used", "using", "work",
  "worked", "tell", "show", "give", "want", "know", "need", "like", "just",
  "really", "very", "much", "more", "most", "such", "each", "other", "others",
  "because", "been", "being", "both", "during", "before", "after", "above",
  "below", "between", "through", "against", "without", "within", "upon",
]);

/**
 * A question becomes comparable lowercase terms. Tokens shorter than three
 * characters are dropped: two-letter words are connectors in a sentence and
 * subjects nowhere. Trailing plurals are folded so "projects", "reports", and
 * "commit" all reach their singular form.
 */
export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return raw.map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

type Corpus = {
  entry: Match;
  /** term to the weight of the strongest field it appears in. */
  terms: Map<string, number>;
};

function index(fields: Array<[string, number]>): Map<string, number> {
  const terms = new Map<string, number>();
  for (const [text, weight] of fields) {
    for (const token of tokenize(text)) {
      const current = terms.get(token) ?? 0;
      if (weight > current) terms.set(token, weight);
    }
  }
  return terms;
}

/**
 * One edit away, so a misspelled "ofline" still reaches "offline". Only terms of
 * five or more characters are considered: below that, one edit connects words
 * that are genuinely different, and a typo correction turns into noise.
 */
export function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How specific a record is, used only to break score ties.
 *
 * A project record answers a bounded question; the bio fact answers almost any
 * question that touches Aditya. When both score the same, the bounded record is
 * the better answer. Sorting by the kind's name instead let "fact" win every
 * tie, which is how "ofline sinc engine" resolved to the bio record.
 */
const SPECIFICITY: Record<Match["kind"], number> = {
  project: 0,
  example: 1,
  figure: 2,
  fact: 3,
};

/** The indexed records, built from the same content the page renders. */
function buildCorpus({ site, projects }: CorpusInput): Corpus[] {
  const published = projects.filter((p) => p.status !== "pending-content");
  const corpus: Corpus[] = [];

  corpus.push({
    entry: {
      kind: "fact",
      title: "Who Aditya is",
      body: site.about ?? site.intro,
      source: "Site content, about section",
      score: 0,
    },
    terms: index([
      [site.owner, 4],
      [site.role, 4],
      // A place name is weak evidence on its own: at title weight, every
      // question mentioning the city, including weather and directions, had
      // matched this record and answered with the biography.
      [site.location, 2],
      [site.tagline, 3],
      [site.intro, 2],
      [site.about ?? site.intro, 2],
      ["live located based city", 3],
      ["about biography background summary who", 2],
    ]),
  });

  corpus.push({
    entry: {
      kind: "fact",
      title: "Education",
      body: site.academics_line ?? site.intro,
      source: "UIUC unofficial transcript, FA21 through FA24",
      score: 0,
    },
    terms: index([
      ["education school university degree gpa coursework study degree", 4],
      [site.academics_line ?? "", 3],
      ["uiuc illinois urbana champaign engineering dean list scholar minor", 3],
    ]),
  });

  // A curated example is indexed by its question only, at title weight. Its
  // answer is curated prose that largely repeats the records it summarises, so
  // indexing the answer text drags both the example and the underlying record
  // into one result and the reader sees the same thing twice.
  for (const example of site.ask_examples) {
    corpus.push({
      entry: { kind: "example", example, score: 0 },
      terms: index([[example.question, 4]]),
    });
  }

  for (const figure of site.impact) {
    corpus.push({
      entry: { kind: "figure", figure, score: 0 },
      terms: index([
        [figure.label, 2],
        [figure.value, 1],
        ["impact figure saving savings number measured projected self-reported result", 2],
      ]),
    });
  }

  for (const project of published) {
    const haystack = [
      project.summary,
      project.problem ?? "",
      project.role ?? "",
      project.outcome ?? "",
      ...project.approach,
      ...project.figures.map((f) => `${f.value} ${f.label}`),
    ].join(" ");
    corpus.push({
      entry: { kind: "project", project, score: 0 },
      terms: index([
        [project.title, 4],
        [project.tags.join(" "), 3],
        [project.course ?? "", 2],
        [project.role ?? "", 2],
        [haystack, 2],
        [project.slug.replace(/-/g, " "), 1],
      ]),
    });
  }

  return corpus;
}

/**
 * Scores every entry against the query.
 *
 * An entry is accepted for one of three reasons: two independent term hits, a
 * score that clears the single-strong-field floor, or a fuzzy correction that
 * landed on a title-level term. The third is what keeps a misspelled subject
 * answerable: "kernal" corrects to a term whose own weight is 4, which is a
 * strong single-field hit even though the discounted score alone is below the
 * floor.
 *
 * @param fuzzy when false, only exact term matches count. The fuzzy pass is a
 *   fallback, never a competitor: a question whose terms land exactly must not
 *   be outranked by an entry that merely has a similar word. Letting the two run
 *   together made a typo'd project question resolve to the broad bio record,
 *   because "engine" reaches "engineer" there and "engineer" is weighted high.
 */
function scoreAll(corpus: Corpus[], query: string[], fuzzy: boolean): Array<{ entry: Match; score: number }> {
  const scored: Array<{ entry: Match; score: number }> = [];
  for (const entry of corpus) {
    let score = 0;
    let hits = 0;
    let correctedTitle = false;
    for (const term of new Set(query)) {
      let weight = entry.terms.get(term);
      if (weight === undefined && fuzzy) {
        for (const [candidate, candidateWeight] of entry.terms) {
          if (candidate.length >= 5 && term.length >= 5 && oneEditApart(term, candidate)) {
            // Half the term's own weight, so a typo correction still carries
            // signal but can never outrank the exact hit it is correcting.
            weight = Math.max(1, Math.round(candidateWeight / 2));
            if (candidateWeight >= 4) correctedTitle = true;
            break;
          }
        }
      }
      if (weight !== undefined) {
        score += weight;
        hits += 1;
      }
    }
    if (hits >= 2 || score >= 4 || correctedTitle) {
      scored.push({ entry: entry.entry, score });
    }
  }
  return scored;
}

/** True when the question holds any word at all, rather than only punctuation. */
function hasAnyWord(question: string): boolean {
  return /[a-z]{2,}/i.test(question);
}

/**
 * Builds a retriever over one corpus.
 *
 * The corpus is the caller's own content, so the answer layer indexes exactly
 * what the page renders and the two cannot drift.
 */
export function buildRetriever(input: CorpusInput): Retriever {
  const corpus = buildCorpus(input);
  const identity = corpus.find((c) => c.entry.kind === "fact" && c.entry.title === "Who Aditya is");

  function rank(scored: Array<{ entry: Match; score: number }>, limit: number): Match[] {
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        SPECIFICITY[a.entry.kind] - SPECIFICITY[b.entry.kind] ||
        a.entry.kind.localeCompare(b.entry.kind),
    );
    return scored.slice(0, limit).map(({ entry, score }) => ({ ...entry, score }) as Match);
  }

  return {
    retrieve(question, limit = 3) {
      const query = tokenize(question);
      // A question made only of question words has no subject to match. Answer
      // it from the identity record rather than declining the likeliest question
      // a visitor asks. Only punctuation-only input declines.
      if (query.length === 0) {
        return hasAnyWord(question) && identity ? [{ ...identity.entry, score: 4 }] : [];
      }

      // Two passes, exact first. The exact pass wins outright; the fuzzy pass
      // runs only when it finds nothing, so a typo'd question still gets an
      // answer but never displaces an exact one.
      const exact = rank(scoreAll(corpus, query, false), limit);
      if (exact.length > 0) return exact;
      return rank(scoreAll(corpus, query, true), limit);
    },
  };
}

/** The answer a reader sees when no record supports the question. */
export const NO_ANSWER =
  "The portfolio records here do not support an answer to that. Try asking about a project, a technology, or a figure on this page.";
