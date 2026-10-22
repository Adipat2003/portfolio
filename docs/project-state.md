# Project state

Picking this up fresh? Read this file top to bottom, then `AGENTS.md`, then the
`docs/` linked below. This is the standing handoff for the portfolio repo. It is
updated whenever a change lands, so it is never a stale description of the code.

Last updated: 2026-10-22.

## What this is

The personal portfolio site for Aditya Patel. One content model, two facades,
rendered by two renderers, plus a machine-readable layer so an AI agent can read
the portfolio as well as a person does.

- Repo: https://github.com/Adipat2003/portfolio (public)
- Local clone: /home/hermes/portfolio
- Live site: https://adipat2003.github.io/portfolio (GitHub Pages, `main` root)
- Agent-facing artifacts: /portfolio/api/portfolio.json, /portfolio/llms.txt,
  /portfolio/robots.txt

## How to build and verify

Everything runs from /home/hermes/portfolio. Node 24 and npm 11 are installed.
`node_modules` is already installed; if it goes missing, `npm ci` rebuilds from
the lockfile.

```bash
npm run typecheck                  # tsc --noEmit, expect clean
npm run build                      # next build + postbuild, exports to out/
node scripts/season-check.mjs      # 14 boundary and palette checks, expect PASS
python3 scripts/season-check-python.py  # Python date and renderer parity, expect PASS
node scripts/ask-check.mjs         # 20 retrieval assertions across 14 questions, expect PASS
node scripts/chicago-check.mjs    # 14 assertions over the Chicago shaping rules, expect PASS
python3 scripts/build.py --check   # verifies committed static artifacts match content and Chicago surfaces sit on both facades
node scripts/art-export.mjs --check  # verifies art/*.svg match atlas.json
```

`scripts/ask-check.mjs` and `scripts/season-check.mjs` import the modules the
page itself imports and run them under plain Node with no test dependency and no
build step. This is deliberate: `src/content/retrieval.ts` and
`src/content/season.ts` take their content as a parameter rather than importing
JSON, because a bare JSON import resolves under the Next bundler but not under
Node. Do not add a runtime import to either module, or the checks silently stop
exercising it and report success on an empty run.

`python3 scripts/build.py` (no flag) regenerates index.html, every
projects/<slug>/index.html, api/portfolio.json, and llms.txt in place. Run it
after any content change, then run the `--check` form until it says PASS.

Local serve of the static export, then verify with real URLs:

```bash
mkdir -p /tmp/serve && ln -sfn /home/hermes/portfolio/out /tmp/serve/portfolio
cd /tmp/serve && python3 -m http.server 8231
# check /portfolio/, /portfolio/projects/<slug>/, /portfolio/api/portfolio.json,
# /portfolio/llms.txt all return 200
```

Per AGENTS.md, browser verification is mandatory before done. Use a viewport-only
`cdp('Page.captureScreenshot', format='jpeg', quality=88)` capture and create the
destination directory first. Full-page `capture_screenshot()` can wedge the CDP
daemon. Screenshots land in previews/, which is gitignored.

## Architecture

```
content/            single source of truth (JSON, hand-authored)
  site.json         owner, tagline, impact figures, facade copy, ask examples
  projects.json     14 project records, each with public_safe: true
  atlas.json        Chicago map geometry: 13 buildings, 21 window lights,
                    river, 2 routes, 7 stations, gradients
  seasons.json      four season boundaries, timezone, and palettes
  chicago.json      personal spots, curated events, landmark notes. Spots and
                    events stay empty until records are approved for publication
scripts/
  build.py          zero-dependency Python generator. Owns index.html, all
                    project pages, api/portfolio.json, llms.txt. --check mode.
  mcp-server.mjs    read-only MCP endpoint, Node stdlib only. Not deployed.
  postbuild.mjs     copies api/llms.txt/robots.txt into the Next export
  art-export.mjs    writes art/<landmark>.svg from atlas.json, --check mode
  season-check.mjs  14 boundary dates and four palette checks against seasons.json
  season-check-python.py  Python resolution and renderer parity checks for seasons
  ask-check.mjs     20 retrieval assertions across 14 questions
  chicago-check.mjs 14 assertions over the Chicago shaping rules
src/
  content/          Zod schemas (schema.ts) + validated loaders (load.ts)
    retrieval.ts    grounded ask retrieval. No runtime imports.
    season.ts       season resolution and palettes. No runtime imports.
    chicago.ts      spot ordering, event wrap, landmark notes. No runtime imports.
  components/       React components for both facades
    atlas/          one component per Atlas layer (Phase 2)
    chicago/        LandmarkExplorer, ChicagoSpots, RotatingEvents
    SeasonSync.tsx  corrects data-season after hydration
  app/              Next.js App Router, static export, basePath /portfolio
art/                13 standalone landmark SVGs, generated from atlas.json
```

Two renderers over one content model. `scripts/build.py` renders the site that
is live on Pages today. The Next.js components render the export that will
replace it. Both read `content/`, so neither can hold content the other lacks.

### The content guard

