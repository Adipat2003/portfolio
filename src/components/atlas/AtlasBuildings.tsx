import { atlas } from "@/content/load";

/**
 * The skyline. Each building is authored path data from atlas.json with the
 * identifying feature named in a tooltip, so the shapes carry provenance.
 *
 * Buildings also answer to the keyboard: each group is a focusable button that
 * toggles its info card, with Enter, Space, and Escape handled. The card text
 * already ships in the static HTML of the standalone landmark SVGs, so this
 * interaction adds a way to reach it, never new facts.
 */
export default function AtlasBuildings({
  selected = null,
  onSelect,
}: {
  selected?: string | null;
  onSelect?: (name: string | null) => void;
}) {
  return (
    <g>
      {atlas.buildings.map((b) => {
        const open = selected === b.name;
        return (
          <g
            key={b.name}
            className={open ? "atlas-building selected-building" : "atlas-building"}
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label={`${b.name}: ${b.feature}`}
            onClick={() => onSelect?.(open ? null : b.name)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(open ? null : b.name);
              }
              if (event.key === "Escape") onSelect?.(null);
            }}
          >
            <title>
              {b.name}: {b.feature}
            </title>
            <path
              d={b.d}
              vectorEffect="non-scaling-stroke"
              fill={`url(#${atlas.building_fill.id})`}
              stroke="#3a4a6e"
              strokeWidth={1}
              className={open ? "bld-selected" : undefined}
            />
            {b.extra ? (
              b.extra_fill ? (
                <path vectorEffect="non-scaling-stroke" d={b.extra} fill={b.extra_fill} stroke="none" />
              ) : (
                <path vectorEffect="non-scaling-stroke" d={b.extra} stroke={b.extra_stroke} strokeWidth={b.extra_width} fill="none" />
              )
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
