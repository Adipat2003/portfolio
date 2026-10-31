"""Build a compact geographic backdrop from City of Chicago open data, without dependencies."""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "water": ("knfe-65pw", {"$limit": 2000}),
    "parks": ("ejsh-fztr", {"$limit": 2000}),
    "streets": ("pr57-gg9e", {"$select": "the_geom,class,street_nam", "$where": "class in ('1','2','3')", "$limit": 20000}),
}
PROJECTION = json.loads((ROOT / "content/cta-network.json").read_text())["projection"]


def project(point):
    lon, lat = point
    origin = PROJECTION["origin"]
    factor = PROJECTION["radius"] / PROJECTION["metresPerUnit"]
    return [factor * math.radians(lon - origin[1]) * math.cos(math.radians(origin[0])), -factor * math.radians(lat - origin[0])]


def simplify(points, tolerance=.18):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    def distance(p):
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) if length else 0
        return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
    index = max(range(1, len(points) - 1), key=lambda i: distance(points[i]))
    if distance(points[index]) <= tolerance:
        return [a, b]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def path(points, closed=False):
    points = simplify([project(p) for p in points])
    if closed and len(points) < 4:
        return ""
    return "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in points) + ("Z" if closed else "")


def build(cache):
    result = {"metadata": {"attribution": "Geographic context: City of Chicago Data Portal. Rail routes: CTA GTFS. No endorsement.", "projection": PROJECTION, "sources": []}, "water": [], "parks": [], "streets": []}
    for layer, (dataset, query) in SOURCES.items():
        raw = (cache / f"{layer}.geojson").read_bytes()
        data = json.loads(raw)
        assert data.get("type") == "FeatureCollection" and data["features"], f"Missing {layer} features"
        assert len(data["features"]) < query["$limit"], f"Paginate {layer} before exporting"
        result["metadata"]["sources"].append({"layer": layer, "url": f"https://data.cityofchicago.org/d/{dataset}", "sha256": hashlib.sha256(raw).hexdigest(), "features": len(data["features"])})
        road_groups = {}
        for feature in data["features"]:
            geometry, props = feature["geometry"], feature["properties"]
            assert geometry, f"Missing geometry in {layer}"
            if layer == "streets":
                assert geometry["type"] == "MultiLineString"
                road_groups.setdefault(props["class"], []).extend(path(line) for line in geometry["coordinates"])
            else:
                assert geometry["type"] == "MultiPolygon"
                # Keep meaningful parks; pocket parcels disappear at this scale.
                if layer == "parks" and float(props.get("acres") or 0) < 4:
                    continue
                shape = "".join(path(ring, True) for polygon in geometry["coordinates"] for ring in polygon)
                if shape:
                    result[layer].append({"name": props.get("name") or props.get("park") or "", "path": shape})
        if layer == "streets":
            result[layer] = [{"class": key, "path": "".join(road_groups[key])} for key in sorted(road_groups)]
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".preview-geography")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--retrieved", default=datetime.date.today().isoformat())
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        for layer, (dataset, query) in SOURCES.items():
            url = f"https://data.cityofchicago.org/resource/{dataset}.geojson?" + urllib.parse.urlencode(query)
            (args.cache / f"{layer}.geojson").write_bytes(urllib.request.urlopen(url, timeout=45).read())
    output = build(args.cache)
    output["metadata"]["retrievedOn"] = args.retrieved
    (ROOT / "content/chicago-basemap.json").write_text(json.dumps(output, indent=2) + "\n")
    print("Basemap:", {layer: len(output[layer]) for layer in SOURCES})
