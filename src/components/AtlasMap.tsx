import { atlas, LINE_COLORS } from "@/content/load";

const ROUTES: Array<{ line: "red" | "blue"; d: string }> = [
  { line: "red", d: "M40 300 L1170 120" },
  { line: "blue", d: "M0 340 L1200 268" },
];

export default function AtlasMap({ projects }: { projects: Array<{ slug: string; title: string; line: "red" | "blue" }> }) {
  const style = atlas.station_style;
  const [ww, wh] = atlas.window_size;

  return (
    <svg
      viewBox={atlas.viewBox}
      role="img"
      aria-label="The Atlas: a Chicago rail-map world where projects become stations"
    >
      <defs>
        <linearGradient id="atlasSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0e18" />
          <stop offset="0.6" stopColor="#131a2c" />
          <stop offset="1" stopColor="#1d2233" />
        </linearGradient>
        <linearGradient id="towerGlass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#222b42" />
          <stop offset="1" stopColor="#141a29" />
        </linearGradient>
        <marker id="arrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#c0392b" />
        </marker>
        <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#2e86c1" />
        </marker>
      </defs>

      <rect width="1200" height="470" fill="url(#atlasSky)" />

      <g>
        {atlas.buildings.map((b) => (
          <g key={b.name}>
            <title>
              {b.name}: {b.feature}
            </title>
            <path d={b.d} fill="url(#towerGlass)" stroke="#3a4a6e" strokeWidth={1} />
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

      <g fill="#e8b04b" opacity={0.75}>
        {atlas.window_lights.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={ww} height={wh} />
        ))}
      </g>

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

      <g fill="none" strokeWidth={3}>
        {ROUTES.map((r) => (
          <path
            key={r.line}
            d={r.d}
            stroke={LINE_COLORS[r.line]}
            markerEnd={`url(#arrow${r.line === "red" ? "Red" : "Blue"})`}
          />
        ))}
      </g>

      <g
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="13"
        fill="#e9e6df"
        style={{ paintOrder: "stroke" }}
        stroke={style.halo}
        strokeWidth="5"
        strokeLinejoin="round"
      >
        {Object.entries(atlas.labels).map(([slug, s]) => {
          const project = projects.find((p) => p.slug === slug);
          const color = LINE_COLORS[project?.line ?? "red"];
          return (
            <g key={slug}>
              <title>{s.label}</title>
              <circle
                cx={s.cx}
                cy={s.cy}
                r={style.r}
                fill={style.fill}
                stroke={color}
                strokeWidth={style.stroke_width}
              />
              <text x={s.cx + s.dx} y={s.cy + s.dy}>
                {s.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
