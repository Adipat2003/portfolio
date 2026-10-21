# Aditya Patel portfolio

Personal portfolio site: two facades over one content model.

Live at https://adipat2003.github.io/portfolio/ (GitHub Pages renders `main`).
Repository: https://github.com/Adipat2003/portfolio (public).

## Architecture: two facades, one portfolio

The site presents the same content through two facades. Both are first-class; the
toggle lives in the page chrome and is deep-linkable (`#atlas` opens the world
facade directly).

**Facade 1: The Dispatch.** A classic scroll: hero, impact strip, selected work,
ask. This is the default view and the primary surface for people who want to
read and for agents that index text. Everything essential lives here with
landmarks, headings, and stable URLs.

**Facade 2: The Atlas.** The explorable Chicago world: authored skyline, river,
elevated lines as routes, and projects as stations. Progressive enhancement
only. It never holds information the Dispatch does not, and it degrades to a
static, scrollable view when motion is reduced, permission is denied, or
JavaScript fails.

Why two facades: the Atlas is a memorable front door, but a portfolio has to be
readable, quotable, and indexable. Rather than compromise either, the content
model is built once and rendered twice. The Dispatch is not a fallback; it is a
peer.

## Layout

```text
content/     the content model (single source of truth)
  site.json      owner, hero copy, impact figures with hedging, ask examples
  projects.json  sanitized project records; build refuses unsafe ones
  atlas.json     Atlas geometry: landmarks, routes, stations, river, lights
scripts/
  build.py          renders the site from content; --check verifies committed output
  mcp-server.mjs    read-only MCP endpoint (Node stdlib), see docs/ai-exposure.md
index.html    generated: both facades in one page (do not edit by hand)
api/          generated: portfolio.json for agents
llms.txt, robots.txt   generated discovery files
art/          artwork documentation (geometry lives in content/atlas.json)
docs/          ai-exposure.md design
previews/     verification captures (gitignored, local only)
```

Build and verify:

```bash
python3 scripts/build.py
python3 scripts/build.py --check   # proves committed output matches content
```

Never hand-edit generated files; change content and rebuild.

## Content model

One project record shape, rendered by both facades. Each project carries:

- title, one-paragraph summary (plain language, no internal app or team names)
- the problem, what was owned, what was technically interesting, the result
- figures, tags, and the source document the claims come from
- a `public_safe` flag: anything about a current employer's internal systems,
  repositories, or incidents must be marked reviewed before it renders

Figures follow their source hedging. The $4-10M figure is labeled a projection;
hours-saved and report counts are labeled per their source. Nothing gets
upgraded from "projected" to "achieved" in the UI copy.

## Artwork pipeline

Custom art, not stock imagery and not generated imagery.

1. **Named landmarks as authored SVG.** Willis Tower's bundled setbacks, the
   Hancock's tapered cross-braced body, Marina City's corncob cylinders, and the
   rest are hand-placed path data in `content/atlas.json`, each entry naming its
   source building and identifying feature. Recognizable massing matters more
   than detail at silhouette scale.
2. **Routes and stations from data.** Line paths, station anchors, and labels
   render to SVG from the same file, so the map is diffable source rather than a
   mystery image, and the same data can flatten into the accessible text view.
3. **Atmosphere kept cheap and optional.** Dusk gradients, window lights, and the
   river are CSS and static SVG. Any heavier effect is opt-in and
   reduced-motion aware.

## AI and agent friendliness

Three layers, in the order they matter:

1. **Plain semantic HTML.** Landmarks, headings, list semantics, real links,
   visible focus, and text equivalents. Works with JavaScript disabled.
2. **A machine-readable content API.** `api/portfolio.json` returns the same
   project records the page renders with a content hash, so any agent can read
   the portfolio without a browser.
3. **A read-only MCP endpoint.** `scripts/mcp-server.mjs` exposes the portfolio
   as structured tools (`list_projects`, `get_project`, `get_impact_figures`,
   `get_artwork_provenance`, `ask`). Streamable HTTP transport per the MCP
   specification revision 2026-07-28, Node standard library only, Origin
   validation, rate limiting. Implementation and verification status live in
   `docs/ai-exposure.md`.

The `ask` tool is grounded: it answers from the portfolio records and cites the
source for each claim. It does not invent figures, and it declines when the
records do not support a claim.

## Stack

Deliberately zero-dependency today, because dependency additions require
explicit approval:

- Static HTML/CSS/JS rendered by a stdlib Python generator; GitHub Pages serves it
- Node standard library only for the MCP endpoint
- Hand-authored SVG artwork; no image model output, no stock imagery

Next.js + TypeScript remains an option if the site outgrows the static render
(for project pages, search, or the Chicago data features), and would be proposed
with its dependency list before installation.

## Workflow

Global codex instructions live at `~/.codex/AGENTS.md` and are loaded for
implementation work. Repository instructions for agents live in `AGENTS.md`.

Roadmap work is tracked as GitHub issues (1 through 6). Site changes land on
`main` through branches and pull requests; the initial bootstrap commit is the
only direct push. Verify the live Pages URL after any merge that changes the
site.
