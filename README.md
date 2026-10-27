# Aditya Patel portfolio

Personal portfolio site: two facades over one content model.

Live at https://adipat2003.github.io/portfolio/. The `Deploy site` GitHub
Actions workflow builds and publishes the Next.js static export on every push
to `main`; the committed Python-rendered files in the repo root are the
documented rollback path (flip the Pages build type back to `legacy`).
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
  seasons.json   season boundaries and palettes
  chicago.json   Chicago spots, events, landmark notes
src/          Next.js App Router + TypeScript: typed loaders, both facades,
  detail pages, filter, Atlas components, retrieval, season engine
server/       the Node service: MCP endpoint, ask-model
scripts/      build.py (rollback renderer + --check), verification checks,
  service-check.mjs, art-export.mjs, postbuild.mjs
.github/workflows/deploy.yml   builds and deploys the export to Pages
api/          generated: portfolio.json for agents
llms.txt, robots.txt   generated discovery files
art/          13 authored landmark SVGs (geometry lives in content/atlas.json)
docs/         project-state.md (standing handoff), ai-exposure.md,
  live-data-terms.md, typescript-plan.md
previews/     verification captures (gitignored, local only)
```

Build and verify (full list and explanations in docs/project-state.md):

```bash
npm run typecheck
npm run build                 # next build + postbuild, exports to out/
npm run check:service         # builds server/ and runs the 16-probe service check
node scripts/ask-check.mjs
python3 scripts/build.py --check
```

## Local API secrets

Local runs load `~/.config/portfolio/secrets.env` when it exists. The personal
file is outside this repository, has owner-only permissions, and is never
tracked. `npm run dev`, `npm run build`, `npm run start`, and
`npm run start:service` load it automatically; shell-exported values take
precedence. Node.js 20.12 or newer is required for this local loader.

Supported entries are `CTA_API_KEY` and `NVIDIA_API_KEY` for local values,
plus `CTA_MAPID`, `NVIDIA_MODEL`,
`NEXT_PUBLIC_SERVICE_URL`, and `SERVICE_ALLOWED_ORIGINS`. The frontend calls
the local Node service at `http://localhost:8788`; build and start that service
with `npm run build:service` and `npm run start:service` in another terminal.
Only `npm run start:service` receives the two server keys; Next.js commands
receive the public service URL but not CTA or NVIDIA credentials.
`npm run check:service` intentionally bypasses the file so its no-key fallback
checks remain meaningful. Production keys continue to live in Render.

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
3. **A read-only MCP endpoint.** The `server/` TypeScript service exposes the
   portfolio as structured tools (`list_projects`, `get_project`,
   `get_impact_figures`, `get_artwork_provenance`, `ask`). Streamable HTTP
   transport per the MCP specification revision 2026-07-28, Node standard
   library only, Origin validation, per-route rate limiting, plus an NWS
   weather proxy for the Chicago layer and an optional, env-gated model
   polish layer. Implementation and verification status live in
   `docs/ai-exposure.md`; it runs locally until a public host is chosen.

The `ask` tool is grounded: it answers from the portfolio records and cites the
source for each claim. It does not invent figures, and it declines when the
records do not support a claim.

## Stack

Dependencies are pinned to the approved set (next, react, react-dom, zod,
typescript, @types/*); anything else needs explicit approval:

- Next.js App Router + React + TypeScript, statically exported; the Actions
  workflow publishes the export to GitHub Pages
- The `server/` Node service uses the Node standard library plus zod only
- Hand-authored SVG artwork; no image model output, no stock imagery
- `scripts/build.py` stays as the zero-dependency rollback renderer and the
  committed-artifact check

## Workflow

Global codex instructions live at `~/.codex/AGENTS.md` and are loaded for
implementation work. Repository instructions for agents live in `AGENTS.md`.

Roadmap work is tracked as GitHub issues (1 through 6). Site changes land on
`main` through branches and pull requests; the initial bootstrap commit is the
only direct push. Verify the live Pages URL after any merge that changes the
site.
