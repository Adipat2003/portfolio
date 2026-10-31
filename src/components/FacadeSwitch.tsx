"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import DispatchFacade from "./DispatchFacade";
import { site } from "@/content/load";

const AtlasFacade = lazy(() => import("./AtlasFacade"));

export default function FacadeSwitch() {
  const [facade, setFacade] = useState<"dispatch" | "atlas">("dispatch");

  useEffect(() => {
    const syncFromHash = () => {
      if (typeof window === "undefined") return;
      setFacade(["#atlas", "#atlas-ride", "#view-atlas", "#map"].includes(window.location.hash) ? "atlas" : "dispatch");
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
    // Keep the selected facade title when lazy content hydrates.
    const syncTitle = () => { if (document.title !== next) document.title = next; };
    syncTitle();
    const observer = new MutationObserver(syncTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
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
      {facade === "dispatch" ? <DispatchFacade /> : <Suspense fallback={<div className="atlas-loading" role="status">Opening the Atlas…</div>}><AtlasFacade /></Suspense>}
    </>
  );
}
