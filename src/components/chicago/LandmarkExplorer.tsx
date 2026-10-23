"use client";

import { useState } from "react";
import AtlasMap from "@/components/atlas/AtlasMap";
import { atlas, landmarkNote, LINE_COLORS, stations } from "@/content/load";

/**
 * The interactive Atlas scene: landmarks open their info card, and stations
 * now answer too. Selecting a station glides the camera onto it and opens a
 * signage-styled card linking to the project page, so the map is a real
 * navigation surface, not only a picture. The card below is the live region,
 * so a screen reader hears either selection without needing the pointer.
 */
export default function LandmarkExplorer() {
  const [selected, setSelected] = useState<string | null>(null);
  const [stationSlug, setStationSlug] = useState<string | null>(null);
  const building = atlas.buildings.find((b) => b.name === selected) ?? null;
  const note = selected ? landmarkNote(selected) : null;
  const stationRecord = stationSlug
    ? stations.find((s) => s.slug === stationSlug) ?? null
    : null;

  const [, , vw, vh] = atlas.viewBox.split(/\s+/).map(Number);
  const focusStyle: React.CSSProperties = stationRecord
    ? ({
        "--zoom": "1.55",
        "--fox": `${(stationRecord.station.cx / vw) * 100}%`,
        "--foy": `${(stationRecord.station.cy / vh) * 100}%`,
      } as React.CSSProperties)
    : {};

  function selectBuilding(name: string | null) {
    setSelected(name);
    if (name) setStationSlug(null);
  }

  function selectStation(slug: string | null) {
    setStationSlug(slug);
    if (slug) setSelected(null);
  }

  return (
    <div className="chi-explorer">
      <AtlasMap
        selected={selected}
        onSelect={selectBuilding}
        stationSelected={stationSlug}
        onSelectStation={selectStation}
        style={focusStyle}
      />
      <div
        className={`chi-card${stationRecord ? " station-card" : ""}`}
        role="status"
        aria-live="polite"
      >
        {stationRecord ? (
          <>
            <span
              className="line-band-dot"
              aria-hidden="true"
              style={{ background: LINE_COLORS[stationRecord.project.line] }}
            />
            <p className="sign">{stationRecord.station.label}</p>
            <h3>
              <a href={`/portfolio/projects/${stationRecord.slug}/`}>
                {stationRecord.project.title}
              </a>
            </h3>
            <p className="chi-feature">{stationRecord.project.summary}</p>
          </>
        ) : building ? (
          <>
            <h3>{building.name}</h3>
            <p className="chi-feature">{building.feature}</p>
            {note ? <p className="chi-note">{note}</p> : null}
          </>
        ) : (
          <p className="chi-hint">Select a landmark or a station on the map to see what it is.</p>
        )}
      </div>
    </div>
  );
}
