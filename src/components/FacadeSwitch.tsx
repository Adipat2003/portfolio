"use client";

import { useEffect, useState } from "react";
import DispatchFacade from "./DispatchFacade";
import AtlasFacade from "./AtlasFacade";
import { site } from "@/content/load";

export default function FacadeSwitch() {
  const [facade, setFacade] = useState<"dispatch" | "atlas">("dispatch");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#atlas") {
      setFacade("atlas");
    }
  }, []);

  useEffect(() => {
    const next =
      facade === "dispatch"
        ? "Aditya Patel: The Dispatch"
        : "Aditya Patel: The Atlas";
    // On a deep-linked #atlas load the mount-time assignment is wiped: React
    // restores the static <title> after hydration settles, which runs after
    // the effects. Re-assert on later macrotasks so the restore never keeps
    // the last word. Toggling later works without the ladder, but the first
    // paint after a deep link needs it.
    const timers = [0, 60, 250, 600].map((ms) =>
      window.setTimeout(() => {
        document.title = next;
      }, ms)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [facade]);

  return (
    <>
      <div className="concept-bar" id="concept-bar" data-facade={facade} role="region" aria-label="Facade switch">
        <div className="concept-bar-inner">
          <span className="concept-title">Aditya Patel: Engineering Portfolio</span>
          <div className="seg" role="group" aria-label="Choose a facade">
            <button
              type="button"
              id="btn-dispatch"
              aria-pressed={facade === "dispatch"}
              onClick={() => setFacade("dispatch")}
            >
              {site.facades.dispatch.name}
            </button>
            <button
              type="button"
              id="btn-atlas"
              aria-pressed={facade === "atlas"}
              onClick={() => setFacade("atlas")}
            >
              {site.facades.atlas.name}
            </button>
          </div>
        </div>
      </div>
      {facade === "dispatch" ? <DispatchFacade /> : <AtlasFacade />}
    </>
  );
}
