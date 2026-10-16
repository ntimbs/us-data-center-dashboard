"""Build the small dashboard district layer from 2024 results and Census boundaries.

Inputs (downloaded separately):
  2024 Pres by CD, curated by Drew Savicki (CSV export)
  Census cb_2024_us_cd119_500k.zip (119th congressional districts)

Usage: PYTHONPATH=/path/to/deps python3 scripts/build_congressional_votes.py RESULTS.csv BOUNDARIES.zip
Requires pyshp and shapely. The source downloads are not committed to this repo.
"""

import csv
import json
import sys
import zipfile
from pathlib import Path

import shapefile
from shapely.geometry import Point, shape


FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08",
    "CT": "09", "DE": "10", "FL": "12", "GA": "13", "HI": "15", "ID": "16",
    "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22",
    "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28",
    "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34",
    "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40",
    "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47",
    "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54",
    "WI": "55", "WY": "56",
}
BY_FIPS = {value: key for key, value in FIPS.items()}
ROOT = Path(__file__).resolve().parents[1]


def project(lon, lat, state):
    if state == "HI":
        return 300 + (lon + 161) * 19, 512 + (23 - lat) * 19
    if state == "AK":
        return 48 + ((lon - 360 if lon > 0 else lon) + 170) * 4.5, 445 + (72 - lat) * 4.3
    return 95 + (lon + 125) * 14.15, 45 + (50 - lat) * 20.1


def path_and_bounds(geometry, state):
    polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
    parts = []
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = [project(x, y, state) for x, y in ring.coords]
            if len(coords) < 4:
                continue
            for x, y in coords:
                bounds[0] = min(bounds[0], x)
                bounds[1] = min(bounds[1], y)
                bounds[2] = max(bounds[2], x)
                bounds[3] = max(bounds[3], y)
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in coords) + "Z")
    return "".join(parts), [round(value, 1) for value in bounds]


def integer(text):
    return int(text.replace(",", ""))


def main(results_path, boundaries_path):
    results = {}
    with open(results_path, newline="", encoding="utf-8-sig") as source:
        for record in csv.DictReader(source):
            district = record["CD"]
            dem, rep, other, total = (integer(record[key]) for key in ("Harris", "Trump", "Other", "Total"))
            # The published district apportionments in NC and TN have a few
            # one-vote rounding differences between candidate and total columns.
            if abs(dem + rep + other - total) > 1:
                raise ValueError(f"Vote total mismatch for {district}")
            results[district] = [dem, rep, total]
    if len(results) != 435:
        raise ValueError(f"Expected 435 House districts; found {len(results)}")

    with zipfile.ZipFile(boundaries_path) as archive:
        prefix = "cb_2024_us_cd119_500k"
        reader = shapefile.Reader(
            shp=archive.open(prefix + ".shp"),
            shx=archive.open(prefix + ".shx"),
            dbf=archive.open(prefix + ".dbf"),
        )
        geometries = {}
        rows = []
        for item in reader.iterShapeRecords():
            state = BY_FIPS.get(item.record["STATEFP"])
            if not state:
                continue
            number = item.record["CD119FP"]
            district = f"{state}-{'AL' if number == '00' else number}"
            if district not in results:
                raise ValueError(f"Missing results for {district}")
            full = shape(item.shape.__geo_interface__)
            geometries[district] = full
            simplified = full.simplify(0.004, preserve_topology=True)
            svg, bounds = path_and_bounds(simplified, state)
            dem, rep, total = results[district]
            rows.append([district, dem, rep, total, svg, bounds])
    if set(results) != set(geometries):
        raise ValueError(f"District mismatch: {sorted(set(results) ^ set(geometries))}")

    source = (ROOT / "dist/dashboard-data.js").read_text()
    dashboard = json.loads(source[source.index("{"):source.rindex("}") + 1])
    assigned = {}
    unmatched = []
    by_state = {}
    for district, geometry in geometries.items():
        by_state.setdefault(district[:2], []).append((district, geometry))
    for facility in dashboard["facilities"]:
        state = facility["state"]
        point = Point(facility["lon"], facility["lat"])
        matches = [district for district, geometry in by_state[state] if geometry.covers(point)]
        if len(matches) == 1:
            assigned[facility["id"]] = matches[0]
        elif len(matches) > 1:
            raise ValueError(f"Overlapping districts for {facility['id']}: {matches}")
        else:
            unmatched.append(facility["id"])

    out = ROOT / "dist/votes/districts.json"
    out.write_text(json.dumps({"districts": sorted(rows), "facilities": assigned}, separators=(",", ":")))
    print(f"Wrote {len(rows)} districts and {len(assigned)} facility matches to {out}; {len(unmatched)} unmatched")
    if unmatched:
        print("Unmatched facility IDs:", ", ".join(unmatched))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_congressional_votes.py RESULTS.csv BOUNDARIES.zip")
    main(sys.argv[1], sys.argv[2])
