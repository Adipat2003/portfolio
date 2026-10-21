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
    if (document.documentElement.dataset.season !== next) {
      document.documentElement.dataset.season = next;
    }
  }, []);

  return null;
}
