import { atlas } from "@/content/load";

/**
 * The skyline. Each building is authored path data from atlas.json with the
 * identifying feature named in a tooltip, so the shapes carry provenance.
 */
export default function AtlasBuildings() {
  return (
    <g>
      {atlas.buildings.map((b) => (
        <g key={b.name}>
          <title>
            {b.name}: {b.feature}
          </title>
          <path d={b.d} fill={`url(#${atlas.building_fill.id})`} stroke="#3a4a6e" strokeWidth={1} />
          {b.extra ? (
            b.extra_fill ? (
              <path d={b.extra} fill={b.extra_fill} stroke="none" />
            ) : (
              <path d={b.extra} stroke={b.extra_stroke} strokeWidth={b.extra_width} fill="none" />
            )
          ) : null}
        </g>
      ))}
    </g>
  );
}
