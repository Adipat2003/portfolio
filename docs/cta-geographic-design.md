# CTA geographic map

The read-only network remains the full-screen ending of the scenic Atlas ride.
Its visual emphasis is Chicago's actual geography: a dark street fabric, quiet
park parcels and an actual water outline beneath brighter rail routes. Station
names still appear only on selection. Controls retain the portfolio's blue and
gold identity and their existing keyboard and phone layouts.

The backdrop uses three City of Chicago Data Portal layers:

- [Hydro](https://data.cityofchicago.org/d/knfe-65pw): Lake Michigan, rivers and other waterways.
- [CPD Parks](https://data.cityofchicago.org/d/ejsh-fztr): November 2016 park boundaries, limited to parcels of at least four acres.
- [Street center lines](https://data.cityofchicago.org/d/pr57-gg9e): August 2016 reference data, classes 1, 2 and 3.

These are static geographic references, not current navigation or closure data.
Official live arrivals and disruptions continue to come from CTA. The source
links and snapshot limitation are available in the map's information panel.
Retrieval date, source feature counts, SHA-256 hashes and the shared CTA
projection are recorded in `content/chicago-basemap.json`.

Regenerate with the Python standard library:

```sh
python3 scripts/build-cta-basemap.py --fetch --retrieved YYYY-MM-DD
node scripts/basemap-check.mjs
```

The exporter simplifies projected lines with an 18 m tolerance and records SVG
paths in diffable JSON. The local bundle is capped at 600 KB before compression.
The renderer requests no external map tiles and adds no packages or API keys.
Atlas loads as a separate React chunk when opened, so the default Dispatch does
not download the geographic backdrop. A text status appears during that load.
City street coverage ends at its dataset boundary; missing suburban streets are
not fabricated. The backdrop is decorative and excluded from the accessibility
tree; search, arrivals and the textual train list retain equivalent information.

Motion connects an action to its result. Pointer camera changes ease to their
new extent in 280 ms and can be interrupted by another action or a drag. Keyboard
and reduced-motion camera changes are immediate. A single network reveal runs
on entry, with a quiet complete route underneath so trains never float over
missing track. Selecting a line reveals that line; details enter from the side
on desktop or below on phones. Both reveals and panel motion respect reduced
motion. Train sprites face CTA's reported bearing and interpolate only between
reported fixes, preserving the existing stale-data and route-snapping rules.

Design references: [Transit's map and progressive disclosure](https://help.transitapp.com/article/93-how-to-use-transit)
and the installed Emil design-engineering principles for interruptible movement,
brief feedback and quiet controls. Components are authored in React and SVG.
