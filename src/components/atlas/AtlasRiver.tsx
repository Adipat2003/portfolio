import { atlas } from "@/content/load";

/** The Chicago River and its sheen, as path data from atlas.json. The group
    carries the river-body class so the March dye window can recolor every
    stroke and the water body from CSS alone. */
export default function AtlasRiver() {
  return (
    <g className="river-body">
      {atlas.river.map((r, i) => (
        <path
          key={i}
          d={r.d}
          stroke={r.stroke}
          strokeWidth={r.width}
          fill={r.fill ?? "none"}
          opacity={r.opacity}
        />
      ))}
    </g>
  );
}