`src/content/schema.ts` parses every record at build time and fails the build on
a mismatch. `src/content/load.ts` adds cross-checks that a schema alone cannot
express. Every station in `atlas.json` must name a project that exists, is
published, and sits on a line that has a route. The build fails otherwise.

`schema.ts` and its successor shape still need to stay in step with
`scripts/build.py`'s Python-side guard, which checks `public_safe_reviewed` and
per-record `public_safe`.

## The two facades

**Facade 1, The Dispatch.** Classic editorial scroll, the default and primary
surface. Hero, impact strip (4 figures with hedging kind), filterable project
grid, about, ask-the-guide, footer. Everything essential lives here.

**Facade 2, The Atlas.** Chicago rail map. Hand-authored night skyline, river,
two arrowed elevated routes, and projects as stations. Enhancement only. It
never holds information the Dispatch does not. Pointer parallax on fine pointers
only, reduced-motion aware.

The toggle sits in the sticky bar, is deep-linkable via #atlas, and updates
document.title. On the Python side it is plain JS in index.html; on the Next
side it is `src/components/FacadeSwitch.tsx` with client state. The Next title
effect re-asserts the title on a short timer ladder: React restores the static
`<title>` after hydration settles, which runs after the mount effects and wipes
their assignment, so a deep-linked #atlas load used to keep the generic title.
Do not remove the ladder without retesting a fresh #atlas load.

## Seasonal theming

`content/seasons.json` defines four boundaries (astronomical equinox and solstice
dates, fixed to the day) and a palette each. The layout resolves the season once
at build time and emits `data-season` plus palette variables on the document root,
so the first paint needs no client work. `SeasonSync` recomputes in an effect after
hydration and updates both the attribute and variables, so a boundary passed
since the build does not need a deploy. It runs in an effect rather than during
render on purpose: the first paint must match the build-time value or hydration
fails.

Seasons vary the accent and accent-soft tokens, the three Atlas sky stops, and
the window-light colour. Nothing else. Artwork, geometry, and structure are
season-invariant. The sky stops and the light rects read CSS custom properties
with the authored atlas.json value as the fallback, so an unthemed render still
draws the authored sky and warm windows. `scripts/build.py` reads the same
season definition and palette for the Python-rendered page and project details.

Season boundaries are checked rather than eyeballed. `scripts/season-check.mjs`
asserts all boundary transitions, six mid-season dates, and the four palette
records. `scripts/season-check-python.py` verifies the corresponding Python date
walk, palette variables, and SVG token usage.

## The grounded ask feature

`src/content/retrieval.ts` answers a typed question from the same records the
page renders, and cites the record behind every claim. AskBox takes free text,
renders the matched record itself (summary, role, outcome, approach steps,
figures with their own hedging), and shows the source under every answer. A
curated example ranks first where one exists for the subject, and the underlying
project record follows it, so the reader gets the reviewed wording and the
underlying data.

Ranking weights title above tags above body. Two passes: exact terms first, and
a one-edit typo pass only when the exact pass finds nothing. Ties break by
record specificity, so a project outranks the biography record rather than losing
to it on a name. An entry is accepted for two independent term hits, a single
strong-field hit, or a typo correction onto a title-level term. Below that the UI
says the records do not support the question, which is a correct answer.

`scripts/ask-check.mjs` runs the shipped scoring under plain Node against the
live content: should-match, should-decline, and misspelled questions, plus the
hedge and identity rules. It caught four real ranking bugs that hand-testing
missed, so it is not optional.

## Hard rules that bind every change

From AGENTS.md, plus ~/.codex/AGENTS.md which applies globally:

- The Dispatch is primary. The Atlas never holds information the Dispatch does
  not. A fact that only exists in the world view is a bug.
- No employer-internal app, repository, team, or issue names in any
  public-facing file.
- Every claim is figured from its source document and keeps its hedging. A
  projection stays labeled projected. Nothing is upgraded in the copy.
- No em dashes in new user-facing strings, labels, comments, docs, or messages.
- No dependency additions or upgrades without Aditya's explicit approval.
- No secrets. API keys live server-side only and never enter a commit.
- Aditya Patel is the author of record. A Co-authored-by trailer is the only
  place an AI is credited.
- Branch, PR, squash-merge, then verify the live URL. No direct pushes to main.
- Scan the staged diff for secrets before every commit.
- Roadmap work is tracked as GitHub issues, one per deliverable.

## Roadmap and current status

From `docs/typescript-plan.md`, which carries the full reasoning and the
phased plan. `docs/ai-exposure.md` carries the AI layer design.

- **Phase 1, scaffold and parity.** MERGED, PR #12, commit 9a57676. Next.js App
  Router, React 19, TypeScript, Zod. Static export with basePath /portfolio.
  Typed content loaders. 14 SSG detail pages. Parity verified in a browser.
