import { atlas, LINE_COLORS, stations } from "@/content/load";

/**
 * The stations, one per project. The circle is stroked in the line color of
 * the project it belongs to, and the label carries a dark halo (paint-order)
 * so text stays legible over the artwork.
 */
export default function AtlasStations() {
  const style = atlas.station_style;
  return (
    <g
      fontFamily="ui-monospace, Menlo, monospace"
      fontSize="13"
      fill="#e9e6df"
      style={{ paintOrder: "stroke" }}
      stroke={style.halo}
      strokeWidth="5"
      strokeLinejoin="round"
    >
      {stations.map(({ slug, station, project }) => (
        <g key={slug} className="station">
          <title>{station.label}</title>
          <circle
            cx={station.cx}
            cy={station.cy}
            r={style.r}
            fill={style.fill}
            stroke={LINE_COLORS[project.line]}
            strokeWidth={style.stroke_width}
          />
          <text x={station.cx + station.dx} y={station.cy + station.dy}>
            {station.label}
          </text>
        </g>
      ))}
    </g>
  );
}
