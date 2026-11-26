#!/usr/bin/env python3
"""Export an editable gen-map preset B scene to the Atlas vertex format.

Run with the gen-map ZIP path. Geometry uses OpenStreetMap data © OpenStreetMap
contributors (https://www.openstreetmap.org/copyright). The output is a rendered
mesh with material codes, without source database tags or feature IDs.
"""

import argparse
from collections import Counter
from itertools import islice
import gzip
import json
import math
from pathlib import Path
import struct
import zipfile


BOUNDS = (-1380, 1460, -1470, 1580)  # West, east, north, south in local metres.
GROUND = -6
WATER = -5
TRIANGLE_BUDGET = 38_000
STREET_TRIANGLE_BUDGET = 3_000
EXCLUDED_BUILDINGS = {
    # Willis Tower and Marina City use their authored geometry.
    137162289, 137162290, 137162293, 137162295, 137162296, 137162297,
    137162298, 137162299, 233918141, 233918220, 1178226299, 1178243970,
    1178243971, 1178243972, 1178243973, 284822924, 284822930, 284822932,
    1177923717, 1177923718, 1177923719,
}
# Closed underside clearances in feet, from USCG 2024 Light List V, p. 35.
# https://www.navcen.uscg.gov/sites/default/files/pdf/lightLists/LightList_V5_2024.pdf
CLEARANCE_FEET = {
    230973582: 19.1, 746755321: 20.5, 230973583: 18.8, 79654774: 18.9,
    750296166: 20.7, 79660682: 17.3, 79660977: 22.8, 746733964: 22.6,
    747168481: 18.9, 190820979: 18.6, 747171902: 18.6, 747184020: 19.7,
    747184046: 22.4, 747184063: 21.4, 747184066: 21.4,
    748858713: 18.1, 748858714: 18.1,
}
VERTEX = struct.Struct("<8f")
TRIANGLE_SIZE = VERTEX.size * 3
INDEX_TYPES = {5121: "B", 5123: "H", 5125: "I"}
ROOF, GLASS, STONE, DARK_GLASS, RIVER, FOLIAGE, _, BRIDGE, LAND, PAVING = range(10)


def read_glb(source):
    magic, version, _, length, label = struct.unpack("<4sIII4s", source.read(20))
    if (magic, version, label) != (b"glTF", 2, b"JSON"):
        raise ValueError("Expected a gen-map glTF 2.0 binary")
    metadata = json.loads(source.read(length))
    length, label = struct.unpack("<I4s", source.read(8))
    binary = source.read(length)
    if label != b"BIN\x00" or len(binary) != length:
        raise ValueError("Invalid glTF binary data")
    return metadata, memoryview(binary)


def accessor(metadata, binary, index):
    info = metadata["accessors"][index]
    view = metadata["bufferViews"][info["bufferView"]]
    offset = view.get("byteOffset", 0) + info.get("byteOffset", 0)
    fmt = "<3f" if info["type"] == "VEC3" else "<" + INDEX_TYPES[info["componentType"]]
    size = struct.calcsize(fmt)
    if view.get("byteStride", size) != size:
        raise ValueError("Interleaved glTF accessor")
    return list(struct.iter_unpack(fmt, binary[offset:offset + size * info["count"]]))


def triangles(metadata, binary, primitive):
    if primitive.get("mode", 4) != 4:
        return
    positions = accessor(metadata, binary, primitive["attributes"]["POSITION"])
    indices = iter(accessor(metadata, binary, primitive["indices"]))
    while triplet := tuple(islice(indices, 3)):
        yield tuple(positions[i] for i, in triplet)


def position_bounds(metadata, primitives):
    positions = [metadata["accessors"][p["attributes"]["POSITION"]] for p in primitives]
    low = tuple(min(item["min"][i] for item in positions) for i in range(3))
    high = tuple(max(item["max"][i] for item in positions) for i in range(3))
    return low, high


def center_in_bounds(low, high):
    west, east, north, south = BOUNDS
    return west < (low[0] + high[0]) / 2 < east and north < (low[2] + high[2]) / 2 < south


