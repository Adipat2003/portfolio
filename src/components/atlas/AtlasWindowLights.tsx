import { atlas } from "@/content/load";

/** Lit windows, as a rate factor: every light uses the shared window_size. */
export default function AtlasWindowLights() {
  const [ww, wh] = atlas.window_size;
  return (
    <g fill="#e8b04b" opacity={0.75}>
      {atlas.window_lights.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={ww} height={wh} />
      ))}
    </g>
  );
}
