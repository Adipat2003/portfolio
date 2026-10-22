"use client";

import { useEffect, useState } from "react";
import { chicagoEvents } from "@/content/load";
import { eventAt } from "@/content/chicago";

const INTERVAL_MS = 6000;

/**
 * The rotating city-events slot. Curated and static by design, so a live feed
 * can replace the array later without changing this component.
 *
 * Motion is an enhancement, never a gate: the first event is always readable,
 * the rotation stops on hover and on focus, and a reduced-motion reader keeps
 * the first event with no timer at all, matching the static output.
 */
export default function RotatingEvents() {
  const events = chicagoEvents;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCalm(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (calm || paused || events.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => i + 1), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [calm, paused, events.length]);

  if (events.length === 0) return null;
  const current = eventAt(events, index);

  return (
    <aside
      className="chi-events"
      aria-label="Happening in the city"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="kicker">In the city</span>
      {current ? (
        <p className="chi-event">
          <b>{current.title}</b> <span className="chi-when">{current.when}</span>
          {current.note ? <span className="chi-note">{current.note}</span> : null}
        </p>
      ) : null}
    </aside>
  );
}
