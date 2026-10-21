import { atlas, LINES, LINE_COLORS } from "@/content/load";
import { markerId } from "./markerId";

/**
 * The reusable pieces of the map: the sky gradient, the tower fill, and one
 * arrowhead marker per line. Every value comes from atlas.json, so a palette
 * change is a content change.
 */
export default function AtlasDefs() {
  return (
    <defs>
      <linearGradient id={atlas.sky.id} x1={atlas.sky.x1} y1={atlas.sky.y1} x2={atlas.sky.x2} y2={atlas.sky.y2}>
        {atlas.sky.stops.map((stop) => (
          <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
        ))}
      </linearGradient>
      <linearGradient
        id={atlas.building_fill.id}
        x1={atlas.building_fill.x1}
        y1={atlas.building_fill.y1}
        x2={atlas.building_fill.x2}
        y2={atlas.building_fill.y2}
      >
        {atlas.building_fill.stops.map((stop) => (
          <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
        ))}
      </linearGradient>
      {LINES.map((line) => (
        <marker
          key={line}
          id={markerId(line)}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={LINE_COLORS[line]} />
        </marker>
      ))}
    </defs>
  );
}