def normal(a, b, c):
    ab = tuple(b[i] - a[i] for i in range(3))
    ac = tuple(c[i] - a[i] for i in range(3))
    cross = (ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
             ab[0] * ac[1] - ab[1] * ac[0])
    length = math.hypot(*cross)
    return tuple(component / length for component in cross) if length > 0.0001 else None


def encode_triangle(result, face, material, seed, up=False):
    direction = normal(*face)
    if direction is None:
        return
    if up and direction[1] < 0:
        direction = tuple(-component for component in direction)
        face = (face[0], face[2], face[1])
    for vertex in face:
        result.extend(VERTEX.pack(*vertex, *direction, material, seed))


def clip(points):
    west, east, north, south = BOUNDS
    for axis, bound, sign in ((0, west, 1), (0, east, -1), (2, north, 1), (2, south, -1)):
        output = []
        if not points:
            break
        previous = points[-1]
        for point in points:
            inside = sign * (point[axis] - bound) >= 0
            previous_inside = sign * (previous[axis] - bound) >= 0
            if inside != previous_inside:
                ratio = (bound - previous[axis]) / (point[axis] - previous[axis])
                output.append(tuple(a + ratio * (b - a) for a, b in zip(previous, point)))
            if inside:
                output.append(point)
            previous = point
        points = output
    for i in range(1, len(points) - 1):
        yield points[0], points[i], points[i + 1]


def draw_plane(result, low, high, height, material, seed=0):
    x1, z1 = low
    x2, z2 = high
    a, b, c, d = (x1, height, z1), (x1, height, z2), (x2, height, z2), (x2, height, z1)
    encode_triangle(result, (a, b, c), material, seed)
    encode_triangle(result, (a, c, d), material, seed)


def render_water(result, faces):
    edges = {}
    for face in faces:
        ground_face = tuple((round(x, 2), WATER, round(z, 2)) for x, _, z in face)
        for a, b, c in clip(ground_face):
            if (direction := normal(a, b, c)) is None:
                continue
            if direction[1] < 0:
                b, c = c, b
            encode_triangle(result, (a, b, c), RIVER, 0)
            for first, second in ((a, b), (b, c), (c, a)):
                key = tuple(sorted((tuple(round(v, 2) for v in first), tuple(round(v, 2) for v in second))))
                if key in edges:
                    edges.pop(key)
                else:
                    edges[key] = (first, second)
    for a, b in edges.values():
        length = math.hypot(b[0] - a[0], b[2] - a[2])
        if length < 0.8:
            continue
        west, east, north, south = BOUNDS
        if any(abs(a[axis] - boundary) < 0.015 and abs(b[axis] - boundary) < 0.015
               for axis, boundary in ((0, west), (0, east), (2, north), (2, south))):
            continue
        # A narrow, level coping strip follows the source bank on its land side.
        outside_x = -(b[2] - a[2]) / length * 2.4
        outside_z = (b[0] - a[0]) / length * 2.4
        outer_a = (a[0] + outside_x, -3.8, a[2] + outside_z)
        outer_b = (b[0] + outside_x, -3.8, b[2] + outside_z)
        encode_triangle(result, (a, b, outer_b), PAVING, 0, up=True)
        encode_triangle(result, (a, outer_b, outer_a), PAVING, 0, up=True)


def building_material(tags, osm_id):
    material = str(tags.get("building:material", "")).lower()
    color = str(tags.get("building:colour", "")).lower()
    if color in {"black", "#000000", "darkgray", "darkgrey"}:
        return DARK_GLASS
    if "glass" in material or color in {"blue", "lightblue", "darkblue"}:
        return GLASS
    if material or color or tags.get("building") in {"house", "retail", "church", "school"}:
        return STONE
    return (STONE, STONE, GLASS, DARK_GLASS)[osm_id % 4]


def tag_metres(value):
    try:
        return max(0, float(str(value).strip().removesuffix(" m")))
    except ValueError:
        return 0


