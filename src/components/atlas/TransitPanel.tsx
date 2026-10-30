"use client";

import { useEffect, useRef, useState } from "react";

const SERVICE = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";
const time = (value: string) => value ? new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + " CT" : "Unavailable";
type Alert = { id: string; headline: string; description: string; impact: string; url: string };
type Evidence = { id: string; text: string; source: string; as_of: string };

export function TransitDisruptions() {
  const [feed, setFeed] = useState<{ available: boolean; alerts: Alert[]; as_of: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    async function load() {
      try {
        if (!SERVICE) throw new Error("Unavailable");
        const response = await fetch(`${SERVICE}/disruptions`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setFeed(data);
      } catch { if (!controller.signal.aborted) setFeed({ available: false, alerts: [], as_of: "" }); }
      if (!controller.signal.aborted) timer = window.setTimeout(load, 60_000);
    }
    load();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  return <div className="transit-disruptions">
    <p className="rail-panel-note">Official CTA notices</p>
    {!feed ? <p role="status">Checking service…</p> : !feed.available ? <p role="status">Current notices are unavailable. <a href="https://www.transitchicago.com/alerts/">Check CTA directly ↗</a></p> : <>
      <p className="rail-panel-note">Updated {time(feed.as_of)}</p>
      {feed.alerts.length ? feed.alerts.map((alert) => <details key={alert.id}><summary>{alert.headline}</summary><p>{alert.description}</p><a href={alert.url}>CTA notice ↗</a></details>) : <p>No active notices returned. Conditions can change.</p>}
    </>}
  </div>;
}

export function TransitGuide({ station }: { station?: string }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ answer: string; evidence: Evidence[] } | null>(null);
  useEffect(() => { if (result) { answerRef.current?.focus({ preventScroll: true }); answerRef.current?.scrollIntoView({ block: "nearest" }); } }, [result]);
  async function ask(value: string) {
    if (!value.trim() || busy) return;
    setQuestion(value); setBusy(true); setResult(null);
    try {
      if (!SERVICE) throw new Error("Unavailable");
      const response = await fetch(`${SERVICE}/ask-transit`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(55_000), body: JSON.stringify({ question: value, ...(station ? { station } : {}) }) });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (typeof data.answer !== "string" || !Array.isArray(data.evidence)) throw new Error("Invalid response");
      setResult(data);
    } catch { setResult({ answer: "The transit guide is unavailable. You can still select stations for arrivals or open official CTA notices.", evidence: [] }); }
    finally { setBusy(false); }
  }
  return <div className="transit-guide">
    <p className="rail-panel-note">Ask about arrivals, trains, delays or closures. Answers use current CTA records.</p>
    <form onSubmit={(event) => { event.preventDefault(); ask(question); }}>
      <label htmlFor="transit-question">Your question</label>
      <textarea id="transit-question" rows={2} maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Any closures on the Blue Line?" />
      <button type="submit" disabled={busy || !question.trim()}>{busy ? "Checking live data…" : "Ask CTA"}</button>
    </form>
    {!result && !busy ? <div className="transit-guide-prompts">{["Any service disruptions?", "Where are Blue Line trains?", ...(station ? ["When is the next train here?"] : [])].map((value) => <button key={value} type="button" disabled={busy} onClick={() => ask(value)}>{value}</button>)}</div> : null}
    <div ref={answerRef} tabIndex={-1} className="transit-guide-answer" role="status" aria-live="polite">
      {result ? <><p>{result.answer}</p>{[...new Set(result.evidence.map((record) => record.source))].filter((source) => /^https:\/\/www\.transitchicago\.com\//.test(source)).map((source) => <a key={source} href={source}>CTA source ↗</a>)}{result.evidence.some((record) => record.as_of) ? <small>Data checked {time(result.evidence.find((record) => record.as_of)!.as_of)}. Predictions can change.</small> : null}</> : null}
    </div>
  </div>;
}
