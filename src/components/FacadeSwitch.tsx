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
    document.title =
      facade === "dispatch"
        ? "Aditya Patel: The Dispatch"
        : "Aditya Patel: The Atlas";
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
