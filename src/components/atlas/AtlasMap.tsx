"use client";

import { atlas } from "@/content/load";
import AtlasBuildings from "./AtlasBuildings";
import AtlasDefs from "./AtlasDefs";
import AtlasRiver from "./AtlasRiver";
import AtlasRoutes from "./AtlasRoutes";
import AtlasSky from "./AtlasSky";
import AtlasStations from "./AtlasStations";
import AtlasWindowLights from "./AtlasWindowLights";

/**
 * The Atlas hero map. This file is the shell only: the viewBox, the accessible
 * name, and the layer order. Every shape comes from content/atlas.json through
 * the layer components beside it, so editing the map is editing data.
 *
 * The skyline layer receives the landmark selection so a click or keypress on
 * a building can open its info card; every other layer stays non-interactive.
 */
export default function AtlasMap({
  selected = null,
  onSelect,
}: {
  selected?: string | null;
  onSelect?: (name: string | null) => void;
}) {
  return (
    <svg
      viewBox={atlas.viewBox}
      role="img"
      aria-label="The Atlas: a Chicago rail-map world where projects become stations"
      className="chi-map"
    >
      <AtlasDefs />
      <AtlasSky />
      <AtlasBuildings selected={selected} onSelect={onSelect} />
      <AtlasWindowLights />
      <AtlasRiver />
      <AtlasRoutes />
      <AtlasStations />
    </svg>
  );
}
