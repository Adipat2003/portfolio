# Full city map and public food places

The map opens to the whole Chicago area, including the southern city beyond the
rail terminus. It can pan beyond the CTA envelope and zoom to restaurant streets.
`#map` opens directly to the map; the default Atlas still starts with the scenic
portfolio ride.

Street coverage uses OpenStreetMap raster tiles instead of the incomplete city
arterial extract. The renderer computes only the visible tile grid, including
space exposed by the SVG aspect ratio. It waits for camera motion to settle and
loads no tiles while the map is off screen. Browser HTTP caching and referrers
are preserved, and visible OpenStreetMap attribution stays outside panels.
`NEXT_PUBLIC_MAP_TILE_URL` can replace the public tile URL template.

The [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) permits
normal interactive viewing and forbids bulk downloads, prefetch and headless
pan/zoom scans. The canonical browser suite intercepts every tile request with a
local fixture. Actual tiles are checked separately in a native browser during
normal viewing. There is no offline map download or tile archive. If tiles fail,
the local City of Chicago vector reference and CTA network remain available.
Raster tile corners are projected into the existing CTA local coordinate system;
small within-tile Mercator curvature is not used for navigation or precision
measurement.

`content/public-places.json` is the sole source for food records in Dispatch,
Atlas and the rollback renderer. The food layer does not modify the empty
personal Beli history or private Chicago Masterlist.

- [Beli × Resy top-rated Chicago](https://blog.resy.com/2026/10/beli-restaurants-chicago/): the first five entries in the public list of Resy restaurants, published October 30, 2026. This is not a Beli weekly ranking or a ranking of every Chicago restaurant.
- [OpenTable Chicago weekly most-booked](https://www.opentable.com/metro/chicago-restaurants?lang=en-us): the five entries displayed in its weekly most-booked section when checked October 30, 2026. It is a dated snapshot; there is no claim of a live popularity feed or automatic refresh.

Each place carries its restaurant information link and source collection. Street
addresses were checked against restaurant or booking pages and geocoded with the
public US Census Geocoder. Coordinates are approximate street-address positions,
not entrances. The exact geocoder request is preserved per record. Bavette’s
includes its official temporary-closure notice, checked with the snapshot.
Rankings, notices and addresses must be rechecked before changing the checked
date. Do not relabel an old snapshot as current without revisiting its source.

Nearby food places cluster into numbered markers as the map zooms out. Selecting
a cluster zooms closer; the food button and search provide access to every record
without relying on small map marks. The two collections have independent layer
toggles and separate source labels. Restaurant details show rank, address, date,
source and available notices. Personal ratings are never implied.
