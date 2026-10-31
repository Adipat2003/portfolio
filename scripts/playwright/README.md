# Browser Smoke Checks

This directory contains a reusable Playwright smoke check for the portfolio. It
does not add Playwright to the app's dependencies. It obtains a pinned Playwright
CLI through `npm exec` and expects the site to be running locally.

Start the site in one terminal:

```sh
npm run dev
```

Install Chromium once for the pinned Playwright version:

```sh
npm exec --yes --package=playwright@1.64.1 -- playwright install chromium
```

Run the checks in another terminal:

```sh
npm exec --yes --package=playwright@1.64.1 -- node scripts/playwright/smoke.mjs
```

The default URL is `http://localhost:3000/portfolio/`. Override it when the
development server uses another port:

```sh
BASE_URL=http://localhost:3001/portfolio/ npm exec --yes --package=playwright@1.64.1 -- node scripts/playwright/smoke.mjs
```

The script checks keyboard focus visibility, the no-JavaScript Dispatch view,
reduced-motion behavior, Atlas deep-link and facade state, all nine ride-stage
geometries from `AGENTS.md`, station and stop jumps, keyboard landmark
selection/release, the terminal's sourced answer, Skip the ride, Dispatch
search and tag filters, project details and return navigation, phone trip-strip
touch scrolling, horizontal overflow, and uncaught browser errors. It prints
the measured matrix as JSON for use in a PR body. Keep the viewport list and
assertions aligned with the invariants in the repository's `AGENTS.md`.
To save viewport JPEGs for visual review, set `SCREENSHOT_DIR=.preview-browser`
before the same command. Captures use CDP viewport screenshots and include
Dispatch, the nine Atlas sizes, and terminal views at desktop, short laptop,
and phone sizes. Use a configured `NEXT_PUBLIC_SERVICE_URL` at build time to
exercise the CTA board: selection waits for live, empty, or unavailable data,
and controlled responses verify loading, scheduled/delayed, empty and failure
states without depending on current train service.

After a site merge, run the production spot check with cache disabled:

```sh
BASE_URL=https://adipat2003.github.io/portfolio/ SPOT_CHECK=1 npm exec --yes --package=playwright@1.64.1 -- node scripts/playwright/smoke.mjs
```

This uses the same geometry assertions at 1920x1080, 1280x600, and 390x844.

The suite verifies scenic-first ordering and a full-screen CTA ending with eight
routes and 143 stations. It checks station words are hidden until selection,
route filtering, search, on-demand panels, 44 px controls, Escape/focus return,
read-only official alerts and sourced transit-guide fixtures. Map geometry is
checked at desktop, short-laptop, tablet, phone and 320x740 widths. The positions
fixtures verify one poll, real-fix movement, reduced motion and honest fallback.
Skyline checks assert fixed-width focus strokes, no selection shadow, windows
inside the authored silhouettes, and camera coverage at both screen edges.
Desktop and phone captures also cover Dispatch sections and project details.

To run only the map checks during development, set `NETWORK_ONLY=1` with the
same command. Full validation still requires the unfiltered suite.

The geographic-map checks also verify bundled water, park and street layers,
interruptible camera movement, immediate keyboard and reduced-motion camera
changes, and the absence of extra position polls during navigation.

Street tile requests are always intercepted with local fixtures in automated
checks, including production checks. Do not remove this interception to capture
real tiles with headless pan/zoom runs. The OSM tile policy prohibits those scans.
Review actual street coverage through a native browser during normal viewing.
`#map` is the direct map entry. Public food source labels, clusters, selection,
layer toggles and tile-failure fallback are checked alongside the CTA flows.