def exterior_outline(points):
    ordered = sorted(set(points))

    def half(positions):
        outline = []
        for point in positions:
            while len(outline) >= 2:
                a, b = outline[-2:]
                if (b[0] - a[0]) * (point[1] - a[1]) > (b[1] - a[1]) * (point[0] - a[0]):
                    break
                outline.pop()
            outline.append(point)
        return outline[:-1]

    return half(ordered) + half(reversed(ordered)) if len(ordered) >= 3 else []


def compact_building(result, points, base, height, material, seed):
    # Shortcut: distant ordinary buildings retain their width, orientation, and
    # height. Concavities and roof structures use detailed geometry nearer the river.
    outline = exterior_outline((round(x, 1), round(z, 1)) for x, _, z in points)
    if len(outline) < 3:
        return
    lower = [(x, base, z) for x, z in outline]
    upper = [(x, base + height, z) for x, z in outline]
    for first in range(len(outline)):
        second = (first + 1) % len(outline)
        encode_triangle(result, (lower[first], upper[second], lower[second]), material, seed)
        encode_triangle(result, (lower[first], upper[first], upper[second]), material, seed)
    for i in range(1, len(outline) - 1):
        encode_triangle(result, (upper[0], upper[i], upper[i + 1]), ROOF, seed, up=True)


def building(mesh, metadata, binary, extras, low, high, compact):
    osm_id = extras["osm_id"]
    tags = extras.get("tags", {})
    material = building_material(tags, osm_id)
    seed = (osm_id % 7919) / 7919
    offset = tag_metres(tags.get("min_height"))
    if not offset and tags.get("building:min_level"):
        offset = 3.2 * tag_metres(tags["building:min_level"])
    base = low[1]
    part_height = high[1] - base
    if extras.get("height") and abs(extras["height"] - offset - part_height) <= 3:
        part_height = max(0.5, extras["height"] - offset)
    scale = part_height / max(0.5, high[1] - base)
    result = bytearray()
    if compact:
        for primitive in mesh:
            if "Roof" in metadata["materials"][primitive["material"]]["name"]:
                points = accessor(metadata, binary, primitive["attributes"]["POSITION"])
                compact_building(result, points, GROUND + offset, part_height, material, seed)
                if result:
                    return result
    for primitive in mesh:
        name = metadata["materials"][primitive["material"]]["name"]
        is_roof = "Roof" in name
        for face in triangles(metadata, binary, primitive):
            face = tuple((x, GROUND + offset + (y - base) * scale, z) for x, y, z in face)
            encode_triangle(result, face, ROOF if is_roof else material, seed, up=is_roof)
    return result


def render_tree(result, x, z, height, width, seed):
    top = (x, GROUND + height, z)
    bottom = (x, GROUND + height * 0.22, z)
    ring = [(x + ox * width, GROUND + height * 0.63, z + oz * width)
            for ox, oz in ((1, 0), (0, -1), (-1, 0), (0, 1))]
    for first, second in zip(ring, ring[1:] + ring[:1]):
        encode_triangle(result, (top, first, second), FOLIAGE, seed)
        encode_triangle(result, (bottom, second, first), FOLIAGE, seed)


