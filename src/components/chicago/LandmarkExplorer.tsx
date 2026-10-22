"use client";

import { useState } from "react";
import AtlasMap from "@/components/atlas/AtlasMap";
import { atlas, landmarkNote } from "@/content/load";

/**
 * The clickable landmarks of the Atlas. Selecting a building opens an info
 * card with what it is, which renders from atlas.json plus the author's note
 * when one exists. The same facts are already published as the standalone
 * landmark SVGs, so the card reveals nothing the Dispatch rule reserves for
 * the map.
 *
 * The map is keyboard operable: each building is a focusable group, Enter and
 * Space toggle the card, and Escape closes it. The card below is the live
 * region, so a screen reader hears the selection without the pointer.
 */
export default function LandmarkExplorer() {
  const [selected, setSelected] = useState<string | null>(null);
  const building = atlas.buildings.find((b) => b.name === selected) ?? null;
  const note = selected ? landmarkNote(selected) : null;

  return (
    <div className="chi-explorer">
      <AtlasMap selected={selected} onSelect={setSelected} />
      <div className="chi-card" role="status" aria-live="polite">
        {building ? (
          <>
            <h3>{building.name}</h3>
            <p className="chi-feature">{building.feature}</p>
            {note ? <p className="chi-note">{note}</p> : null}
          </>
        ) : (
          <p className="chi-hint">Select a landmark on the map to see what it is.</p>
        )}
      </div>
    </div>
  );
}
