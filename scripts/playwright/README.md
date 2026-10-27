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

The suite also verifies both CTA map placements, all eight routes and 143
stations, route filtering, station/search controls, editorial project links,
44 px controls, in-Atlas anchors, shared polling, real-fix marker updates and
stale/empty/unavailable fallbacks. To run only those checks during map work,
use `NETWORK_ONLY=1` with the same command. Full validation still requires the
unfiltered suite. Skyline checks additionally assert that selected/terminal
camera bounds cover both screen edges and that scrolling releases a landmark.