def export(source, target):
    context, building_batches, street_batches, water_faces = bytearray(), [], [], []
    counts = Counter()
    west, east, north, south = BOUNDS
    draw_plane(context, (west, north), (east, south), GROUND, LAND)
    with zipfile.ZipFile(source) as archive:
        manifest = json.loads(archive.read("scene_manifest.json"))
        if manifest["crs"]["axis"] != "glTF y-up: x=east, y=up(z), z=-north":
            raise ValueError("Expected a metres-based gen-map scene with east/up/south axes")
        lat, lon = manifest["crs"]["origin_lat"], manifest["crs"]["origin_lon"]
        if abs(lat - 41.8848) > 0.00001 or abs(lon + 87.6325) > 0.00001:
            raise ValueError("Unexpected Chicago export origin")
        for name in sorted(archive.namelist()):
            if not name.startswith("Meshes_DCC/") or not name.endswith(".glb"):
                continue
            with archive.open(name) as glb:
                metadata, binary = read_glb(glb)
            for node in metadata["nodes"]:
                extras = node.get("extras", {})
                kind, osm_id = extras.get("type"), extras.get("osm_id")
                tags = extras.get("tags", {})
                is_water = kind == "water" and tags.get("waterway") in {"river", "canal"}
                is_bridge = kind == "road" and osm_id in CLEARANCE_FEET
                is_street = (kind == "road" and tags.get("highway") in {"primary", "secondary"}
                             and not tags.get("bridge") and not tags.get("tunnel"))
                is_tree = kind == "tree" and osm_id is not None and osm_id % 23 == 0
                if kind != "building" and not (is_water or is_bridge or is_street or is_tree):
                    continue
                mesh = metadata["meshes"][node["mesh"]]["primitives"]
                low, high = position_bounds(metadata, mesh)
                if not (is_water or center_in_bounds(low, high)):
                    continue
                if any(key in node for key in ("matrix", "translation", "rotation", "scale")):
                    raise ValueError("Unexpected node transform")
                x, z = (low[0] + high[0]) / 2, (low[2] + high[2]) / 2
                if kind == "building":
                    if osm_id in EXCLUDED_BUILDINGS:
                        continue
                    width, depth, height = (b - a for a, b in zip(low, high))
                    area = width * depth
                    if area < 60 or height < 3:
                        continue
                    local_distance = min(math.hypot(x + 380, z - 520), math.hypot(x - 200, z + 300))
                    importance = math.sqrt(area) * (math.sqrt(height) + 1) / (1 + local_distance / 450)
                    compact = local_distance > 240 and height < 85
                    batch = building(mesh, metadata, binary, extras, low, high, compact)
                    building_batches.append((importance, osm_id, batch))
                elif is_water:
                    for primitive in mesh:
                        water_faces.extend(triangles(metadata, binary, primitive))
                    counts["water shapes"] += 1
                elif is_bridge or is_street:
                    # Shortcut: clearance controls a simplified level deck. Full
                    # approach grades and profiles need surveyed elevation data.
                    level = WATER + CLEARANCE_FEET[osm_id] * 0.3048 + 0.8 if is_bridge else GROUND + 0.025
                    road_batch = bytearray()
                    for primitive in mesh:
                        material = metadata["materials"][primitive["material"]]["name"]
                        if material != "OSM_Road":
                            continue
                        for face in triangles(metadata, binary, primitive):
                            flat_face = [(px, level, pz) for px, _, pz in face]
                            for clipped in clip(flat_face):
                                encode_triangle(road_batch, clipped, BRIDGE if is_bridge else PAVING, 0, up=True)
                    if is_bridge:
                        context.extend(road_batch)
                        counts["bridges"] += 1
                    else:
                        street_distance = min(math.hypot(x + 400, z - 520), math.hypot(x - 200, z + 300))
                        street_batches.append((street_distance, osm_id, road_batch))
                else:
                    height = min(12, max(3, high[1] - low[1]))
                    crown = min(3, max(0.9, (high[0] - low[0]) * 0.42))
                    render_tree(context, x, z, height, crown, (osm_id % 7919) / 7919)
                    counts["trees"] += 1
    render_water(context, water_faces)
    road_size = 0
    for _, _, batch in sorted(street_batches, key=lambda item: item[:2]):
        if road_size + len(batch) > STREET_TRIANGLE_BUDGET * TRIANGLE_SIZE:
            continue
        context.extend(batch)
        road_size += len(batch)
        counts["road segments"] += 1
    for _, _, batch in sorted(building_batches, key=lambda item: (-item[0], item[1])):
        if not batch or len(context) + len(batch) > TRIANGLE_BUDGET * TRIANGLE_SIZE:
            continue
        context.extend(batch)
        counts["buildings"] += 1
    if not all(counts[key] for key in ("water shapes", "bridges", "buildings")):
        raise ValueError(f"Incomplete Chicago geometry: {counts}")
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as file, gzip.GzipFile(filename="", mode="wb", fileobj=file, mtime=0) as compressed:
        compressed.write(context)
    print(f"{target.stat().st_size:,} compressed bytes, {len(context) // TRIANGLE_SIZE:,} triangles, {dict(counts)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/atlas-river/riverfront.bin.gz"))
    args = parser.parse_args()
    export(args.source, args.output)
