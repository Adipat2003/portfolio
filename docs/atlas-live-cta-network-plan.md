# Atlas Live CTA Network Plan

Status: Phase 0 implemented on the working branch, 2026-10-27 (issue #64). Local validation is recorded in `docs/project-state.md`; production verification follows deployment. Phases 1 through 5 remain planned. The existing skyline Atlas remains in place.

## Goal

Replace the Atlas's landmark-first map as its primary navigation surface with a real, geographically grounded CTA 'L' network map. Use server-proxied Train Tracker data to show trains moving on their actual routes, and provide useful arrivals and service context when someone selects a station. Place the map at both the start and end of the Atlas so visitors can enter or revisit the live network without riding the full page.

The Dispatch remains the primary portfolio surface. The Atlas must continue to contain no project or professional facts absent from Dispatch. Live CTA data is enhancement-only and must fail closed to a useful static network map.

## Current State

- Dispatch has been redesigned with a compact one-row facade header, searchable two-column project cards, route-line accents, project-owned figures, and a horizontal tag filter.
- Atlas still uses the authored landmark skyline and animated scroll ride.
- Atlas impact-number mosaics and the separate figure stops have been removed. Project figures now appear in their owning station card with their label, qualifier, and source.
- The trip strip has eight project/terminal stops, a concise phone counter, 44 px phone hit targets, and a touch-scroll test.
- The Node service has a CTA proxy at `/transit?station=<allowlisted-id>`. It supports Clark/Lake, State/Lake, Washington/Wells, and Quincy/Wells, caches per station, and keeps the CTA key server-side.
- The terminal board can select those four stations and presents route, destination/direction, ETA, and CTA prediction flags.
- Local keys are in `~/.config/portfolio/secrets.env`; the wrapper loads them for local scripts and passes CTA/NVIDIA keys only to the Node service. The CTA key is configured locally. NVIDIA remains unused. Do not read, print, commit, or copy that file.
- The official CTA GTFS package was downloaded to `/tmp/cta-google-transit.zip` for research. It contains `routes.txt`, `trips.txt`, `shapes.txt`, and stop tables. Do not commit the archive.

## Phase 0 checklist (original findings, resolved locally)

1. Fix CTA ETA normalization. A live local `/transit` response returned four trains, but every ETA was `0` and all status flags were false. The current proxy derives minutes from `prdt` relative to the response clock. CTA's documentation says to compare `arrT` with `prdt`; compute remaining minutes from those fields and handle `isApp`, `isDly`, and `isSch` as documented.
2. Fix and rerun the Playwright CTA station-selection check. It currently times out after the local key became available. The test must wait for the selected station response and accept either live arrivals or the honest empty/unavailable state, rather than assuming only one state.
3. Run `npm run check:service`, `npm run typecheck`, `npm run build`, and the documented Playwright suite after those fixes.
4. Capture and inspect the terminal board with real local CTA data at desktop and phone sizes. Check destination, direction, time, status, attribution, station switch, no-data state, reduced motion, keyboard use, and horizontal overflow.
5. The public Render `/transit` request returned HTTP 503 during one check. Before using it for the map or presenting it as live, verify Render health and the public endpoint after a cold start. Do not inspect or reveal the configured Render keys.
6. Update `docs/project-state.md` after the UI/API pass is validated, including the live-board behavior, local secrets wrapper, current API availability, and remaining production checks.

## Proposed Experience

### Placement

- Add a `CtaRailMap` section as the first content block inside `AtlasFacade`, before the current ride.
- Add the same component after the ride and before the lakefront footer.
- Use one component with `placement="start" | "end"` so both instances share behavior and visual language.
- Keep the existing ride only if it complements the actual network. The live rail map becomes the primary Atlas navigation; the skyline can be removed from the primary map or retained only as a secondary Chicago illustration after visual review.

### Map Content

- Draw actual CTA rail route geometry from the agency's current GTFS data, not a screenshot or a copied official map graphic.
- Include the eight rail services: Red, Blue, Brown, Green, Orange, Purple, Pink, and Yellow. Exclude bus routes.
- Include station points, station names, transfer relationships, and each project's station association from the existing content model.
- Use CTA line identities consistently, with a visible legend and readable station labels. At narrow widths, show route and station detail progressively rather than shrinking all labels to illegibility.
- Show a train marker only when the live API supplies an in-service position. Do not fabricate movement from arrival ETAs alone.
- Animate marker movement between successive live positions with a short, interruptible transition. Respect `prefers-reduced-motion`; in reduced-motion mode, update positions discretely without interpolation.
- Selecting a station opens its arrival board. Selecting a project station also opens the related portfolio project card. Route filters and station selection must remain usable with keyboard, touch, and screen readers.

### Data Flow

```text
CTA GTFS ZIP
  -> build-time converter
  -> content/cta-network.json
  -> static geographic routes, stations, stop IDs and shape references

CTA Train Tracker API
  -> Node service using Render/local server-side CTA_API_KEY
  -> cached, normalized /transit and /positions responses
  -> Atlas map and station arrival board
```

The browser must never call CTA directly or receive the API key. Both Atlas map placements use the same local proxy and server cache. Add in-flight request coalescing so the start/end instances do not issue duplicate upstream requests on a cold cache.

## Implementation Phases

### Phase 0: Close the Current UI and Proxy Pass

- Correct CTA ETA calculation using `arrT` and `prdt`; preserve source flags and distinguish predictions from scheduled arrivals.
- Stabilize the Playwright station selector for live, empty, unavailable, and loading responses.
- Verify local secret loading without reading or echoing the file.
- Pass typecheck, service checks, production build, and the existing nine-viewport/interactions suite.

### Phase 1: Generate Diffable GTFS Network Data

- Add a repeatable converter under `scripts/` that reads the official CTA ZIP and emits a deliberately small `content/cta-network.json`.
- Read `routes.txt`, `trips.txt`, `shapes.txt`, `stops.txt`, and `stop_times.txt` with a CSV parser.
- Select representative shape IDs for each rail route and direction, retaining real branch geometry. Do not include every trip-specific duplicate.
- Convert longitude/latitude to a Chicago-local projected coordinate system, simplify long polylines to a documented point tolerance, and preserve station-to-shape relationships.
- Validate that all eight routes have geometry, all referenced stops exist, and line identifiers match the proxy and legend.
- Record GTFS source URL, retrieval date, package version/update date, simplification method, and attribution in the generated file metadata.
- Add a check mode that regenerates to a temporary file and confirms deterministic output. Never commit the 66 MB source ZIP.

### Phase 2: Complete the Server-Side Live Feed

- Add a `/positions` route to the Node service using the documented CTA Train Tracker Locations API, requesting the eight rail route IDs in one bounded request.
- Normalize only the required fields: route, coordinates, heading, next station, arrival time, delayed/approaching flags, and schedule-backed status.
- Omit trains without live coordinates. A schedule-only record must not become an animated train marker.
- Cache positions on the service for a short TTL appropriate to the feed and coalesce concurrent requests. Keep separate caches for positions, station arrivals, and alerts.
- Keep the existing four-station arrivals selector. The CTA documentation allows up to four map IDs for Arrivals, but only combine IDs in one request after confirming the exact encoding against the official API. Otherwise keep one selected-station request with the existing server cache.
- Add Customer Alerts only after confirming the current alert response schema from CTA documentation. Use alerts to annotate affected routes and to explain when CTA says prediction quality is affected. Do not infer outages from missing arrivals alone.
- Preserve the API's honest degraded response, CTA attribution, origin allowlist, and rate limits. Add validation for unsupported route/station IDs.

### Phase 3: Build the Actual Network Map

- Create `src/components/atlas/CtaRailMap.tsx` using SVG paths from `content/cta-network.json` and live positions from `/positions`.
- Draw route paths, station marks, transfer points, selected route state, labels, and source/status legend.
- Map live longitude/latitude to the static SVG projection using the same conversion used for GTFS geometry. Clamp out-of-bounds data and suppress invalid coordinates.
- Use route-colored markers with a shape or text cue in addition to color. Include a textual list/board as an equivalent to the graphic.
- Provide route filters and station selection as familiar controls. Keep the four arrivals locations available from the UI; do not make a visitor infer which station IDs exist.
- Add tasteful motion only for trains whose live positions have changed. Do not add perpetual pulses or pointer effects that obscure map information.
- Add reduced-motion support, visible focus, 44 px touch targets, responsive label density, and no-horizontal-overflow checks.

### Phase 4: Integrate at Both Ends of Atlas

- Render `CtaRailMap placement="start"` before the current Atlas ride.
- Render `CtaRailMap placement="end"` after the ride and before the lakefront footer.
- Decide whether the skyline remains as a secondary section. Do not duplicate project facts; every project station continues to link to the same project record.
- Ensure both maps use shared route data and shared service behavior, and ensure the ride can still be skipped.

### Phase 5: Validate and Ship

- Add service tests for no key, upstream error, empty arrivals, scheduled arrivals, live positions, malformed coordinates, alert quality flags, cache TTL, and concurrent cold requests.
- Add browser tests for route filters, station selection, a project station, moving marker update, API-unavailable fallback, keyboard, touch, reduced motion, and the static/no-JavaScript page.
- Run the nine-viewport matrix from `AGENTS.md` and record results in the PR body.
- Visually inspect both map placements at desktop, short laptop, tablet, and phone sizes.
- Verify the production Pages site after merge. Do not deploy CTA-dependent UI until the hosted Render service responds successfully and the CTA payload is verified.

## Acceptance Criteria

- The map topology matches CTA GTFS routes, branches, stops, and transfer locations within the documented simplification tolerance.
- Live markers are based only on valid live Train Tracker coordinates and remain on their correct route.
- Arrivals show station, route, destination, direction/platform description, ETA, data freshness, and scheduled/delayed/approaching status when supplied by CTA.
- A stale, unavailable, or empty feed never creates fake movement or an endless loading state. The static route network remains useful.
- The same map appears at the start and end of Atlas and behaves consistently at all supported sizes.
- The Dispatch remains the canonical readable source for every project claim and metric.
- No CTA key, NVIDIA key, or other secret appears in generated client code, JSON responses, logs, screenshots, Git history, or the plan document.
- No new package is added without explicit approval.
