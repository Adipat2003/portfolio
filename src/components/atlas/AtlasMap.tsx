"use client";

import type { CSSProperties } from "react";
import { atlas } from "@/content/load";
import AtlasBuildings from "./AtlasBuildings";
import AtlasDefs from "./AtlasDefs";
import AtlasRiver from "./AtlasRiver";
import AtlasRoutes from "./AtlasRoutes";
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
  activeStation = null,
  dimStations = false,
  style,
  svgRef,
  classNameOverride,
  children,
}: {
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  stationSelected?: string | null;
  onSelectStation?: (slug: string | null) => void;
  activeStation?: string | null;
  dimStations?: boolean;
  style?: CSSProperties;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  classNameOverride?: string;
  children?: React.ReactNode;
}) {
  return (
    <svg
      ref={svgRef}
      viewBox={atlas.viewBox}
      role="group"
      aria-label="The Atlas: a Chicago rail-map world where projects become stations"
      className={classNameOverride ?? "chi-map"}
      style={style}
    >
      <AtlasDefs />
      <AtlasBuildings selected={selected} onSelect={onSelect} />
      <g pointerEvents="none"><AtlasWindowLights /></g>
      <g pointerEvents="none"><AtlasRiver /></g>
      <g pointerEvents="none"><AtlasRoutes /></g>
      <AtlasTrains />
      <AtlasStations
        selected={stationSelected}
        onSelect={onSelectStation}
        activeStation={activeStation}
        dimAll={dimStations}
      />
      {children}
    </svg>
  );
}
