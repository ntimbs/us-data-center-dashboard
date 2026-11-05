"""Build the 2026 House vote layer from a dated results CSV and Census shapes.

Inputs:
  Polling Desk house-districts.csv (2026 House race totals from civicAPI)
  GeoJSON and assignment CSV made by prepare_2026_house_boundaries.R

The Census input is 120th Congress TIGER/Line districts for 49 states, plus
Missouri's unchanged 119th Congress district file. Results are preliminary.
"""

import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = "5 November 2026"


def project(lon, lat, state):
    if state == "HI":
        return 300 + (lon + 161) * 19, 512 + (23 - lat) * 19
    if state == "AK":
        return 48 + ((lon - 360 if lon > 0 else lon) + 170) * 4.5, 445 + (72 - lat) * 4.3
    return 95 + (lon + 125) * 14.15, 45 + (50 - lat) * 20.1


def svg_path(geometry, state):
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    parts = []
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for polygon in polygons:
        for ring in polygon:
            coords = [project(lon, lat, state) for lon, lat in ring]
            if len(coords) < 4:
                continue
            for x, y in coords:
                bounds[0] = min(bounds[0], x)
                bounds[1] = min(bounds[1], y)
                bounds[2] = max(bounds[2], x)
                bounds[3] = max(bounds[3], y)
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in coords) + "Z")
    if not parts:
        raise ValueError("Empty district display geometry")
    return "".join(parts), [round(value, 1) for value in bounds]


def main(results_path, processed_dir):
    results = {}
    with open(results_path, newline="", encoding="utf-8-sig") as source:
        for record in csv.DictReader(source):
            if record["cycle"] != "2026":
                raise ValueError("Result file contains another election cycle")
            district = record["district"]
            if district in results:
                raise ValueError(f"Duplicate result for {district}")
            dem, rep, other, total = (int(record[key]) for key in ("dem_votes", "rep_votes", "other_votes", "total_votes"))
            if min(dem, rep, other, total) < 0 or dem + rep + other != total:
                raise ValueError(f"Invalid candidate totals for {district}")
            if record["status"] not in {"called", "counting"}:
                raise ValueError(f"Unexpected race status for {district}")
            results[district] = {
                "dem": dem, "rep": rep, "total": total, "status": record["status"],
                "reporting": int(record["percent_reporting"]) if record["percent_reporting"] else None,
                "leader": record["winner_or_leader"], "party": record["party"], "url": record["url"],
            }
    if len(results) != 435:
        raise ValueError(f"Expected 435 House district results; found {len(results)}")

    shapes = json.loads((processed_dir / "districts.geojson").read_text(encoding="utf-8"))
    districts = []
    for feature in shapes["features"]:
        district = feature["properties"]["district"]
        if district not in results:
            raise ValueError(f"No House result for {district}")
        state = district[:2]
        path, bounds = svg_path(feature["geometry"], state)
        row = results[district]
        districts.append([district, row["dem"], row["rep"], row["total"], path, bounds,
                          row["status"], row["reporting"], row["leader"], row["party"], row["url"]])
    if len(districts) != 435 or {row[0] for row in districts} != set(results):
        raise ValueError("Census geometry and House result districts do not match")

    dashboard = json.loads((ROOT / "dist/dashboard-data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip().removesuffix(";"))
    valid_facilities = {facility["id"] for facility in dashboard["facilities"]}
    assigned = {}
    seen_facilities = set()
    with (processed_dir / "assignments.csv").open(newline="", encoding="utf-8") as source:
        for record in csv.DictReader(source):
            if record["id"] in seen_facilities:
                raise ValueError(f"Duplicate facility assignment for {record['id']}")
            seen_facilities.add(record["id"])
            if record["district"]:
                assigned[record["id"]] = record["district"]
    if seen_facilities != valid_facilities or not set(assigned.values()).issubset(results):
        raise ValueError("Invalid facility assignment")

    status = Counter(row["status"] for row in results.values())
    payload = {
        "meta": {
            "election": "2026 U.S. House general election", "snapshot": SNAPSHOT,
            "source": "Polling Desk (civicAPI results)", "sourceUrl": "https://polling-desk.com/house-districts",
            "sourceSha256": hashlib.sha256(Path(results_path).read_bytes()).hexdigest(),
            "boundary": "U.S. Census Bureau TIGER/Line 120th Congress; Missouri 119th Congress",
            "boundaryUrl": "https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.html",
            "reportedDistricts": sum(row["total"] > 0 for row in results.values()),
            "calledDistricts": status["called"], "countingDistricts": status["counting"],
            "unmatchedFacilities": len(valid_facilities) - len(assigned),
            "note": "Unofficial preliminary vote totals retrieved 5 November 2026. Zero-vote districts have no displayed margin. Race calls and reporting estimates may change; no automatic refresh.",
        },
        "districts": sorted(districts), "facilities": assigned,
    }
    out = ROOT / "dist/votes/house-2026.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(districts)} districts ({payload['meta']['reportedDistricts']} with votes), {len(assigned)} facility matches, {status['counting']} races still counting")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 scripts/build_2026_house_votes.py RESULTS.csv PROCESSED_BOUNDARIES_DIR")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
