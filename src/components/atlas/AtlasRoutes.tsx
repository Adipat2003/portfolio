import { LINES, LINE_COLORS, atlas } from "@/content/load";
import { markerId } from "./markerId";

/**
 * The elevated lines. Route geometry lives in atlas.json, one entry per line,
 * with a marker-end arrowhead so travel direction reads at a glance.
 */
export default function AtlasRoutes() {
  return (
    <g fill="none" strokeWidth={3}>
      {LINES.flatMap((line) =>
        atlas.routes.filter((r) => r.line === line).map((route) => (
          <path
            key={`${line}-${route.d}`}
            d={route.d}
            stroke={LINE_COLORS[line]}
            markerEnd={`url(#${markerId(line)})`}
          />
        )),
      )}
    </g>
  );
}
