import { atlas } from "@/content/load";

/**
 * The night sky plate. Width and height come from the viewBox so the plate
 * cannot drift from the coordinate system the geometry is authored against.
 */
export default function AtlasSky() {
  const [, , width, height] = atlas.viewBox.split(/\s+/).map(Number);
  return <rect width={width} height={height} fill={`url(#${atlas.sky.id})`} />;
}
