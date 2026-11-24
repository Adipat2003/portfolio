import { atlas } from "@/content/load";

/** Lit windows, as a rate factor: every light uses the shared window_size. */
export default function AtlasWindowLights({ obscured }: { obscured?: string }) {
  const [ww, wh] = atlas.window_size;
  return (
    <>
      {obscured ? (
        <mask id="atlas-angled-window-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="white" />
          <path d={obscured} fill="black" />
        </mask>
      ) : null}
      <g className="window-lights" fill="var(--atlas-lights, #e8b04b)" opacity={0.7} clipPath="url(#atlas-window-mask)"
        mask={obscured ? "url(#atlas-angled-window-mask)" : undefined}>
        {atlas.window_lights.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={ww} height={wh} />
        ))}
      </g>
    </>
  );
}
