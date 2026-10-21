"use client";

import { useState } from "react";

type AskExample = { question: string; answer: string; source: string };

export default function AskBox({
  examples,
  headingId,
  heading,
  facadeLabel,
}: {
  examples: AskExample[];
  headingId: string;
  heading: string;
  facadeLabel: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const answer = selected === null ? null : examples[selected];

  return (
    <section
      aria-labelledby={headingId}
      className={facadeLabel === "atlas" ? "atlas-ask" : undefined}
    >
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="kicker">Ask the guide</span>
            <h2 id={headingId}>{heading}</h2>
          </div>
        </div>
        <div className="ask-box">
          <div className="ask-row" role="group" aria-label="Example questions">
            {examples.map((ex, i) => (
              <button
                key={ex.question}
                type="button"
                className="chip"
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
              >
                {ex.question}
              </button>
            ))}
          </div>
          <div className="answer" role="status" aria-live="polite">
            {" "}
            {answer
              ? `${answer.answer}`
              : "Pick a question to see how answers stay tied to the evidence."}
            <span className="src">
              {answer ? `Source: ${answer.source}` : "No answer yet"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
