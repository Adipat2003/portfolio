import { atlas } from "@/content/load";

/** The Chicago River and its sheen, as path data from atlas.json. */
export default function AtlasRiver() {
  return (
    <g>
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
