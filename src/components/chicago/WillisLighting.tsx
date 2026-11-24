"use client";

import { useEffect, useState } from "react";
import { WILLIS_LIGHTING_SOURCE, willisLightingDate, willisLightingSchema } from "@/content/willis-lighting";
import type { WillisLighting } from "@/content/willis-lighting";

const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL;

export function useWillisLighting(active: boolean) {
  const [lighting, setLighting] = useState<WillisLighting | null>(null);

  useEffect(() => {
    if (!active || !SERVICE_URL) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`${SERVICE_URL}/willis-lighting`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6500)]),
        });
        if (!response.ok) throw new Error("lighting unavailable");
        const result = willisLightingSchema.safeParse((await response.json())?.lighting);
        if (!controller.signal.aborted) setLighting(result.success ? result.data : null);
      } catch {
        if (!controller.signal.aborted) setLighting(null);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 600_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [active]);

  return lighting?.date === willisLightingDate(new Date()) ? lighting : null;
}

export function WillisLightingNote({ lighting }: { lighting: WillisLighting | null }) {
  return (
    <p className="willis-lighting-note">
      {lighting ? <>Scheduled tonight · {lighting.colors} <span aria-hidden="true">·</span> </> : null}
      <a href={WILLIS_LIGHTING_SOURCE} target="_blank" rel="noreferrer">Skydeck schedule ↗</a>
    </p>
  );
}

export default function WillisLightingDetails() {
  const [open, setOpen] = useState(false);
  const lighting = useWillisLighting(open);
  return (
    <details className="willis-lighting-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Antenna lighting</summary>
      <WillisLightingNote lighting={lighting} />
    </details>
  );
}
