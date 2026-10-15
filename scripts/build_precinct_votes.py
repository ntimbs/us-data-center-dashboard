"""Build a small coverage manifest from the NYT 2024 precinct TopoJSON.

The dashboard fetches precinct records directly from The New York Times. Only
aggregate coverage and map bounds are stored in this repository.
"""

from __future__ import annotations

import csv
import gzip
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from build_data import project


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "NYT_2024_vote_data"
OUT = Path(__file__).resolve().parents[1] / "dist" / "votes"


def clean_ring(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Keep visible bends at the dashboard's base map scale."""
    if len(points) < 4:
        return points
    result = [points[0]]
    for point in points[1:-1]:
        if math.dist(point, result[-1]) >= 0.35:
            result.append(point)
    if math.dist(points[-1], result[-1]) >= 0.1:
        result.append(points[-1])
    if len(result) < 3:
        min_x = min(x for x, _ in points)
        max_x = max(x for x, _ in points)
        min_y = min(y for _, y in points)
        max_y = max(y for _, y in points)
        cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
        radius = 0.12
        return [(cx-radius, cy-radius), (cx+radius, cy-radius),
                (cx+radius, cy+radius), (cx-radius, cy+radius)]
    return result


def geometry_rings(geometry: dict, arcs: list, scale: list, translate: list):
    shape = geometry.get("type")
    polygons = [geometry["arcs"]] if shape == "Polygon" else geometry.get("arcs", [])
    for polygon in polygons:
        for ring in polygon:
            points = []
            for arc_index in ring:
                arc = arcs[arc_index if arc_index >= 0 else ~arc_index]
                x = y = 0
                decoded = []
                for dx, dy in arc:
                    x += dx
                    y += dy
                    decoded.append((x * scale[0] + translate[0], y * scale[1] + translate[1]))
                if arc_index < 0:
                    decoded.reverse()
                points.extend(decoded if not points else decoded[1:])
            if points:
                yield points


def path_and_center(geometry: dict, arcs: list, scale: list, translate: list, state: str):
    parts = []
    bounds = [float("inf"), float("inf"), -float("inf"), -float("inf")]
    largest_center = None
    largest_area = -1.0
    for ring in geometry_rings(geometry, arcs, scale, translate):
        projected = [project(lon, lat, state) for lon, lat in ring]
        xs = [p[0] for p in projected]
        ys = [p[1] for p in projected]
        bbox = min(xs), min(ys), max(xs), max(ys)
        bounds[0] = min(bounds[0], bbox[0])
        bounds[1] = min(bounds[1], bbox[1])
        bounds[2] = max(bounds[2], bbox[2])
        bounds[3] = max(bounds[3], bbox[3])
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        if area > largest_area:
            largest_area = area
            largest_center = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
        reduced = clean_ring(projected)
        if len(reduced) >= 3:
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in reduced) + "Z")
    if largest_center is None:
        return "", None, None
    return "".join(parts), [round(v, 1) for v in largest_center], bounds


def build():
    csv_rows = list(csv.DictReader((SOURCE / "precincts-with-results").open()))
    with gzip.open(SOURCE / "precincts-with-results.topojson.gz", "rt") as stream:
        topology = json.load(stream)
    geometries = topology["objects"]["tiles"]["geometries"]
    if len(csv_rows) != len(geometries):
        raise ValueError("CSV and TopoJSON record counts differ")
    csv_keys = Counter((row["state"], row["GEOID"]) for row in csv_rows)
    topo_keys = Counter((g["properties"]["state"], g["properties"]["GEOID"]) for g in geometries)
    if csv_keys != topo_keys:
        raise ValueError("CSV and TopoJSON precinct identifiers differ")

    OUT.mkdir(parents=True, exist_ok=True)
    skipped = []
    stats = defaultdict(lambda: {"count": 0, "official": 0, "dem": 0, "rep": 0,
                                 "total": 0, "bounds": [float("inf"), float("inf"), -float("inf"), -float("inf")]})
    arcs = topology["arcs"]
    scale = topology["transform"]["scale"]
    translate = topology["transform"]["translate"]
    for index, geometry in enumerate(geometries, 1):
        props = geometry["properties"]
        state = props["state"]
        path, center, bounds = path_and_center(geometry, arcs, scale, translate, state)
        if not path or center is None:
            skipped.append((state, props["GEOID"]))
            continue
        dem, rep, total = (int(props[key]) for key in ("votes_dem", "votes_rep", "votes_total"))
        margin = float(props["pct_dem_lead"])
        official = bool(props["official_boundary"])
        stat = stats[state]
        stat["count"] += 1
        stat["official"] += official
        stat["dem"] += dem
        stat["rep"] += rep
        stat["total"] += total
        for i in (0, 1):
            stat["bounds"][i] = min(stat["bounds"][i], bounds[i])
        for i in (2, 3):
            stat["bounds"][i] = max(stat["bounds"][i], bounds[i])
        if index % 20000 == 0:
            print(f"Processed {index:,} of {len(geometries):,} precincts", flush=True)

    for state in stats:
        stats[state]["bounds"] = [round(v, 1) for v in stats[state]["bounds"]]
    count = sum(item["count"] for item in stats.values())
    (OUT / "manifest.json").write_text(json.dumps({"source": "The New York Times 2024 Precinct-Level Election Results",
        "accessed": "2026-10-15", "states": dict(sorted(stats.items())), "count": count,
        "unmapped": len(skipped)}, separators=(",", ":")))
    print(f"Wrote summary for {count:,} mapped precincts across {len(stats)} jurisdictions; {len(skipped)} lack geometry")


if __name__ == "__main__":
    build()
