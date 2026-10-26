# Repository instructions

Personal portfolio site for Aditya Patel. Two facades over one content model:
Facade 1 (The Dispatch, classic scroll, default) and Facade 2 (The Atlas, the
explorable Chicago world, enhancement only).

These instructions are for AI agents and humans working in this repository.
Global machine-wide defaults in `~/.codex/AGENTS.md` apply wherever this file is
silent.

## Hard rules

- **Portfolio first.** The Dispatch is the primary surface. The Atlas never holds
  information the Dispatch does not. If a fact only exists in the world view, it
  is a bug.
- **Content safety.** No employer-internal app, repository, team, or issue names
  in any public-facing file. Figure every claim from its source document and
  keep its hedging: a projection is labeled a projection, a self-reported number
  is labeled self-reported. Nothing gets upgraded in the copy.
- **One content model, two renderers.** Project records live in data (Markdown
  or typed records), not hand-written twice into two facades.
- **No em dashes** in new user-facing strings, labels, comments, docs, or
  messages. Colons, semicolons, parentheses, or separate sentences instead.
- **No dependency additions or upgrades** without Aditya's explicit approval.
- **No secrets.** API keys live server-side only. Nothing secret-bearing enters
  a commit, a preview, or a response body.
- **Authorship.** Aditya Patel is the author of record. A `Co-authored-by`
  trailer is the only place an AI is credited.

## Artwork

- Landmarks are authored SVG, one building per file, with the source building
  named in a comment. Generated imagery and stock imagery are not used.
- Routes and stations render from data, so the map stays diffable source.
- Route and station labels carry a dark halo (`paint-order:stroke`); essential
  text never lives only inside artwork.

## Verification before done

- DOM checks are not enough. Open the render and look at it: facade switch,
  labels, contrast, proportions, mobile width.
- Full-page `capture_screenshot()` can wedge the CDP daemon. Use a viewport-only
  `cdp('Page.captureScreenshot', format='jpeg', quality=88)` capture instead and
  create the destination directory first.
- Check accessibility paths: keyboard, visible focus, reduced motion, and the
  no-JavaScript static view.
- GitHub Pages is the production renderer for this repo. `main` root is the
  Pages source. Verify the live URL after any push that changes the site.

## The aspect-ratio matrix and the interaction pass

A change that looks perfect at one viewport has shipped broken at another
twice now (a magic 64px offset hid the stop strip behind the two-row phone
header; a min-height:100% collapsed the desktop Atlas into a blank stage that
DOM-only checks still passed). Both were caught only by actually rendering
and interacting at other sizes. This section is therefore mandatory, not
optional, and it belongs to every PR that touches the ride, the layout, the
CSS, the map, or the facade switch.

**Step 1. The nine-viewport matrix, after every such change.** Load the
Atlas in a real browser and, at each viewport below, scroll to mid-ride
and assert all five invariants:

| Viewport | Class |
|---|---|
| 1920x1080 | desktop |
| 1440x900 | laptop |
| 1366x768 | small laptop |
| 1280x800 | laptop |
| 1024x768 | squarish |
| 1280x600 | SHORT laptop, the class most likely to expose height bugs |
| 820x1180 | tablet portrait |
| 768x1024 | tablet landscape-ish |
| 390x844 | phone |

The five invariants, asserted with real geometry (`getBoundingClientRect`),
never with existence checks:

1. Stage height equals the viewport height, and stage top is 0: the sticky
   stage is actually sticky (this is the assertion that catches the blank
   stage class of bug).
2. The city is on screen mid-ride: map top < viewport, map bottom > 0,
   width > 100.
3. The stop strip clears the measured header: strip top >= header bottom.
   Never assume the header's height; read it.
4. The overlay card is visible.
5. No horizontal overflow: `documentElement.scrollWidth <= clientWidth`.

**Step 2. The interaction pass, once per change.** Drive the real site,
do not just look at it, in this order: load `#atlas` (deep link), toggle
Dispatch then Atlas (both titles update), click a station on the map
(camera glides, card shows that project), click a stop pill in the strip
(jump is instant, strip counter matches), click a landmark (camera glides,
selected edge appears, card describes it, Escape or scroll releases it),
open the terminal phase (ask box answers a chip question), and run Skip
the ride. Then the Dispatch: filter the projects by tag and text, ask the
guide a question, open one project detail page and follow its link back.
On the phone viewport also ride two full phases with actual scrolling and
confirm the trip strip scrolls horizontally with a touch drag.

**Step 3. Post-deploy spot check.** The Deploy site workflow publishes on
merge; within two minutes of any site-affecting merge, re-run step 1 at
1920x1080, 1280x600, and 390x844 against the live URL with cache
disabled, and confirm the five invariants hold on production, not only
on the local build.

Record the matrix and interaction results in the PR body. A PR in this
scope without the matrix numbers is incomplete.

## Workflow

- `main` is protected in spirit: no direct pushes of site changes. Branch, open
  a PR, verify the Pages preview logic locally, then merge.
- Small, scoped commits. Scan the staged diff for secrets before every commit.
- Track roadmap work as GitHub issues, one per deliverable.
