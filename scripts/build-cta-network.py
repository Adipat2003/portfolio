"""Convert CTA's official GTFS ZIP to the Atlas network. Python standard library only."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile

SOURCE = "https://www.transitchicago.com/downloads/sch_data/google_transit.zip"
ORDER = ["Red", "Blue", "Brn", "G", "Org", "P", "Pink", "Y"]
ORIGIN = [41.9, -87.7]
RADIUS = 6371000
UNIT = 100
TOLERANCE = 25


def project(lat, lon):
    return [RADIUS * math.radians(lon - ORIGIN[1]) * math.cos(math.radians(ORIGIN[0])) / UNIT,
            -RADIUS * math.radians(lat - ORIGIN[0]) / UNIT]


def simplify(points):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    def distance(p):
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) if length else 0
        return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
    index = max(range(1, len(points) - 1), key=lambda i: distance(points[i]))
    if distance(points[index]) <= TOLERANCE / UNIT:
        return [a, b]
    return simplify(points[:index + 1])[:-1] + simplify(points[index:])


def convert(archive, retrieved):
    with zipfile.ZipFile(archive) as z:
        def rows(name):
            with z.open(name) as f:
                yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        routes = {r["route_id"]: r for r in rows("routes.txt") if r["route_type"] == "1"}
        assert set(routes) == set(ORDER), "Expected exactly eight CTA rail services"
        trips = {r["trip_id"]: r for r in rows("trips.txt") if r["route_id"] in routes}
        shapes = {r["shape_id"]: [] for r in trips.values()}
        for r in rows("shapes.txt"):
            if r["shape_id"] in shapes:
                shapes[r["shape_id"]].append((int(r["shape_pt_sequence"]), project(float(r["shape_pt_lat"]), float(r["shape_pt_lon"]))))
        stops = {r["stop_id"]: r for r in rows("stops.txt")}
        station_routes, station_shapes, platforms = {}, {}, {}
        for r in rows("stop_times.txt"):
            trip = trips.get(r["trip_id"])
            if not trip:
                continue
            assert r["stop_id"] in stops
            stop = stops[r["stop_id"]]
            parent = stop["parent_station"] or stop["stop_id"]
            assert parent in stops and stops[parent]["location_type"] == "1"
            station_routes.setdefault(parent, set()).add(trip["route_id"].lower())
            station_shapes.setdefault(parent, set()).add(trip["shape_id"])
            platforms.setdefault(parent, set()).add(stop["stop_id"])
        transfers = {sid: set() for sid in station_routes}
        for r in rows("transfers.txt"):
            a, b = (stops.get(r[k]) for k in ("from_stop_id", "to_stop_id"))
            if not a or not b:
                continue
            a, b = a["parent_station"] or a["stop_id"], b["parent_station"] or b["stop_id"]
            if a != b and a in transfers and b in transfers:
                transfers[a].add(b)
                transfers[b].add(a)
        output_routes = []
        aliases = {}
        for rid in ORDER:
            raw = routes[rid]
            route_shapes = []
            seen = {}
            for shape_id in sorted({t["shape_id"] for t in trips.values() if t["route_id"] == rid}):
                points = [p for _, p in sorted(shapes[shape_id])]
                assert len(points) >= 2
                points = [[round(x, 2), round(y, 2)] for x, y in simplify(points)]
                key = min(json.dumps(points), json.dumps(points[::-1]))
                directions = sorted({t["direction_id"] for t in trips.values() if t["shape_id"] == shape_id})
                if key in seen:
                    aliases[shape_id] = seen[key]["id"]
                    seen[key]["directions"] = sorted(set(seen[key]["directions"] + directions))
                    continue
                entry = {"id": shape_id, "directions": directions, "points": points}
                seen[key] = entry
                aliases[shape_id] = shape_id
                route_shapes.append(entry)
            output_routes.append({"id": rid.lower(), "name": raw["route_long_name"].replace(" Line", ""),
                                  "color": "#" + raw["route_color"], "textColor": "#" + raw["route_text_color"], "shapes": route_shapes})
        stations = []
        for sid in sorted(station_routes):
            r = stops[sid]
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
            stations.append({"id": sid, "name": r["stop_name"], "lat": lat, "lon": lon,
                             "point": [round(v, 2) for v in project(lat, lon)],
                             "routes": sorted(station_routes[sid]), "platforms": sorted(platforms[sid]),
                             "shapes": sorted({aliases[s] for s in station_shapes[sid]}), "transfers": sorted(transfers[sid])})
        points = [p for r in output_routes for s in r["shapes"] for p in s["points"]]
        xmin, ymin = [math.floor(min(p[i] for p in points) - 18) for i in (0, 1)]
        xmax, ymax = [math.ceil(max(p[i] for p in points) + 18) for i in (0, 1)]
        calendars = [c for c in rows("calendar.txt") if c["service_id"] in {t["service_id"] for t in trips.values()}]
        result = {"metadata": {"source": SOURCE, "retrievedOn": retrieved,
                  "packageUpdated": "%04d-%02d-%02d" % z.getinfo("routes.txt").date_time[:3],
                  "sha256": hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
                  "serviceDates": [min(c["start_date"] for c in calendars), max(c["end_date"] for c in calendars)],
                  "attribution": "Route geometry and stations: Chicago Transit Authority GTFS. No CTA endorsement.",
                  "simplification": "Ramer-Douglas-Peucker, maximum 25 metres; reverse-identical shapes deduplicated; all branch patterns retained."},
                  "projection": {"origin": ORIGIN, "radius": RADIUS, "metresPerUnit": UNIT},
                  "viewBox": [xmin, ymin, xmax - xmin, ymax - ymin], "routes": output_routes, "stations": stations}
        assert all(r["shapes"] for r in output_routes)
        ids = {s["id"] for s in stations}
        assert all(set(s["transfers"]) <= ids for s in stations)
        return json.dumps(result, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--retrieved-on", required=True, help="YYYY-MM-DD, recorded retrieval date")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = Path(__file__).resolve().parent.parent / "content/cta-network.json"
    data = convert(args.archive, args.retrieved_on)
    if args.check:
        assert data == convert(args.archive, args.retrieved_on), "Nondeterministic converter"
        assert output.read_text() == data, "Generated CTA network is stale"
        print("CTA network: deterministic and current")
    else:
        output.write_text(data)
        print(f"Wrote {output.name}: {len(data)} bytes")
