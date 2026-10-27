# Project state

Picking this up fresh? Read this file top to bottom, then `AGENTS.md`, then the
`docs/` linked below. This is the standing handoff for the portfolio repo. It is
updated whenever a change lands, so it is never a stale description of the code.

Last updated: 2026-10-23.

## What this is

The personal portfolio site for Aditya Patel. One content model, two facades,
rendered by two renderers, plus a machine-readable layer so an AI agent can read
the portfolio as well as a person does.

- Repo: https://github.com/Adipat2003/portfolio (public)
- Local clone: /home/hermes/portfolio
- Live site: https://adipat2003.github.io/portfolio. Deployed by the
  `Deploy site` GitHub Actions workflow (Pages build_type: workflow) from the
  Next static export in out/. The committed Python-rendered files in the repo
  root remain the documented rollback path: flip build_type back to legacy
  and Pages serves them again.
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
node scripts/bite-check.mjs       # 10 Bite Radar scoring checks over fixtures, expect PASS
python3 scripts/build.py --check   # verifies committed static artifacts match content and Chicago surfaces sit on both facades
node scripts/art-export.mjs --check  # verifies art/*.svg match atlas.json
npm run check:service               # builds server/ and runs scripts/service-check.mjs
                                    # (14 probes: MCP protocol, ask-model), expect PASS
