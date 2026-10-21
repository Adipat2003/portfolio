# Aditya Patel portfolio: concept board

Repository root for the personal portfolio site. Currently in the design exploration
phase. Nothing here is deployed yet.

## What exists

- `index.html` — a single self-contained concept page with both
  facades, hand-authored SVG landmarks, and working interactions. Open it directly
  in a browser.
- `art/` — starting point for authored artwork (see below).
- `previews/` — rendered captures of both facades from the last verification pass.

## Architecture: two facades, one portfolio

The site presents the same content through two facades. Both are first-class; the
toggle lives in the page chrome and is deep-linkable (`#dispatch`, `#atlas`).

**Facade 1: The Dispatch.** A classic scroll: hero, impact strip, selected work,
about, contact. This is the default view and the primary surface for people who
want to read and for agents that index text. Everything essential lives here with
landmarks, headings, and stable URLs.

**Facade 2: The Atlas.** The explorable Chicago world: a hand-drawn skyline, the
river, elevated lines as routes, and projects as stations. Progressive enhancement
only. It never holds information the Dispatch does not, and it degrades to a
static, scrollable view when motion is reduced, permission is denied, or
JavaScript fails.

Why two facades: the Atlas is a memorable front door, but a portfolio has to be
readable, quotable, and indexable. Rather than compromise either, the content
model is built once and rendered twice. The Dispatch is not a fallback; it is a
peer.

## Content model

One project record shape, rendered by both facades. Each project carries:

- title, one-paragraph summary (plain language, no internal app or team names)
- the problem, what was owned, what was technically interesting, the result
- evidence links, tags, and the source document the claims come from
- a `public_safe` flag: anything about a current employer's internal systems,
  repositories, or incidents must be marked reviewed before it renders

Figures follow the source document's own hedging. The $4-10M BAM number is
labeled a projection; hours-saved and report counts are labeled per their source.
Nothing gets upgraded from "projected" to "achieved" in the UI copy.

## Artwork pipeline

Custom art, not stock imagery and not generated imagery.

1. **Named landmarks as authored SVG.** Willis Tower's bundled setbacks, the
   Hancock's tapered cross-braced body, Marina City's corncob cylinders, and the
   rest are hand-placed path data. Each landmark gets its own file under `art/`
   with a comment naming its source building. Recognizable massing matters more
   than detail at silhouette scale.
2. **Routes and stations from data.** A route definition file (line paths,
   station anchors, labels) renders to SVG, so the map is diffable source rather
   than a mystery image, and the same data can flatten into the accessible
   text view.
3. **Atmosphere kept cheap and optional.** Dusk gradients, window lights, and the
   river are CSS and static SVG. Any heavier effect is opt-in and
   reduced-motion aware.

## AI and agent friendliness

Three layers, in the order they matter:

1. **Plain semantic HTML.** Landmarks, headings, list semantics, real links,
   visible focus, and text equivalents. Works with JavaScript disabled.
2. **A machine-readable content API.** `GET /api/portfolio.json` returns the same
   project records the page renders, so any agent can read the portfolio without
   a browser.
3. **An MCP endpoint.** A read-only Model Context Protocol server exposing the
   portfolio as structured tools (`list_projects`, `get_project`,
   `get_impact_figures`, `get_artwork_provenance`, plus a `ask` tool that answers
   questions about the portfolio with source citations). Read-only, no write
   tools, no secrets in responses. This is what an AI visitor uses to read the
   site properly instead of scraping.

The `ask` tool is grounded: it answers from the portfolio records and cites the
source document for each claim. It does not invent figures, and it says so when
the portfolio does not support a claim. See `docs/ai-exposure.md` for the design.

## Planned stack

Still a proposal until you approve dependencies:

- Next.js (App Router) + React + TypeScript, statically rendered
- Plain CSS custom properties for tokens, SVG for artwork
- MDX or Markdown project content compiled to typed records at build time
- MCP endpoint as a small Node route inside the app, backed by the same build
  output
- Postgres + vector search only when the restaurant tracker and portfolio search
  actually need it

No dependencies are added without explicit approval, per the standing rule.

## Repository

Live at https://github.com/Adipat2003/portfolio (public). GitHub Pages renders
`main` root at https://adipat2003.github.io/portfolio/ and is the production
renderer: verify the live URL after any push that changes the site.

Work is tracked as GitHub issues (roadmap items 1 through 6) and lands on `main`
through branches and pull requests. The initial bootstrap commit is the only
direct push.

Context for future work

Global codex instructions live at `~/.codex/AGENTS.md` and are loaded for
implementation work. Repository instructions for agents live in `AGENTS.md`
in this repository.
