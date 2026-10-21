# Artwork

Authored SVG landmarks. Hand-placed path data, no generated imagery.

Each file names its real source building in a comment. At silhouette scale,
recognizable massing matters more than detail:

- Willis Tower: bundled setback tubes, twin antennas
- Hancock Center: tapered body with visible cross-bracing
- Marina City: paired cylindrical corncob towers
- Wrigley / Tribune: clock-tower crowns and buttressed crowns

Standalone files exist so each landmark can be opened and edited alone. The
concept page inlines the same geometry so it stays self-contained.

## Source of truth

Landmark, route, station, river, and window-light geometry lives in
`content/atlas.json`, one entry per building with its source building and
identifying feature named. `scripts/build.py` renders it into the Atlas facade,
so the skyline is diffable source rather than inline markup, and the same data
can flatten into the accessible text view.

The early composition probe (`skyline-partial-heightmap.svg`, generic blocks, no
named landmarks) was removed and is not part of the repository.