```

`season-check.mjs` also pins the March river-dye window (March 14 through 20)
from both sides. After changing `content/atlas.json` or any other content
file, run `python3 scripts/build.py` to regenerate the committed rollback
artifacts, then the `--check` form until it says PASS.

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

The full quality gate, in order, for any change that touches the ride,
layout, CSS, map, or facade switch:

```bash
npm run typecheck
npm run build
node scripts/season-check.mjs
node scripts/ask-check.mjs
node scripts/chicago-check.mjs
node scripts/bite-check.mjs
node scripts/art-export.mjs --check
python3 scripts/build.py --check
npm run check:service        # when server/ changed
```

Then the aspect-ratio matrix and the interaction pass from AGENTS.md, which
are browser checks, not script checks, and which are the only thing that
catches layout regressions at other viewports.

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
                    Its committed output is the Pages rollback path.
  postbuild.mjs     copies api/llms.txt/robots.txt into the Next export
  art-export.mjs    writes art/<landmark>.svg from atlas.json, --check mode
  season-check.mjs  14 boundary dates and four palette checks against seasons.json
  season-check-python.py  Python resolution and renderer parity checks for seasons
  ask-check.mjs     20 retrieval assertions across 14 questions
  chicago-check.mjs 14 assertions over the Chicago shaping rules
  service-check.mjs 14 end-to-end probes over the Node service
.github/workflows/deploy.yml   builds and deploys the export to Pages on push to main
server/             the Node service (TypeScript, compiled by server/tsconfig.json
                    to server/dist, gitignored). Not yet hosted publicly.
  index.ts          stdlib HTTP: routing, per-route rate limits, CORS, health
  content.ts        fs-loads content/ and validates with the shared Zod schemas
  mcp.ts            the five MCP tools, ask backed by the shared retriever
  weather.ts        REMOVED Oct 2026: the NWS proxy was removed with the
                    weather feature; git history keeps it
  ask-model.ts      NVIDIA rephrase layer, env-gated, retrieval stays the source
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

Two renderers over one content model. `scripts/build.py` renders the committed
static artifacts that are the Pages rollback path. The Next.js components render
the export the Actions workflow deploys. Both read `content/`, so neither can
hold content the other lacks.

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
surface. Hero, searchable two-column project grid with figures in their owning cards,
about, ask-the-guide, footer. Everything essential lives here.

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
`docs/live-data-terms.md` carries the cited Chicago live-data terms review
(issue #6).

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
- **Phase 3, detail pages and filtering as routes and components.** CLOSED,
  2026-10-23, audit only, no code change. Delivered inside Phase 1 and audited:
  the export contains exactly 14 `projects/<slug>/` SSG routes matching the
  content slugs (plus a 404 route); `FilterBar.tsx` filters through typed
  `useState`/`useMemo` component state over typed records; and all 14 detail
  pages have full normalized-text parity with the Python-rendered pages that
  are live today (differences before normalization were only React's
  `<!-- -->` text-node separators). `api/portfolio.json`, `llms.txt`, and
  `robots.txt` all copy into the export via postbuild. All eight verification
  scripts pass on the audited tree. Issue #1 closed with the same evidence.
- **Phase 4, the Node service.** BUILT and verified locally 2026-10-23; hosting
  still pending the host decision below. `server/` is a TypeScript,
  Node-stdlib service: the MCP endpoint ported from mcp-server.mjs with the
  ask tool backed by the shared retriever, per-route rate limits, CORS for
  the site origin, and a health endpoint. `scripts/service-check.mjs`
  probes all 14 cases end to end. The old scripts/mcp-server.mjs was
  removed once the port passed every probe; git history keeps it. The NWS
  weather proxy was removed with the weather feature (Oct 2026). Terms
  posture for every feed lives in docs/live-data-terms.md.
- **Phase 5, the NVIDIA layer.** IMPLEMENTED, disabled by default. The
  `/ask-model` route rephrases the grounded retrieval through the NVIDIA
  chat completions API when NVIDIA_API_KEY is set, with the contract from
  docs/ai-exposure.md enforced in the system prompt: answer only from the
  records, keep figures with hedging and sources, never add claims. With no
  key, or on any model failure, it serves the grounded retrieval answer and
  reports model_polish: false. The key is environment-only; it is never
  logged, committed, or returned.
- **Atlas redesign, October 2026, PRs #19 #20 #21.** The Atlas is now a
  full-viewport After Dark scene: skyline anchored under the season sky, title
  overlaid on the dusk, warm cursor light on fine pointers, twinkling window
  lights, 'L' trains riding the exact route paths (SMIL, hidden under reduced
  motion), interactive stations that glide the camera onto the selected
  station and open a signage-styled project card, a weather overlay driven by
  a baked NWS snapshot, and the river drawn as the municipal Y that turns
  green for the March dye week. Chicago flag identity runs through both
  facades (kicker stars, favorite-star hexagrams, flag-blue closing rules,
  line-color bands on project cards). All of it is reduced-motion safe and
  keyboard operable.
- **Live weather.** REMOVED Oct 2026 at Aditya's direction (redundant): the
  badge, condition overlays, weather-bake workflow, content/weather.json,
  and the service /weather route are gone; git history keeps them. The NWS
  terms review stays in docs/live-data-terms.md if live weather is ever
  wanted again.
- **The Night Ride, October 2026, PRs #23 #24 #25.** The Atlas hero is now a
  13-phase scroll-driven scene: a sticky stage, a rAF loop lerping the camera
  and the you-are-here train, stops that weave the 7 project stations and the
  4 impact figures (spelled in lit windows via the 5x7 font in
  src/content/windowfont.ts, placed by content/mosaics.json) into one
  west-to-east journey, a trip-strip HUD, click-to-jump stations, dimmed
  non-active stops, a dusk-to-night-to-pre-dawn sky interpolation, and a
  sunrise lakefront footer. Reduced motion snaps instead of gliding; the
  Dispatch is untouched and remains the readable canonical surface.
- **Phase 6, food features.** BITE RADAR BUILT Oct 2026 (PR #33): the
  emerging-restaurant feature, local-first because Beli has no official
  public API (verified again Oct 2026; the community scraper wrappers are
  out of bounds under this repo's terms posture). The integration IS
  `content/bites.json`: hand-approved records from his private Beli
  list, public_safe-gated, duplicate names fail the build. The scoring
  lives in the pure module `src/content/bite-radar.ts` (rating 50
  percent, recency 30, repeats 20; rising/steady/cooling labels on his
  own self-reported behavior), pinned by `scripts/bite-check.mjs` (10
  checks over fixtures, since the committed log is empty). The Dispatch
  renders the top five with score bars; nothing renders until he adds
  records.

### Approved dependency set

next, react, react-dom, zod, typescript, @types/node, @types/react,
@types/react-dom. Exactly these, nothing else. Anything further needs approval.

## Open decisions, blockers, and requests

These block work and belong to Aditya:

- **Node service host.** DONE 2026-10-26: the service is live on Render
  (Blueprint deploy from render.yaml) at
  https://portfolio-service-elt4.onrender.com, auto-deploying from main.
  Both keys are configured by Aditya in the Render dashboard (never in
  the repo): CTA_API_KEY returns real Clark/Lake arrivals (mapid 40380
  verified against CTA's own documentation), NVIDIA_API_KEY enables
  model polish. The live-fire debugging that followed is recorded below.
- **Ask model on the site, live.** DONE 2026-10-26: the site build bakes
  NEXT_PUBLIC_SERVICE_URL from a repository Actions variable (set via the
  Actions API) so the terminal's ask booth routes through /ask-model and
  the ride's CtaLive chips fetch real arrivals. The model is
  z-ai/glm-5.3-flash: the only servable instruct model measured through
  the real key (mistral and nemotron ids in NVIDIA's public catalog
  return 404/410; deepseek-v4.1-flash exceeds 60s). Live latency is
  roughly 23-45s, so the booth shows a pulsing 'checking the records'
  line while the answer is prepared, and every failure falls back to the
  grounded retrieval text. Notes for the future: NVIDIA's catalog lists
  ids that are no longer servable, so always verify through /ask-model
  before switching NVIDIA_MODEL; and the CTA JSON feed speaks ISO
  timestamps ('2026-10-26T11:28:55'), not the spaced shape in the API
  docs.
- **Beli API access** for the food features, still unverified. RESOLVED
  Oct 2026: no official public API exists; Bite Radar is local-first over
  content/bites.json (see Phase 6 above), and nothing else may scrape.
- **Deployment of the Next build.** DONE 2026-10-23: Pages build_type is
  `workflow`, the `Deploy site` Actions workflow ships out/ on every push to
  main, and the live URL was verified in a browser (facade switch, detail
  pages, assets, deep link). Rollback: set build_type back to `legacy` and
  Pages serves the committed Python-rendered files from the repo root again.
- **Chicago live-data terms review**, issue #6, CLOSED 2026-10-23. The
  reviewed verdicts and integration requirements live in
  `docs/live-data-terms.md`: NWS ready now, CTA ready after key
  registration, city datasets ready with the mandatory disclaimer, Divvy
  blocked on one probe (the GBFS feed denies requests from this network;
  read its license fields from an allowed network before use).
- **Phase 2 adjustments**, requested by Aditya and not yet specified.
- **An NVIDIA model on the site itself**, requested by Aditya: a RAG-style
  model fed on a corpus about him, to answer visitors about him. DONE
  2026-10-26: retrieval over the portfolio records is the only source of
  claims; z-ai/glm-5.3-flash on /ask-model rephrases what retrieval
  returned, keeps figures with their hedging and sources, and diverts
  anything outside Aditya's portfolio with one redirect sentence. The
  no-fabrication rule holds: the model may never be the source of a
  claim, and any model failure falls back to the grounded retrieval
  text. Corpus widening via his own context file remains open.
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
- **Cross-renderer text diffs are misleading by default.** React emits
  `<!-- -->` comment separators between adjacent text nodes; a naive
  HTML-text extractor treats them as element boundaries and reports phantom
  whitespace differences (figure hedges showed as `( self-reported ,`).
  Strip `<!-- -->` before comparing rendered text between the Python pages
  and the Next export, or normalize whitespace and compare full strings.

## CTA network work, 2026-10-27

Phase 0 of `docs/atlas-live-cta-network-plan.md` is implemented. The geographic
network and live feed implementation follows in PR #67 and issue #66 below.
The skyline ride stays as a secondary tour. Issue #64 tracks this deliverable.

- Arrival minutes use CTA `arrT` minus `prdt`, as defined in the
  [official API guide](https://www.transitchicago.com/developers/ttdocs/).
  Invalid timestamps are omitted, source approaching/delayed/scheduled flags
  are preserved, and expired cached arrivals cannot be returned as live after
  an upstream failure.
- The terminal has a bounded scroll area below the measured header and trip
  strip. Browser scroll anchoring is disabled inside the ride: changing a
  station's board height previously moved the page into the preceding stop.
  Station controls stay available during loading and service failure; requests
  have a 15-second deadline and are cancelled on station changes/unmount.
  Empty feeds say "No arrivals", and schedule-only feeds say "Scheduled".
- The existing local wrapper loads credentials without logging them, passes
  CTA/NVIDIA keys only to the service, and leaves Next.js with the public URL.
  A local service launched through that wrapper returned valid predictions
  (including nonzero ETAs and approaching flags). The secrets file was not
  read or copied into the repository. The service check explicitly clears keys
  so its no-key checks stay deterministic even with shell credentials set.
- Render `/health` and `/transit?station=40380` both returned HTTP 200 before
  this change. Its older deployment still returned all-zero ETAs. A successful
  health response alone does not establish arrival correctness; check the
  normalized payload again after the service deploys.
- Local service checks, typecheck, static export build, and content checks
  pass. The Python rollback artifacts were regenerated and pass
  `python3.14 scripts/build.py --check`. The canonical browser suite verifies the nine viewport geometries,
  station and landmark selection, guide answers, Dispatch filters/detail
  navigation, keyboard focus, reduced motion, no-JavaScript content, and touch
  dragging. It also covers controlled loading, scheduled/delayed, empty and
  unavailable board states. Viewport JPEGs were inspected at desktop, short
  laptop and phone sizes. Post-merge Pages geometry and hosted CTA payload
  verification remain required before calling production validated.

## Full CTA Atlas, 2026-10-27

Issue #66 follows Phase 0. PR #67 ships the deterministic GTFS network and
server feeds first, so the UI only ships after hosted endpoints are verified.
`content/cta-network.json` carries the official package's eight lines and 143
parent stations, branches, platforms, transfer edges, coordinate projection and
source metadata. `scripts/build-cta-network.py --help` documents regeneration;
its check mode regenerates twice and compares the committed output.

`CtaRailMap` is now Atlas's opening and closing section. The skyline remains the
portfolio ride between them. Both maps consume a single polling provider and
share server-cached positions, station arrivals and official route status.
Selections, route filtering and search are local to each map. HTML station
controls and a train list provide an equivalent to SVG interactions. Project
connections are editorial navigation links from the existing station records;
their copy and detail pages still come from the canonical project records.

The right-edge defect came from unbounded camera translation and reading a
transformed rectangle with a newer zoom factor. The camera now reads stable
layout dimensions and bounds its pan. The finite SVG sky plate is removed;
CSS provides the full-stage sky. Building strokes stay constant under zoom,
selection is interruptible, and Escape or scrolling returns to the ride.

Hosted service verification after PR #67 returned HTTP 200 and available data
for positions (42 trains in the sampled response), route status (8 routes), and
Kimball arrivals. Markers use live coordinates, suppress malformed/scheduled
records and off-route fixes, and disappear on stale or unavailable responses.
Detailed disruption notices link to CTA; missing trains do not imply outages.

The canonical browser suite covers both placements, eight route paths, all
143 station controls, native station/search controls, portfolio links and
in-Atlas anchors. Controlled responses verify a single shared positions poll,
marker updates, reduced motion, stale/unavailable/empty fallback and retained
static routes. The original nine-view matrix and ride/Dispatch interaction
checks remain mandatory, with additional selected-camera and terminal edge
assertions. No dependency was added and no secret file was read or copied.

Local release validation: typecheck, service checks, production export, content
checks and Python rollback checks pass. The canonical browser suite passes all
nine viewports, both map placements and the full ride/Dispatch interaction
pass. Selected landmarks fit below measured chrome, and terminal SVG bounds
cover both screen edges at phone and short-laptop sizes. Production geometry
and the hosted-feed spot check are recorded in the interface PR after publish.