- **Phase 2, artwork as components.** MERGED, PR #14 (closed #13). Route
  geometry moved to atlas.json; AtlasMap decomposed into per-layer typed
  components; gradients typed; station cross-checks added on both renderers;
  art/*.svg export added.
- **Grounded ask retrieval.** DONE on PR #14, browser-verified. AskBox takes free
  text, ranks the records, and cites the record behind each answer. This is the
  retrieval half of the RAG feature; the NVIDIA step rephrases what it returns
  with citations attached, so a model can reword but never becomes the source
  of a claim. `scripts/ask-check.mjs` currently covers 20 assertions across 14
  questions.
- **Seasonal theming.** DONE on PR #14. Layout emits `data-season` and the
  content-driven palette at build time; SeasonSync updates the attribute and
  CSS variables after hydration. The Python renderer emits the same season and
  palette from `seasons.json`. Browser-verified for all four seasons.
- **Chicago layer foundation.** DONE on PR #14. `content/chicago.json` carries a
  Zod schema and content guards on both sides: per-record `public_safe`, a
  landmark note must name a real atlas building, and no slug repeats.
  LandmarkExplorer (clickable, keyboard-operable landmarks with an info card),
  ChicagoSpots (the personal strip), and RotatingEvents (pauses on hover and
  focus, no timer under reduced motion) all render nothing until records
  arrive, which is the committed state: the Chicago Masterlist stays private
  and a record enters only when Aditya approves its fields for publication.
  Spots, events, and the landmark facts render on both facades, so a fact can
  never exist only in the world view; build.py's check mode asserts every
  Chicago surface appears on both facades or neither. `scripts/chicago-check.mjs`
  covers the ordering, wrap, and note rules, and build.py renders the same
  layer from the same file.
- **Phase 3, detail pages and filtering as routes and components.** Mostly
  delivered inside Phase 1 (generateStaticParams and FilterBar already exist).
  Remaining work is to confirm nothing is missing and close it.
- **Phase 4, the Node service.** Not started. MCP endpoint ported to
  TypeScript, Chicago data proxy with caching and freshness, terms review
  recorded in docs/ai-exposure.md.
- **Phase 5, the NVIDIA layer.** Not started. Server-side proxy for the ask
  tool and the Chicago Scout, keys server-side only.
- **Phase 6, food features.** Not started. Bite Radar list and the
  emerging-restaurant algorithm.

### Approved dependency set

next, react, react-dom, zod, typescript, @types/node, @types/react,
@types/react-dom. Exactly these, nothing else. Anything further needs approval.

## Open decisions, blockers, and requests

These block work and belong to Aditya:

- **Node service host.** Pages serves static files only, so the MCP endpoint,
  the Chicago data proxy, and the NVIDIA proxy all need a Node host. No host
  chosen, so Phase 4 cannot start.
- **Whether the MCP endpoint shares the site deploy or runs independently.**
- **Beli API access** for the food features, still unverified.
- **Deployment of the Next build.** Merging the scaffold and artwork PRs to
  main does not change the Pages source; switching pages_source to out/ is a
  separate decision.
- **Chicago live-data terms review**, issue #6, covering CTA, Divvy GBFS, and
  NWS. Research can start now and needs no host.
- **Phase 2 adjustments**, requested by Aditya and not yet specified.
- **An NVIDIA model on the site itself**, requested by Aditya: a RAG-style
  model fed on a corpus about him, to answer visitors about him. The retrieval
  half is now built and the corpus is the portfolio records. Still needed: his
  own context file to widen the corpus, the route through the Node service, and
  a decision on how the "sound great" framing coexists with the no-fabrication
  rule. A model may rephrase what retrieval returns; it may never be the source
  of a claim.
- **Chicago interactivity**, requested by Aditya: bars and food spots, and a
  rotating list of city events such as sports. The foundation is now on PR #14.
  What remains is the records themselves, which need Aditya to approve each
  venue's fields for publication (the Masterlist stays private), and the live
  feeds, which still require the terms review above.

## Work started outside this repo and not lost

NVIDIA model routing work exists in the Hermes config for this machine. It set
up nvidia/ aliases (kimi-k3, glm-5-3, step-5-preview, deepseek-v4.1-flash) and
an NVIDIA provider plugin at ~/.hermes/profiles/cloud/plugins/model-providers/nvidia.
The current default is stepfun-ai/step-5-preview on nvidia. A two-step /model
picker (nvidia or chatgpt first, then the model list) was requested but not
built. Verify with `hermes config get model` before touching it.

## Defects worth remembering

- **Window lights were broken on the live site from PR #10 until PR #14.**
  `scripts/build.py` joined the rect strings into one value and then iterated it
  per character, so the 21 window lights emitted as garbage. Fixed in PR #14 by
  building a list instead of a joined string.
- **An orphan Atlas station shipped to the live site.** The 'personal-projects'
  station named no project, and the Python renderer silently defaulted its line
  colour, so it rendered as a station with no card. Fixed in PR #14 by retiring
  it, and by the station cross-check that now fails the build on both
  renderers (src/content/load.ts and scripts/build.py).
- **Both renderers once hardcoded route geometry.** Routes lived as literal path
  strings in AtlasMap.tsx and build.py. Moved to atlas.json in PR #14.
