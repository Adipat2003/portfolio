"use client";

import type { CSSProperties } from "react";
import { atlas } from "@/content/load";
import AtlasBuildings from "./AtlasBuildings";
import AtlasDefs from "./AtlasDefs";
import AtlasRiver from "./AtlasRiver";
import AtlasRoutes from "./AtlasRoutes";
import AtlasSky from "./AtlasSky";
import AtlasStations from "./AtlasStations";
import AtlasTrains from "./AtlasTrains";
import AtlasWindowLights from "./AtlasWindowLights";

/**
 * The Atlas hero map. This file is the shell only: the viewBox, the accessible
 * name, and the layer order. Every shape comes from content/atlas.json through
 * the layer components beside it, so editing the map is editing data.
 *
 * The skyline layer receives the landmark selection and the stations layer the
 * station selection, so clicks and keypresses on either open the scene card.
 * The caller passes focus variables for the station camera glide; the CSS
 * reads them, so the transform lives with the stylesheet, not the markup.
 */
export default function AtlasMap({
  selected = null,
  onSelect,
  stationSelected = null,
  onSelectStation,
  style,
}: {
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  stationSelected?: string | null;
  onSelectStation?: (slug: string | null) => void;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox={atlas.viewBox}
      role="img"
      aria-label="The Atlas: a Chicago rail-map world where projects become stations"
      className="chi-map"
      style={style}
    >
      <AtlasDefs />
      <AtlasSky />
      <AtlasBuildings selected={selected} onSelect={onSelect} />
      <AtlasWindowLights />
      <AtlasRiver />
      <AtlasRoutes />
      <AtlasTrains />
      <AtlasStations selected={stationSelected} onSelect={onSelectStation} />
    </svg>
  );
}
