import type { LineName } from "@/content/schema";

/**
 * The SVG marker id for a line's arrowhead. Deriving it from the line name
 * keeps atlas.json free of DOM ids that only exist to wire a path to a marker.
 */
export function markerId(line: LineName): string {
  return `arrow${line[0].toUpperCase()}${line.slice(1)}`;
}
