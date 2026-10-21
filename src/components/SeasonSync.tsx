"use client";

import { useEffect } from "react";
import { seasons } from "@/content/load";

/**
 * Keeps the document's season correct without a rebuild.
 *
 * The layout emits the season resolved at build time. Between a boundary and
 * the next deploy that value goes stale, so this recomputes on the client and
 * corrects the attribute.
 *
 * It runs in an effect rather than during render on purpose: the first paint
 * must use the build-time value, or the server and client output differ and
 * hydration fails. An effect runs after hydration, so a correction cannot
 * cause a mismatch.
 */
export default function SeasonSync() {
  useEffect(() => {
    const next = seasons.seasonFor(new Date());
    const palette = seasons.paletteFor(next);
    const root = document.documentElement;
    if (root.dataset.season !== next) {
      root.dataset.season = next;
    }
    root.style.setProperty("--accent", palette.accent);
    root.style.setProperty("--accent-soft", palette.accent_soft);
    root.style.setProperty("--atlas-sky-1", palette.sky[0]);
    root.style.setProperty("--atlas-sky-2", palette.sky[1]);
    root.style.setProperty("--atlas-sky-3", palette.sky[2]);
    root.style.setProperty("--atlas-lights", palette.lights);
  }, []);

  return null;
}
