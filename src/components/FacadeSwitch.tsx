"use client";

import { useEffect, useState } from "react";
import DispatchFacade from "./DispatchFacade";
import AtlasFacade from "./AtlasFacade";
import { site } from "@/content/load";

export default function FacadeSwitch() {
  const [facade, setFacade] = useState<"dispatch" | "atlas">("dispatch");

  useEffect(() => {
    const syncFromHash = () => {
      if (typeof window === "undefined") return;
      setFacade(["#atlas", "#atlas-ride", "#view-atlas"].includes(window.location.hash) ? "atlas" : "dispatch");
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const setFacadeWithHash = (next: "dispatch" | "atlas") => {
    setFacade(next);
    if (typeof window === "undefined") return;
    const nextHash = next === "atlas" ? "#atlas" : "";
    if (window.location.hash !== nextHash) {
      if (nextHash) {
        window.history.replaceState(null, "", `${window.location.pathname}${nextHash}`);
      } else {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  };

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
          <span className="concept-title">{site.owner}</span>
          <div className="seg" role="group" aria-label="Choose a facade">
            <button
              type="button"
              id="btn-dispatch"
              aria-pressed={facade === "dispatch"}
              onClick={() => setFacadeWithHash("dispatch")}
            >
              {site.facades.dispatch.name}
            </button>
            <button
              type="button"
              id="btn-atlas"
              aria-pressed={facade === "atlas"}
              onClick={() => setFacadeWithHash("atlas")}
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
