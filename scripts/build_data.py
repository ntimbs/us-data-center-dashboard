from __future__ import annotations

import json
import math
import sqlite3
import struct
import csv
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SITE = Path(__file__).resolve().parents[1]
OUT = SITE / "dist" / "dashboard-data.js"
POWER_OUT = SITE / "dist" / "power-plant-data.js"
SOURCE = ROOT / "Local Opposition" / "US Opposition Layer" / "Layer 08 Local Opposition" / "US_Data_Centers_Local_Opposition.gpkg"
POLICY = ROOT / "Legislation" / "US Legislation Layer" / "Layer 07 State Policy" / "US_Data_Centers_State_Policy.gpkg"
POLICY_BILLS = ROOT / "Analysis" / "State_Legislation" / "state_legislation_bills.csv"
POWER = ROOT / "Power" / "US Power Layer" / "Layer 04 Infrastructure and Grid Pressure" / "US_Data_Centers_Grid_Pressure.gpkg"


def wkb_offset(blob: bytes) -> int:
    flags = blob[3]
    envelope_code = (flags >> 1) & 0b111
    doubles = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}.get(envelope_code, 0)
    return 8 + doubles * 8


def read_u32(data: bytes, offset: int, endian: str):
    return struct.unpack_from(endian + "I", data, offset)[0], offset + 4


def read_point(data: bytes, offset: int, endian: str):
    x, y = struct.unpack_from(endian + "dd", data, offset)
    return (x, y), offset + 16


def parse_wkb(data: bytes, offset: int = 0):
    endian = "<" if data[offset] == 1 else ">"
    geom_type, offset = read_u32(data, offset + 1, endian)
    base_type = geom_type % 1000
    if base_type == 1:
        return read_point(data, offset, endian)
    if base_type == 2:
        count, offset = read_u32(data, offset, endian)
        points = []
        for _ in range(count):
            point, offset = read_point(data, offset, endian)
            points.append(point)
        return points, offset
    if base_type == 3:
        count, offset = read_u32(data, offset, endian)
        rings = []
        for _ in range(count):
            size, offset = read_u32(data, offset, endian)
            ring = []
            for _ in range(size):
                point, offset = read_point(data, offset, endian)
                ring.append(point)
            rings.append(ring)
        return rings, offset
    if base_type in (4, 5, 6, 7):
        count, offset = read_u32(data, offset, endian)
        geoms = []
        for _ in range(count):
            geom, offset = parse_wkb(data, offset)
            geoms.append(geom)
        return geoms, offset
    raise ValueError(f"Unsupported WKB geometry type {geom_type}")


def gpkg_geometry(blob: bytes):
    return parse_wkb(blob, wkb_offset(blob))[0]


def project(lon: float, lat: float, state: str | None = None):
    if state == "AK" or lon < -129:
        return 48 + (lon + 170) * 4.5, 445 + (72 - lat) * 4.3
    if state == "HI" or (lat < 24 and lon < -150):
        return 300 + (lon + 161) * 19, 512 + (23 - lat) * 19
    return 95 + (lon + 125) * 14.15, 45 + (50 - lat) * 20.1


def perpendicular_distance(point, start, end):
    x, y = point
    x1, y1 = start
    x2, y2 = end
    if x1 == x2 and y1 == y2:
        return math.hypot(x - x1, y - y1)
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / math.hypot(y2 - y1, x2 - x1)


def simplify(points, tolerance=0.7):
    if len(points) <= 4:
        return points
    closed = points[0] == points[-1]
    working = points[:-1] if closed else points
    if len(working) <= 3:
        return points
    max_dist = 0.0
    index = 0
    for i in range(1, len(working) - 1):
        dist = perpendicular_distance(working[i], working[0], working[-1])
        if dist > max_dist:
            index, max_dist = i, dist
    if max_dist > tolerance:
        result = simplify(working[: index + 1], tolerance)[:-1] + simplify(working[index:], tolerance)
    else:
        result = [working[0], working[-1]]
    if closed:
        result.append(result[0])
    return result


def fmt(value):
    return f"{value:.1f}".rstrip("0").rstrip(".")


def polygon_path(multipolygon, state):
    parts = []
    for polygon in multipolygon:
        for ring in polygon:
            projected = [project(lon, lat, state) for lon, lat in ring]
            projected = simplify(projected)
            if len(projected) < 3:
                continue
            parts.append("M" + "L".join(f"{fmt(x)},{fmt(y)}" for x, y in projected) + "Z")
    return "".join(parts)


FACILITY_FIELDS = [
    "facility_id", "facility_name", "city", "state", "county", "project_phase", "activity_group",
    "operator_name", "purpose_group", "mw_mid", "capacity_class", "power_source_primary",
    "utility_candidate_name", "utility_match_status", "egrid_subregion_spatial", "tx_200kv_nearest_km",
    "tx_nearest_voltage_kv", "substation_nearest_km", "generation_operating_mw_50km",
    "queue_active_mw", "dc_relative_scale_class", "water_scarcity_class", "aware_annual_average_cf",
    "nri_risk_rating", "nri_drought_risk_rating", "nri_riverine_flood_risk_rating",
    "nri_heat_wave_risk_rating", "nri_wildfire_risk_rating", "reported_acreage_class",
    "property_size_acres_mid", "county_facility_density_class", "cbp_2023_establishments",
    "policy_dedicated_incentive_flag", "policy_electricity_tax_incentive_flag",
    "policy_moratorium_tracker_count", "policy_total_bills", "policy_bills_pass",
    "opposition_direct_facility_flag", "opposition_direct_status", "opposition_county_event_count",
    "local_action_county_count", "opposition_context_class", "location_confidence", "information_source",
]


