"""Refresh the published facility snapshot from a FracTracker DB_Output_V2 workbook.

Run from this repository with the source workbook and the Census 119th district
shapefile. The existing 8 October spatial/context layers remain the source for
unchanged facility joins; new facility points receive county and state context,
while facility-specific grid proximity stays unavailable until that analysis is
rebuilt. The workbook itself is not published in this repository.
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path


SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
BASELINE_WORKBOOK = ROOT / "Data Centers/Facility Inventories/US/Data_Centers_Database.xlsx"
BASELINE_GPKG = ROOT / "Local Opposition/US Opposition Layer/Layer 08 Local Opposition/US_Data_Centers_Local_Opposition.gpkg"
PREPARATION = ROOT / "Analysis/Layer_01_US_Data_Centers"
sys.path.insert(0, str(PREPARATION))
from prepare_source_gpkg import assign_ids, load_records, prepare  # noqa: E402


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
SNAPSHOT = "27 October 2026"
METRICS = ("facilityCount", "reportedMw", "knownMwCount", "operatingCount", "pipelineCount", "directOppositionCount")
SNAKE_METRICS = ("facility_count", "reported_mw", "known_mw_count", "operating_count", "pipeline_count", "direct_opposition_count")


def read_js(path: Path):
    content = path.read_text(encoding="utf-8")
    prefix, payload = content.split("=", 1)
    return prefix, json.loads(payload.rstrip().removesuffix(";"))


def write_js(path: Path, prefix: str, data):
    path.write_text(prefix + "=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


def number(value):
    if value is None or str(value).strip() == "":
        return None
    return float(value)


def integer(value):
    return int(float(value)) if value not in (None, "") else 0


def acreage_class(acres):
    if acres is None:
        return "Unknown"
    if acres < 25:
        return "Under 25 acres"
    if acres < 100:
        return "25–99 acres"
    if acres < 500:
        return "100–499 acres"
    return "500+ acres"


def primary_power(group):
    if not group or group == "Unknown":
        return "Unknown"
    if "+" in group:
        return "Mixed"
    if group == "Storage / fuel cell":
        return "Storage or fuel cell"
    if group in {"Grid", "Natural gas", "Renewable", "Nuclear", "Other fossil", "Other"}:
        return group
    return "Other"


def project(lon, lat, state):
    if state == "HI":
        return 300 + (lon + 161) * 19, 512 + (23 - lat) * 19
    if state == "AK":
        return 48 + ((lon - 360 if lon > 0 else lon) + 170) * 4.5, 445 + (72 - lat) * 4.3
    return 95 + (lon + 125) * 14.15, 45 + (50 - lat) * 20.1


def source_fields(prepared):
    p = prepared["properties"]
    lon, lat = prepared["geometry"]["coordinates"]
    x, y = project(lon, lat, p["state"])
    acres = p["property_size_acres_mid"]
    return {
        "id": p["facility_id"], "name": p["facility_name"], "city": p["city"], "state": p["state"],
        "county": p["county"], "phase": p["project_phase"], "activity": p["activity_group"],
        "operator": p["operator_name"] or None, "purpose": p["purpose_group"], "mw": p["mw_mid"],
        "capacity": p["capacity_class"], "power": primary_power(p["power_group"]),
        "acres": acres, "acreageClass": acreage_class(acres),
        "directOpposition": int(p["community_pushback"] == "Yes"),
        "oppositionStatus": p["resistance_status"],
        "locationConfidence": p["location_confidence"],
        "source": p["information_source"] or None,
        "onlineYear": p["expected_online_year"], "dateCreated": p["date_created"] or None,
        "dateUpdated": p["date_updated"] or None,
        "lon": round(lon, 5), "lat": round(lat, 5), "x": round(x, 1), "y": round(y, 1),
    }


SOURCE_TO_DASHBOARD = {
    "facility_name": ("name",), "city": ("city",), "state": ("state",), "county": ("county",),
    "status": ("phase", "activity"), "operator_name": ("operator",), "purpose": ("purpose",),
    "mw": ("mw", "capacity"), "power_source": ("power",),
    "property_size_acres": ("acres", "acreageClass"),
    "community_pushback": ("directOpposition",), "resistance_status": ("oppositionStatus",),
    "location_confidence": ("locationConfidence",), "information_source": ("source",),
    "expected_date_online": ("onlineYear",), "date_created": ("dateCreated",),
    "lat": ("lat", "x", "y"), "long": ("lon", "x", "y"),
}


def changed(a, b, key):
    return str(a.get(key) or "").strip() != str(b.get(key) or "").strip()


def contextual_fields(geography, state, states_by_abbr, state_events, direct):
    policy = states_by_abbr[state]
    county_events = integer(geography["opposition_county_event_count"])
    local_actions = integer(geography["local_action_county_count"])
    opposition = ("Direct facility record" if direct else
                  "County tracker context only" if county_events or local_actions else
                  "State tracker context only" if state_events[state] else
                  "No tracker match; opposition unknown")
    return {
        "utility": None, "utilityMatch": "Not assessed for this facility",
        "subregion": None, "txKm": None, "txKv": None, "substationKm": None,
        "generation50Mw": None, "queueActiveMw": number(geography["queue_active_mw"]),
        "relativeScale": "Unknown", "waterClass": geography["water_scarcity_class"] or "Unknown",
        "waterFactor": number(geography["aware_annual_average_cf"]),
        "risk": geography["nri_risk_rating"] or "Unknown",
        "drought": geography["nri_drought_risk_rating"] or "Unknown",
        "flood": geography["nri_riverine_flood_risk_rating"] or "Unknown",
        "heat": geography["nri_heat_wave_risk_rating"] or "Unknown",
        "wildfire": geography["nri_wildfire_risk_rating"] or "Unknown",
        "density": geography["county_facility_density_class"] or "Unknown",
        "cbpEstablishments": number(geography["cbp_2023_establishments"]),
        "incentive": policy["incentive"], "electricityTax": policy["electricityTax"],
        "moratoriumCount": policy["moratoriumCount"], "billCount": policy["billCount"],
        "passedBills": policy["billStatus"].get("Pass", 0),
        "countyEvents": county_events, "localActions": local_actions, "oppositionClass": opposition,
    }


def aggregate(facilities, membership):
    totals = defaultdict(lambda: {key: 0 for key in METRICS})
    for facility in facilities:
        unit = membership.get(facility["id"])
        if not unit:
            continue
        row = totals[unit]
        row["facilityCount"] += 1
        if facility["mw"] is not None:
            row["reportedMw"] += facility["mw"]
            row["knownMwCount"] += 1
        row["operatingCount"] += facility["phase"] == "Operating"
        row["pipelineCount"] += facility["activity"] == "Active pipeline"
        row["directOppositionCount"] += facility["directOpposition"] == 1
    for row in totals.values():
        row["reportedMw"] = round(row["reportedMw"], 2)
    return totals


def update_download(stem: Path, totals):
    csv_path = stem.with_suffix(".csv")
    csv_lines = csv_path.read_text(encoding="utf-8").splitlines(keepends=True)
    fields = next(csv.reader([csv_lines[0]]))
    key = "county_id" if "county_id" in fields else "hex_id"
    token_pattern = re.compile(r'("(?:[^"]|"")*"|[^,]*)(,|$)')
    for index in range(1, len(csv_lines)):
        line = csv_lines[index]
        values = next(csv.reader([line]))
        counts = totals.get(values[fields.index(key)], {})
        body = line.rstrip("\r\n")
        tokens = token_pattern.findall(body)
        if len(tokens) == len(fields) + 1 and tokens[-1] == ("", ""):
            tokens.pop()
        if len(tokens) != len(fields):
            raise RuntimeError(f"Could not parse CSV row {index + 1} in {csv_path}")
        for js_key, csv_key in zip(METRICS, SNAKE_METRICS):
            column = fields.index(csv_key)
            value = counts.get(js_key, 0)
            if float(values[column]) != value:
                tokens[column] = (str(value), tokens[column][1])
        csv_lines[index] = "".join(value + delimiter for value, delimiter in tokens) + line[len(body):]
    csv_path.write_text("".join(csv_lines), encoding="utf-8")
    geo_path = stem.with_suffix(".geojson")
    # GeoJSON exports have one feature per line. Preserve their geometry and layout
    # so the committed diff reflects only facility metrics.
    lines = geo_path.read_text(encoding="utf-8").splitlines(keepends=True)
    for index, line in enumerate(lines):
        if not line.startswith('{ "type": "Feature"'):
            continue
        properties = json.loads(line.rstrip().removesuffix(","))["properties"]
        counts = totals.get(properties[key], {})
        for js_key, csv_key in zip(METRICS, SNAKE_METRICS):
            value = counts.get(js_key, 0)
            if properties[csv_key] == value:
                continue
            pattern = rf'("{re.escape(csv_key)}": )(-?[0-9]+(?:\.[0-9]+)?)'
            line, replaced = re.subn(pattern, rf'\g<1>{value}', line, count=1)
            if replaced != 1:
                raise RuntimeError(f"Could not update {csv_key} in {geo_path}")
        lines[index] = line
    geo_path.write_text("".join(lines), encoding="utf-8")


def main(workbook: Path, districts_shp: Path):
    old_rows = load_records(BASELINE_WORKBOOK)
    new_rows = load_records(workbook)
    with sqlite3.connect(BASELINE_GPKG) as connection:
        old_ids = [row[0] for row in connection.execute("SELECT facility_id FROM data_centers ORDER BY fid")]
    if len(old_rows) != len(old_ids):
        raise RuntimeError("Baseline workbook and GeoPackage row counts differ")
    ids, matched_count, new_count = assign_ids(new_rows, old_rows, old_ids)
    if len(set(ids)) != len(ids):
        raise RuntimeError("Facility IDs are not unique")

    dashboard_path = SITE / "dist/dashboard-data.js"
    dashboard_prefix, dashboard = read_js(dashboard_path)
    prior_by_id = {facility["id"]: facility for facility in dashboard["facilities"]}
    states_by_abbr = {state["abbr"]: state for state in dashboard["states"]}
    state_events = Counter()
    with (ROOT / "Local Opposition/Sentiment/Data Center Sentiment 2026-09-18/derived/opposition_events.csv").open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            state_events[row["state"]] += 1

    prepared = [prepare(record, identifier) for record, identifier in zip(new_rows, ids)]
    with tempfile.TemporaryDirectory(prefix="dashboard-facilities-") as tmp:
        points_path = Path(tmp) / "points.csv"
        geography_path = Path(tmp) / "geography.csv"
        with points_path.open("w", newline="", encoding="utf-8") as dest:
            writer = csv.writer(dest)
            writer.writerow(("id", "lon", "lat"))
            writer.writerows((identifier, *item["geometry"]["coordinates"]) for identifier, item in zip(ids, prepared))
        subprocess.run(["Rscript", str(SITE / "scripts/assign_facility_geographies.R"), str(points_path), str(geography_path), str(districts_shp), str(SITE)], check=True)
        with geography_path.open(newline="", encoding="utf-8") as source:
            geography = {row["id"]: row for row in csv.DictReader(source)}

    baseline_by_id = {identifier: record for identifier, record in zip(old_ids, old_rows)}
    facilities = []
    for record, item, identifier in zip(new_rows, prepared, ids):
        fresh = source_fields(item)
        old = prior_by_id.get(identifier)
        geo = geography[identifier]
        if old:
            facility = deepcopy(old)
            previous = baseline_by_id.get(identifier)
            if previous is None:
                previous = record
            for field, keys in SOURCE_TO_DASHBOARD.items():
                if changed(previous, record, field):
                    for key in keys:
                        facility[key] = fresh[key]
            facility["dateUpdated"] = fresh["dateUpdated"]
            if facility["directOpposition"] == 1:
                facility["oppositionClass"] = "Direct facility record"
            elif old["oppositionClass"] == "Direct facility record":
                facility["oppositionClass"] = "County tracker context only" if old["countyEvents"] or old["localActions"] else "State tracker context only" if state_events[facility["state"]] else "No tracker match; opposition unknown"
        else:
            facility = fresh | contextual_fields(geo, fresh["state"], states_by_abbr, state_events, fresh["directOpposition"])
        facilities.append(facility)
    dashboard["facilities"] = facilities
    dashboard["meta"].update({
        "snapshot": SNAPSHOT, "facilitySnapshot": SNAPSHOT,
        "contextSnapshot": "8 October 2026", "facilities": len(facilities),
        "facilitySource": workbook.name,
        "note": "Facility inventory updated 27 October 2026. Grid, resource, policy, and tracker context remains from the prior spatial snapshot; new facility-specific grid proximity has not been assessed.",
    })

    hex_path = SITE / "dist/hex/hex-data.js"
    hex_prefix, hex_data = read_js(hex_path)
    old_hex = {row["id"]: row["hexId"] for row in hex_data["facilityHex"]}
    hex50 = {}
    hex100 = {}
    va_membership = {}
    for facility in facilities:
        identifier = facility["id"]
        geo = geography[identifier]
        original = prior_by_id.get(identifier)
        same_location = original and original["lon"] == facility["lon"] and original["lat"] == facility["lat"]
        hex50[identifier] = old_hex.get(identifier) if same_location and identifier in old_hex else geo["hex50"]
        hex100[identifier] = geo["hex100"]
        if geo["vaCounty"]:
            va_membership[identifier] = geo["vaCounty"]
    if any(not value for value in hex50.values()):
        raise RuntimeError("Some facility points have no 50 km hex")
    hex_data["facilityHex"] = [{"id": facility["id"], "hexId": hex50[facility["id"]]} for facility in facilities]
    hex_data["meta"].update({"snapshot": SNAPSHOT, "facilityCount": len(facilities)})
    for variable in hex_data["variables"]:
        if variable["key"] == "facilityCount":
            variable["source"] = f"FracTracker {workbook.name} (DB_Output_V2); {len(facilities):,} facility records in the 27 October 2026 snapshot."
    hex_totals = aggregate(facilities, hex50)
    for cell in hex_data["cells"]:
        cell.update(hex_totals.get(cell["id"], {key: 0 for key in METRICS}))

    va_path = SITE / "dist/virginia/county-data.js"
    va_prefix, va_data = read_js(va_path)
    va_facilities = []
    for facility in facilities:
        identifier = facility["id"]
        if identifier not in va_membership:
            continue
        geo = geography[identifier]
        va_facilities.append({
            "id": identifier, "name": facility["name"], "countyId": va_membership[identifier],
            "phase": facility["phase"], "activity": facility["activity"],
            "directOpposition": facility["directOpposition"], "onlineYear": facility["onlineYear"],
            "dateCreated": facility["dateCreated"], "mw": facility["mw"],
            "x": float(geo["vaX"]), "y": float(geo["vaY"]),
        })
    va_data["facilities"] = va_facilities
    va_data["meta"].update({"snapshot": SNAPSHOT, "facilityCount": len(va_facilities)})
    for variable in va_data["variables"]:
        if variable["key"] in {"facilityCount", "reportedMw", "operatingCount", "pipelineCount"}:
            variable["source"] = f"FracTracker {workbook.name} (DB_Output_V2); {len(va_facilities)} Virginia facility records in the {len(facilities):,}-record national snapshot."
    va_totals = aggregate(facilities, va_membership)
    for cell in va_data["cells"]:
        cell.update(va_totals.get(cell["id"], {key: 0 for key in METRICS}))

    district_path = SITE / "dist/votes/districts.json"
    district_data = json.loads(district_path.read_text(encoding="utf-8"))
    prior_districts = district_data["facilities"]
    districts = {}
    for facility in facilities:
        identifier = facility["id"]
        geo = geography[identifier]
        original = prior_by_id.get(identifier)
        same_location = original and original["lon"] == facility["lon"] and original["lat"] == facility["lat"] and original["state"] == facility["state"]
        if same_location and identifier in prior_districts:
            districts[identifier] = prior_districts[identifier]
        elif geo["districtStateFips"] == FIPS[facility["state"]] and geo["districtNumber"]:
            number = geo["districtNumber"]
            districts[identifier] = f"{facility['state']}-{'AL' if number == '00' else number}"
    district_data["facilities"] = districts
    if not set(districts.values()).issubset({row[0] for row in district_data["districts"]}):
        raise RuntimeError("District assignment references an unknown district")

    # Validate every aggregate and membership before writing published files.
    if len(facilities) != len(new_rows) or len(hex_data["facilityHex"]) != len(facilities):
        raise RuntimeError("Facility totals do not match the workbook")
    if sum(cell["facilityCount"] for cell in hex_data["cells"]) != len(facilities):
        raise RuntimeError("Hexagon facility counts do not reconcile")
    if sum(cell["facilityCount"] for cell in va_data["cells"]) != len(va_facilities):
        raise RuntimeError("Virginia county facility counts do not reconcile")

    write_js(dashboard_path, dashboard_prefix, dashboard)
    write_js(hex_path, hex_prefix, hex_data)
    write_js(va_path, va_prefix, va_data)
    district_path.write_text(json.dumps(district_data, separators=(",", ":")) + "\n", encoding="utf-8")
    update_download(SITE / "dist/hex/downloads/us_hex_grid_50km", hex_totals)
    update_download(SITE / "dist/hex/downloads/us_hex_grid_100km", aggregate(facilities, hex100))
    update_download(SITE / "dist/virginia/downloads/virginia_county_data", va_totals)
    print(f"Refreshed {len(facilities)} facilities: {matched_count} retained IDs, {new_count} new IDs; {len(va_facilities)} Virginia facilities; {len(districts)} district matches")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 scripts/refresh_facilities.py WORKBOOK.xlsx CENSUS_DISTRICTS.shp")
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
