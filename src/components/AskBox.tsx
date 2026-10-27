"use client";

import { useState } from "react";
import { publishedProjects, site } from "@/content/load";
import { buildRetriever, NO_ANSWER, type Match } from "@/content/retrieval";
import type { Figure } from "@/content/schema";

type AskExample = { question: string; answer: string; source: string };

/**
 * The hosted service base URL, baked at build time. Empty on the static
 * Pages build, so the ask feature runs on local grounded retrieval; set it
 * (NEXT_PUBLIC_SERVICE_URL) and the same UI upgrades to model-polished
 * answers from the service, falling back locally on any failure.
 */
const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";

// The retriever indexes exactly what the page renders, so an answer can never
// come from a record the reader is not looking at.
const { retrieve } = buildRetriever({ site, projects: publishedProjects });

/** A figure keeps its own hedging, so it is shown exactly as the record has it. */
function FigureLine({ figure }: { figure: Figure }) {
  return (
    <li className="fig">
      <b>{figure.value}</b> {figure.label} <i>({figure.kind})</i>
    </li>
  );
}

/** The record behind a match, rendered so every claim carries its source. */
function MatchBody({ match }: { match: Match }) {
  if (match.kind === "project") {
    const p = match.project;
    return (
      <div className="ask-result">
        <h3>{p.title}</h3>
        <p>{p.summary}</p>
        {p.role ? (
          <p className="role">
            <b>Role:</b> {p.role}
          </p>
        ) : null}
        {p.outcome ? <p>{p.outcome}</p> : null}
        {p.approach.length ? (
          <ul className="steps">
            {p.approach.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
        {p.figures.length ? (
          <ul className="figs">
            {p.figures.map((f, i) => (
              <FigureLine key={`${f.value}-${i}`} figure={f} />
            ))}
          </ul>
        ) : null}
        <p className="link">
          <a href={`/portfolio/projects/${p.slug}/`}>Full project page</a>
        </p>
      </div>
    );
  }
  if (match.kind === "figure") {
    return (
      <div className="ask-result">
        <h3>{match.figure.label}</h3>
        <ul className="figs">
          <FigureLine figure={match.figure} />
        </ul>
      </div>
    );
  }
  if (match.kind === "example") {
    return (
      <div className="ask-result">
        <p>{match.example.answer}</p>
      </div>
    );
  }
  return (
    <div className="ask-result">
      <h3>{match.title}</h3>
      <p>{match.body}</p>
    </div>
  );
}

/** Where a match came from, shown under every answer. */
function matchSource(match: Match): string {
  if (match.kind === "project") return `Project record: ${match.project.slug}`;
  if (match.kind === "figure") return `Impact figure: ${match.figure.source}`;
  if (match.kind === "example") return match.example.source;
  return match.source;
}

export default function AskBox({
  examples,
  headingId,
  heading,
  variant = "section",
}: {
  examples: AskExample[];
  headingId: string;
  heading: string;
  variant?: "section" | "panel";
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Match[] | null>(null);
  const [polished, setPolished] = useState<{ answer: string; sources: string[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [polishing, setPolishing] = useState(false);

  function ask(question: string) {
    setQuery(question);
    setPolished(null);
    setResults(null);
    if (SERVICE_URL) {
      // The visitor never waits on the model. The grounded retrieval
      // answer renders after a short grace period (a warm model usually
      // answers within it), and the polished rephrase swaps in whenever
      // the hosted service lands. A cold service is never a dead screen.
      setPending(true);
      let settled = false;
      const local = retrieve(question);
      const grace = window.setTimeout(() => {
        if (!settled) {
          setResults(local);
          setPending(false);
          setPolishing(true);
        }
      }, 1800);
      fetch(`${SERVICE_URL}/ask-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`service ${res.status}`);
          const data = await res.json();
          if (data?.grounded !== true) throw new Error("not grounded");
          settled = true;
          window.clearTimeout(grace);
          setPolished({ answer: String(data.answer), sources: Array.isArray(data.sources) ? data.sources : [] });
        })
        .catch(() => {
          settled = true;
          window.clearTimeout(grace);
          setResults(local);
        })
        .finally(() => {
          setPending(false);
          setPolishing(false);
        });
      return;
    }
    setResults(retrieve(question));
  }

  const answered = results !== null;
  const declined = answered && results.length === 0;

  const body = (
    <>
      <form
        className="ask-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = query.trim();
          if (trimmed) ask(trimmed);
        }}
      >
        <label className="sr-only" htmlFor={`ask-${headingId}`}>
          Ask a question about Aditya's work
        </label>
        <input
          type="search"
          id={`ask-${headingId}`}
          className="ask-input"
          placeholder="Ask about his work or a number"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="chip ask-submit">
          Ask
        </button>
      </form>

      <div className="ask-row" role="group" aria-label="Example questions">
        {examples.map((ex) => (
          <button
            key={ex.question}
            type="button"
            className="chip"
            aria-pressed={query === ex.question}
            onClick={() => ask(ex.question)}
          >
            {ex.question}
          </button>
        ))}
      </div>

      <div className="answer" role="status" aria-live="polite">
        {" "}
        {polished ? (
          <>
            <div className="ask-result">
              <p>{polished.answer}</p>
            </div>
            <span className="src">
              Grounded sources: {polished.sources.join("; ")} · rephrased by the service
            </span>
          </>
        ) : null}
        {pending ? (
          <div className="ask-result">
            <p className="booth-waiting">The terminal is checking the records&hellip;</p>
          </div>
        ) : null}
        {!answered && !polished && !pending
          ? "Ask a question, and the answer comes from the portfolio records with its source attached."
          : null}
        {declined ? NO_ANSWER : null}
        {answered && !declined && !polished
          ? results.map((match, i) => (
              <div key={`${match.kind}-${i}`}>
                <MatchBody match={match} />
                <span className="src">{matchSource(match)}</span>
              </div>
            ))
          : null}
        {polishing && !polished ? (
          <span className="src booth-polishing">rephrasing the answer&hellip;</span>
        ) : null}
        {!answered && !polished && !pending ? <span className="src">No answer yet</span> : null}
      </div>
    </>
  );

  if (variant === "panel") {
    return (
      <div className="ask-box booth-panel" aria-labelledby={headingId}>
        <p className="sign" id={headingId}>
          {heading}
        </p>
        {body}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="kicker">Ask the guide</span>
            <h2 id={headingId}>{heading}</h2>
          </div>
        </div>
        <div className="ask-box">{body}</div>
      </div>
    </section>
  );
}
