# TypeScript migration plan

Status: proposed, awaiting dependency approval. Nothing in this document has been
built. The current zero-dependency site stays live and unchanged until this plan
is approved and the replacement is verified.

## Why TypeScript, and why now

The current stack (stdlib Python generator, hand-written HTML/CSS/JS) was the
right call for the concept phase: it deployed to GitHub Pages with no dependency
approvals and proved the content model, both facades, and the artwork.

It stops being the right call at exactly the point we are reaching:

- **Live Chicago data needs a real API client.** Typed responses, caching,
  staleness handling, and retry policy. This is application logic, not page
  rendering.
- **The NVIDIA layer needs a server.** The model key must never reach the
  browser, so the ask/Chicago Scout feature needs a server-side proxy.
- **The MCP endpoint is already Node.** It shares the content model with the
  site; shared types stop the two from drifting.
- **The interactive surfaces are growing.** Filter, stations, the map, and the
  future Bite Radar list are stateful components, and TypeScript pays for itself
  the moment several of them share data shapes.
- **Portfolio content is structured data.** The content model deserves compile
  time checking instead of Python-side assertions.

## Target architecture

```text
Next.js (App Router) + React + TypeScript, output: "export"
  -> static site, still served by GitHub Pages from the export directory
content/*.json (unchanged source of truth)
  -> loaded through typed loaders with schema validation at build time
src/ components
  -> Dispatch facade, Atlas facade, artwork, detail pages, filter, about
server/ (separate small Node service, TypeScript)
  -> MCP endpoint, Chicago data proxy with caching, NVIDIA proxy
  -> deployment target still open; see open decisions
```

The split matters: GitHub Pages serves static files only, so API routes cannot
live there. The static site keeps the current deployment story, and one small
Node service carries everything that needs a server. That service can start on
any cheap Node host.

## Phases

Each phase ends with the live site still working. Nothing ships half-typed.

1. **Scaffold and parity.** Next.js + TypeScript project, typed content loaders
   with validation, both facades rendered from the same content files. Success
   looks identical to today's site. Content files do not change.
2. **Artwork as components.** Landmark geometry moves from inline SVG strings
   into typed components; the Atlas renders from the same atlas.json.
3. **Detail pages and filtering as routes and components.** The static export
   generates one route per project; the filter becomes typed component state.
4. **The Node service.** MCP endpoint ported to TypeScript, sharing the content
   types. Add the Chicago data proxy with caching and published freshness.
   Verify against real endpoints and record terms compliance in
   docs/ai-exposure.md before any data reaches the site.
5. **The NVIDIA layer.** Server-side proxy for the ask tool and the Chicago
   Scout, keys server-side only, grounding rules unchanged from
   docs/ai-exposure.md.
6. **Food features.** Bite Radar list and the emerging-restaurant algorithm,
   built on the typed data layer.

## Dependencies (requires explicit approval per the standing rule)

Proposed set, deliberately small:

- `next`, `react`, `react-dom` (the framework)
- `typescript`, `@types/node`, `@types/react`, `@types/react-dom` (the type layer)
- `zod` (content schema validation at build time; the JSON gains a checked shape)

Not in the first phase: Tailwind, component libraries, framer-motion. The
current hand-written CSS carries the visual identity and keeps working.
Anything else gets proposed separately with a reason.

## What does not change

- The two-facade architecture and the portfolio-first rule from AGENTS.md
- content/ as the single source of truth
- Figure hedging (measured / projected / self-reported with sources)
- The public_safe gate on every public-facing record
- Authored SVG artwork pipeline and the straight-arrow Atlas
- Branch, PR, squash-merge, verify-live workflow

## Rollback

The current site remains deployed on Pages on `main`. The Next.js build starts
on a branch and deploys only when it passes parity review, so reverting is
switching the Pages source back. No feature of the current site is deleted
before its replacement is verified.

## Open decisions carried forward

- Node service host for MCP, data proxy, and NVIDIA proxy (user decision)
- Whether the MCP endpoint shares the site's deploy or runs independently
- Beli access for the food features, still unverified