SHORT_KEYS = [
    "id", "name", "city", "state", "county", "phase", "activity", "operator", "purpose", "mw",
    "capacity", "power", "utility", "utilityMatch", "subregion", "txKm", "txKv", "substationKm",
    "generation50Mw", "queueActiveMw", "relativeScale", "waterClass", "waterFactor", "risk", "drought",
    "flood", "heat", "wildfire", "acreageClass", "acres", "density", "cbpEstablishments", "incentive",
    "electricityTax", "moratoriumCount", "billCount", "passedBills", "directOpposition", "oppositionStatus",
    "countyEvents", "localActions", "oppositionClass", "locationConfidence", "source",
]


def clean_value(value):
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    facilities = []
    con = sqlite3.connect(SOURCE)
    sql = "SELECT geom," + ",".join(f'\"{field}\"' for field in FACILITY_FIELDS) + " FROM data_centers"
    for row in con.execute(sql):
        lon, lat = gpkg_geometry(row[0])
        values = [clean_value(v) for v in row[1:]]
        item = dict(zip(SHORT_KEYS, values))
        x, y = project(lon, lat, item["state"])
        item.update({"lon": round(lon, 5), "lat": round(lat, 5), "x": round(x, 1), "y": round(y, 1)})
        facilities.append(item)
    con.close()

    plants = []
    plant_dataset_status = None
    con = sqlite3.connect(POWER)
    for row in con.execute(
        "SELECT ORISPL,PNAME,PSTATABB,CNTYNAME,OPRNAME,UTLSRVNM,SECTOR,SUBRGN,"
        "fuel_category_label,NAMEPCAP,PLNGENAN,CAPFAC,NUMUNT,NUMGEN,"
        "generator_status_codes,dataset_status,LAT,LON FROM egrid_power_plants_2024"
    ):
        (
            plant_id, name, state, county, operator, utility, sector, subregion,
            fuel, capacity_mw, generation_mwh, capacity_factor, units, generators,
            status_codes, dataset_status, lat, lon,
        ) = [clean_value(value) for value in row]
        x, y = project(lon, lat, state)
        plant_dataset_status = plant_dataset_status or dataset_status
        plants.append([
            str(plant_id), name or "Unnamed power plant", state, county, operator, utility,
            sector, subregion, fuel or "Unknown", capacity_mw, generation_mwh, capacity_factor,
            units, generators, status_codes, round(lat, 5), round(lon, 5), round(x, 1), round(y, 1),
        ])
    con.close()

    bills_by_state = defaultdict(list)
    national_type_counts = Counter()
    with POLICY_BILLS.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            if row.get("state") == "US":
                continue
            bill_types = [item.strip() for item in (row.get("category") or "").split(";") if item.strip()]
            national_type_counts.update(bill_types)
            bills_by_state[row["state"]].append({
                "bill": row.get("bill") or "Unknown",
                "year": int(row["year"]) if row.get("year", "").isdigit() else row.get("year"),
                "status": row.get("status") or "Unknown",
                "title": row.get("summary_title") or "Untitled bill",
                "types": bill_types,
                "lastActionDate": row.get("last_action_date") or None,
                "sourceUrl": row.get("source_url") or None,
            })

    states = []
    con = sqlite3.connect(POLICY)
    for row in con.execute(
        "SELECT geom,state,state_name,policy_dedicated_incentive_flag,policy_electricity_tax_incentive_flag,"
        "policy_moratorium_tracker_count,policy_total_bills FROM state_legislation_summary ORDER BY state"
    ):
        geom, abbr, name, incentive, electricity, moratoria, bills = row
        state_bills = bills_by_state.get(abbr, [])
        status_counts = Counter(bill["status"] for bill in state_bills)
        type_counts = Counter(item for bill in state_bills for item in bill["types"])
        state_bills.sort(key=lambda bill: (bill["lastActionDate"] or "", bill["year"] or 0, bill["bill"]), reverse=True)
        states.append({
            "abbr": abbr,
            "name": name,
            "path": polygon_path(gpkg_geometry(geom), abbr),
            "incentive": incentive,
            "electricityTax": electricity,
            "moratoriumCount": moratoria,
            "billCount": len(state_bills),
            "billStatus": {key: status_counts.get(key, 0) for key in ("Active", "Pass", "Fail", "Veto")},
            "billTypes": dict(sorted(type_counts.items(), key=lambda item: (-item[1], item[0]))),
            "bills": state_bills,
        })
    con.close()

    payload = {
        "meta": {
            "snapshot": "28 September 2026",
            "facilities": len(facilities),
            "powerPlants": len(plants),
            "powerPlantYear": 2024,
            "scope": "United States",
            "note": "Screening and research context; proximity and policy exposure do not establish causation or service relationships.",
        },
        "states": states,
        "policyTypes": [item for item, _ in national_type_counts.most_common()],
        "facilities": facilities,
    }
    OUT.write_text("window.DASHBOARD_DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    power_payload = {
        "year": 2024,
        "datasetStatus": plant_dataset_status,
        "fields": [
            "id", "name", "state", "county", "operator", "utility", "sector", "subregion", "fuel",
            "capacityMw", "generationMwh", "capacityFactor", "units", "generators", "statusCodes",
            "lat", "lon", "x", "y",
        ],
        "plants": plants,
    }
    POWER_OUT.write_text("window.POWER_PLANT_DATA=" + json.dumps(power_payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KiB)")
    print(f"Wrote {POWER_OUT} ({POWER_OUT.stat().st_size / 1024:.1f} KiB)")


if __name__ == "__main__":
    build()
