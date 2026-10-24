"use client";

import { atlas, LINE_COLORS, stations } from "@/content/load";

/**
 * The stations, one per project, now interactive: click or Enter to select a
 * station, which glides the scene camera onto it and opens its project card.
 * The circle keeps the line color of its project and the label keeps its
 * dark halo, so the artwork rules hold while the layer becomes operable.
 */
export default function AtlasStations({
  selected = null,
  onSelect,
  activeStation = null,
}: {
  selected?: string | null;
  onSelect?: (slug: string | null) => void;
  activeStation?: string | null;
}) {
  const style = atlas.station_style;

  function activate(slug: string, alreadySelected: boolean) {
    onSelect?.(alreadySelected ? null : slug);
  }

  return (
    <g
      fontFamily="ui-monospace, Menlo, monospace"
      fontSize="14"
      fill="#e9e6df"
      style={{ paintOrder: "stroke" }}
      stroke={style.halo}
      strokeWidth="6"
      strokeLinejoin="round"
    >
      {stations.map(({ slug, station, project }) => (
        <g
          key={slug}
          className={`station${selected === slug ? " station-active" : ""}${
            activeStation && activeStation !== slug ? " station-dim" : ""
          }`}
          role="button"
          tabIndex={0}
          aria-pressed={selected === slug}
          aria-label={`${station.label} station: open the ${project.title} project`}
          onClick={() => activate(slug, selected === slug)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate(slug, selected === slug);
            }
            if (event.key === "Escape") {
              onSelect?.(null);
            }
          }}
        >
          <title>{station.label}</title>
          <circle
            cx={station.cx}
            cy={station.cy}
            r={style.r}
            fill={style.fill}
            stroke={LINE_COLORS[project.line]}
            strokeWidth={style.stroke_width}
          />
          <text
            x={station.cx + station.dx}
            y={station.cy + station.dy}
            textAnchor={station.anchor ?? "start"}
          >
            {station.label}
          </text>
        </g>
      ))}
    </g>
  );
}
