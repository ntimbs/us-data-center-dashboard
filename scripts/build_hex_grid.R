suppressPackageStartupMessages(library(sf))
suppressPackageStartupMessages(library(jsonlite))

sf_use_s2(FALSE)

script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]
script_path <- sub("^--file=", "", script_arg)
root <- normalizePath(file.path(dirname(script_path), "..", ".."))
site <- file.path(root, "US_Data_Center_Dashboard")
out_dir <- file.path(site, "dist", "hex")
dir.create(file.path(out_dir, "downloads"), recursive = TRUE, showWarnings = FALSE)

facility_file <- file.path(root, "Local Opposition", "US Opposition Layer", "Layer 08 Local Opposition", "US_Data_Centers_Local_Opposition.gpkg")
state_file <- file.path(root, "Legislation", "US Legislation Layer", "Layer 07 State Policy", "US_Data_Centers_State_Policy.gpkg")
plant_file <- file.path(root, "Power", "US Power Layer", "Layer 02 eGRID 2024", "US_Data_Centers_Power_Context.gpkg")
grid_file <- file.path(root, "QGIS", "US_OSM_Power_Grid.gpkg")
county_file <- file.path(root, "Resources", "US Resources Layer", "Layer 06 Land and Development Context", "US_Data_Centers_Land_Development.gpkg")
actions_file <- file.path(root, "QGIS", "FracTracker_Local_Actions.gpkg")

target_crs <- "ESRI:102008"
cell_size_km <- 50
cell_size <- cell_size_km * 1000
grid_slug <- paste0(cell_size_km, "km")

states <- st_read(state_file, layer = "state_legislation_summary", quiet = TRUE)
states <- st_make_valid(st_transform(states, target_crs))

make_region_grid <- function(state_codes, region_code) {
  region_states <- states[states$state %in% state_codes, ]
  if (region_code == "HI") {
    main_islands_bbox <- st_bbox(c(xmin = -161, ymin = 18, xmax = -154, ymax = 23), crs = st_crs(4326))
    region_states <- st_transform(region_states, 4326)
    region_states <- suppressWarnings(st_intersection(region_states, st_as_sfc(main_islands_bbox)))
    region_states <- st_transform(region_states, target_crs)
  }
  boundary <- st_union(region_states)
  grid <- st_make_grid(boundary, cellsize = cell_size, square = FALSE)
  keep <- lengths(st_intersects(grid, boundary)) > 0
  grid <- grid[keep]
  centers <- st_centroid(grid)
  xy <- st_coordinates(centers)
  ids <- sprintf("HEX_%s_%d_%d", region_code, round(xy[,1] / 1000), round(xy[,2] / 1000))
  st_sf(hex_id = ids, region = region_code, center_x_m = xy[,1], center_y_m = xy[,2], geometry = grid)
}

all_codes <- states$state
grid <- rbind(
  make_region_grid(setdiff(all_codes, c("AK", "HI")), "CONUS"),
  make_region_grid("AK", "AK"),
  make_region_grid("HI", "HI")
)
grid <- grid[order(grid$region, grid$center_x_m, grid$center_y_m), ]
row.names(grid) <- NULL

centers <- st_centroid(grid)
state_fields <- c(
  "state", "state_name", "policy_dedicated_incentive_flag", "policy_electricity_tax_incentive_flag",
  "policy_moratorium_tracker_count", "policy_total_bills", "policy_bills_pass"
)
state_hits <- st_within(centers, states)
state_nearest <- st_nearest_feature(centers, states)
state_index <- vapply(seq_along(state_hits), function(i) if (length(state_hits[[i]])) state_hits[[i]][1] else state_nearest[i], integer(1))
state_join <- states[state_index, state_fields]

counties <- st_read(county_file, layer = "queue_counties_2025", quiet = TRUE)
counties <- st_make_valid(st_transform(counties, target_crs))
county_fields <- c(
  "GEOID", "NAME", "aware_annual_average_cf", "water_scarcity_class", "usgs_total_withdrawal_mgd",
  "nri_risk_score", "nri_drought_risk_score", "nri_wildfire_risk_score", "nri_riverine_flood_risk_score",
  "nri_heat_wave_risk_score", "cbp_2023_establishments", "queue_active_mw"
)
county_hits <- st_within(centers, counties)
county_nearest <- st_nearest_feature(centers, counties)
county_index <- vapply(seq_along(county_hits), function(i) if (length(county_hits[[i]])) county_hits[[i]][1] else county_nearest[i], integer(1))
county_join <- counties[county_index, county_fields]

grid$state <- state_join$state
grid$state_name <- state_join$state_name
grid$incentive <- as.numeric(state_join$policy_dedicated_incentive_flag)
grid$electricity_tax <- as.numeric(state_join$policy_electricity_tax_incentive_flag)
grid$moratoriums <- as.numeric(state_join$policy_moratorium_tracker_count)
grid$policy_bills <- as.numeric(state_join$policy_total_bills)
grid$policy_passed <- as.numeric(state_join$policy_bills_pass)
grid$county_fips <- county_join$GEOID
grid$county_name <- county_join$NAME
grid$water_factor <- as.numeric(county_join$aware_annual_average_cf)
grid$water_factor[grid$water_factor < 0] <- NA_real_
grid$water_class <- county_join$water_scarcity_class
grid$water_withdrawal_mgd <- as.numeric(county_join$usgs_total_withdrawal_mgd)
grid$risk_score <- as.numeric(county_join$nri_risk_score)
grid$drought_score <- as.numeric(county_join$nri_drought_risk_score)
grid$wildfire_score <- as.numeric(county_join$nri_wildfire_risk_score)
grid$flood_score <- as.numeric(county_join$nri_riverine_flood_risk_score)
grid$heat_score <- as.numeric(county_join$nri_heat_wave_risk_score)
grid$cbp_establishments <- as.numeric(county_join$cbp_2023_establishments)
grid$queue_active_mw <- as.numeric(county_join$queue_active_mw)

for (name in c(
  "facility_count", "reported_mw", "known_mw_count", "operating_count", "pipeline_count",
  "direct_opposition_count", "plant_count", "plant_operating_mw", "plant_nameplate_mw", "local_action_count"
)) grid[[name]] <- 0

facilities <- st_read(facility_file, layer = "data_centers", quiet = TRUE)
facilities <- st_transform(facilities, target_crs)
fj <- st_join(facilities, grid[, "hex_id"], join = st_within, left = FALSE)
if (nrow(fj)) {
  groups <- split(seq_len(nrow(fj)), fj$hex_id)
  pos <- match(names(groups), grid$hex_id)
  grid$facility_count[pos] <- vapply(groups, length, integer(1))
  grid$reported_mw[pos] <- vapply(groups, function(ii) sum(as.numeric(fj$mw_mid[ii]), na.rm = TRUE), numeric(1))
  grid$known_mw_count[pos] <- vapply(groups, function(ii) sum(!is.na(as.numeric(fj$mw_mid[ii]))), integer(1))
  grid$operating_count[pos] <- vapply(groups, function(ii) sum(fj$project_phase[ii] == "Operating", na.rm = TRUE), integer(1))
  grid$pipeline_count[pos] <- vapply(groups, function(ii) sum(fj$activity_group[ii] == "Active pipeline", na.rm = TRUE), integer(1))
  grid$direct_opposition_count[pos] <- vapply(groups, function(ii) sum(as.numeric(fj$opposition_direct_facility_flag[ii]) == 1, na.rm = TRUE), integer(1))
}

plants <- st_read(plant_file, layer = "egrid_power_plants_2024", quiet = TRUE)
plants <- st_transform(plants, target_crs)
pj <- st_join(plants, grid[, "hex_id"], join = st_within, left = FALSE)
if (nrow(pj)) {
  groups <- split(seq_len(nrow(pj)), pj$hex_id)
  pos <- match(names(groups), grid$hex_id)
  grid$plant_count[pos] <- vapply(groups, length, integer(1))
  grid$plant_operating_mw[pos] <- vapply(groups, function(ii) sum(as.numeric(pj$operating_mw[ii]), na.rm = TRUE), numeric(1))
  grid$plant_nameplate_mw[pos] <- vapply(groups, function(ii) sum(as.numeric(pj$NAMEPCAP[ii]), na.rm = TRUE), numeric(1))
}

actions <- st_read(actions_file, layer = "local_actions_by_status", quiet = TRUE)
actions <- st_transform(actions, target_crs)
aj <- st_join(actions, grid[, "hex_id"], join = st_within, left = FALSE)
if (nrow(aj)) {
  counts <- table(aj$hex_id)
  grid$local_action_count[match(names(counts), grid$hex_id)] <- as.integer(counts)
}

message("Reading high-voltage transmission lines...")
lines <- st_read(
  grid_file,
  query = "SELECT geom, osm_id, voltage_max_kv FROM transmission_lines WHERE voltage_max_kv >= 200",
  quiet = TRUE
)
lines <- st_transform(lines, target_crs)
message(sprintf("Intersecting high-voltage lines with the %d km grid...", cell_size_km))
pieces <- suppressWarnings(st_intersection(grid[, "hex_id"], lines))
grid$hv_line_km <- 0
if (nrow(pieces)) {
  lengths_km <- as.numeric(st_length(pieces)) / 1000
  sums <- tapply(lengths_km, pieces$hex_id, sum, na.rm = TRUE)
  grid$hv_line_km[match(names(sums), grid$hex_id)] <- as.numeric(sums)
}

neighbors <- st_touches(grid)
grid$neighbor_ids <- vapply(neighbors, function(ii) paste(grid$hex_id[ii], collapse = ";"), character(1))

country <- st_union(states)
land_parts <- suppressWarnings(st_intersection(grid[, "hex_id"], country))
land_areas <- tapply(as.numeric(st_area(land_parts)), land_parts$hex_id, sum, na.rm = TRUE)
grid$land_fraction <- 0
grid$land_fraction[match(names(land_areas), grid$hex_id)] <- pmin(1, as.numeric(land_areas) / as.numeric(st_area(grid[match(names(land_areas), grid$hex_id), ])))

centers_ll <- st_transform(st_centroid(grid), 4326)
center_xy <- st_coordinates(centers_ll)
grid$center_lon <- center_xy[,1]
grid$center_lat <- center_xy[,2]

project_screen <- function(lon, lat, state) {
  if (!is.na(state) && state == "AK") {
    if (lon > 0) lon <- lon - 360
    return(c(48 + (lon + 170) * 4.5, 445 + (72 - lat) * 4.3))
  }
  if (!is.na(state) && state == "HI") return(c(300 + (lon + 161) * 19, 512 + (23 - lat) * 19))
  c(95 + (lon + 125) * 14.15, 45 + (50 - lat) * 20.1)
}

grid_ll <- st_transform(grid, 4326)
paths <- character(nrow(grid_ll))
for (i in seq_len(nrow(grid_ll))) {
  coords <- st_coordinates(st_geometry(grid_ll)[[i]])[,1:2, drop = FALSE]
  projected <- t(apply(coords, 1, function(pt) project_screen(pt[1], pt[2], grid$state[i])))
  paths[i] <- paste0("M", paste0(round(projected[,1], 1), ",", round(projected[,2], 1), collapse = "L"), "Z")
}
grid$path <- paths

numeric_round <- c(
  "center_x_m", "center_y_m", "center_lon", "center_lat", "land_fraction", "reported_mw",
  "plant_operating_mw", "plant_nameplate_mw", "hv_line_km", "water_factor", "water_withdrawal_mgd",
  "risk_score", "drought_score", "wildfire_score", "flood_score", "heat_score", "queue_active_mw"
)
for (name in numeric_round) grid[[name]] <- round(as.numeric(grid[[name]]), if (name %in% c("center_x_m", "center_y_m")) 0 else 2)

export_fields <- c(
  "hex_id", "region", "state", "state_name", "county_fips", "county_name", "center_x_m", "center_y_m",
  "center_lon", "center_lat", "land_fraction", "neighbor_ids", "facility_count", "reported_mw", "known_mw_count",
  "operating_count", "pipeline_count", "direct_opposition_count", "plant_count", "plant_operating_mw",
  "plant_nameplate_mw", "hv_line_km", "queue_active_mw", "water_factor", "water_class",
  "water_withdrawal_mgd", "risk_score", "drought_score", "wildfire_score", "flood_score", "heat_score",
  "cbp_establishments", "incentive", "electricity_tax", "moratoriums", "policy_bills", "policy_passed",
  "local_action_count"
)

write.csv(st_drop_geometry(grid[, export_fields]), file.path(out_dir, "downloads", paste0("us_hex_grid_", grid_slug, ".csv")), row.names = FALSE, na = "")
geo <- st_transform(grid[, export_fields], 4326)
st_write(geo, file.path(out_dir, "downloads", paste0("us_hex_grid_", grid_slug, ".geojson")), delete_dsn = TRUE, quiet = TRUE)

short_map <- c(
  hex_id="id", region="region", state="state", state_name="stateName", county_fips="countyFips", county_name="countyName",
  center_x_m="xAea", center_y_m="yAea", center_lon="lon", center_lat="lat", land_fraction="landFraction",
  neighbor_ids="neighbors", facility_count="facilityCount", reported_mw="reportedMw", known_mw_count="knownMwCount",
  operating_count="operatingCount", pipeline_count="pipelineCount", direct_opposition_count="directOppositionCount",
  plant_count="plantCount", plant_operating_mw="plantOperatingMw", plant_nameplate_mw="plantNameplateMw",
  hv_line_km="hvLineKm", queue_active_mw="queueActiveMw", water_factor="waterFactor", water_class="waterClass",
  water_withdrawal_mgd="waterWithdrawalMgd", risk_score="riskScore", drought_score="droughtScore",
  wildfire_score="wildfireScore", flood_score="floodScore", heat_score="heatScore", cbp_establishments="cbpEstablishments",
  incentive="incentive", electricity_tax="electricityTax", moratoriums="moratoriums", policy_bills="policyBills",
  policy_passed="policyPassed", local_action_count="localActionCount", path="path"
)

cells <- st_drop_geometry(grid[, names(short_map)])
names(cells) <- unname(short_map)
cells$neighbors <- strsplit(cells$neighbors, ";", fixed = TRUE)
cells$neighbors <- lapply(cells$neighbors, function(x) x[nzchar(x)])

facility_hex <- data.frame(
  id = as.character(fj$facility_id),
  hexId = as.character(fj$hex_id),
  stringsAsFactors = FALSE
)

variables <- list(
  list(
    key="facilityCount", label="Data-center count", group="Data centers", unit="facilities",
    definition="Number of inventoried facility or project point records located inside the hexagon.",
    source="Layer 08 data_centers table, derived from Data_Centers_Database.xlsx (DB_Output_V2); 1,669 records in the snapshot.",
    calculation="Point-in-polygon count. Each inventory row contributes one record to one cell.",
    missing="A cell with no matched inventory record is coded 0. Zero means none observed in this inventory, not proof that no facility exists.",
    caution="Records describe facilities or projects, not individual buildings or servers; inventory completeness can vary by place.",
    basis="Point count; zero is meaningful within the inventory"
  ),
  list(
    key="reportedMw", label="Reported data-center capacity", group="Data centers", unit="MW",
    definition="Sum of reported facility power capacity for records inside the hexagon.",
    source="Layer 08 facility inventory field mw_mid, inherited from the project database.",
    calculation="Exact MW is used when available; a range contributes its midpoint. Values are summed by cell.",
    missing="Facilities without a usable MW value are excluded from the sum and tracked separately by known-MW count.",
    caution="Reported MW is not verified electricity demand, delivered power, grid headroom, or actual utilization.",
    basis="Sum of known facility MW; unknown capacity contributes nothing to the sum"
  ),
  list(
    key="operatingCount", label="Operating facilities", group="Data centers", unit="facilities",
    definition="Number of facility records whose project_phase is Operating.",
    source="Layer 08 facility inventory project_phase field.",
    calculation="Count of point records classified Operating within each cell.",
    missing="Cells with no operating inventory record are coded 0.",
    caution="This is a status snapshot and does not identify an opening date, continuous operation, or operating load.",
    basis="Operating-status point count; zero is meaningful within the inventory"
  ),
  list(
    key="pipelineCount", label="Active-pipeline facilities", group="Data centers", unit="facilities",
    definition="Number of facility records grouped as Active pipeline, including pre-proposal, proposed, and development stages.",
    source="Layer 08 facility inventory activity_group derived from project_phase.",
    calculation="Count of Active pipeline point records within each cell.",
    missing="Cells with no active-pipeline inventory record are coded 0.",
    caution="Pipeline status does not imply construction has started or that a project will be completed.",
    basis="Active-pipeline point count; zero is meaningful within the inventory"
  ),
  list(
    key="plantOperatingMw", label="Operating generation capacity", group="Power", unit="MW",
    definition="Operating generation capacity of mapped power plants located inside the hexagon.",
    source="U.S. EPA eGRID 2024 power-plant records, operating_mw field.",
    calculation="Plant-point operating MW is summed within each cell.",
    missing="Cells with no mapped eGRID plant are coded 0.",
    caution="Nearby generation is regional context; it does not establish available capacity or a supply relationship with a data center.",
    basis="eGRID 2024 plant-point sum; zero is meaningful"
  ),
  list(
    key="plantCount", label="Power-plant count", group="Power", unit="plants",
    definition="Number of eGRID power-plant records whose mapped plant point falls inside the hexagon.",
    source="U.S. EPA eGRID 2024 power-plant records.",
    calculation="Point-in-polygon count of plant records.",
    missing="Cells with no mapped eGRID plant are coded 0.",
    caution="A plant record can contain multiple generators; the count measures plant sites, not generating units or fuel diversity.",
    basis="eGRID 2024 plant-point count; zero is meaningful"
  ),
  list(
    key="hvLineKm", label="High-voltage line length", group="Power", unit="km",
    definition="Mapped length of transmission-line features rated at 200 kV or higher within the hexagon.",
    source="OpenStreetMap U.S. power extract dated 7 September 2026.",
    calculation="Qualifying line geometries are intersected with each cell and their within-cell segment lengths are summed.",
    missing="No mapped qualifying segment is coded 0; incomplete voltage tags can also lead to a zero.",
    caution="OSM completeness varies. Line presence does not measure interconnection, deliverability, congestion, redundancy, or spare capacity.",
    basis="OSM line length at or above 200 kV intersected with each cell"
  ),
  list(
    key="queueActiveMw", label="Active interconnection queue", group="Power", unit="MW",
    definition="Active generation-interconnection queue capacity associated with the county containing the cell centroid.",
    source="Berkeley Lab Queued Up project-level generation queue data through 2025, aggregated to counties.",
    calculation="Positive reported MW fields are summed by county; the county value is assigned to cells by centroid.",
    missing="No county queue value is shown as Unknown. A published county value of 0 remains 0.",
    caution="This is a generation queue measure, not a data-center load queue, available grid headroom, or expected completion capacity.",
    basis="County value assigned at the cell centroid"
  ),
  list(
    key="waterFactor", label="Water-scarcity factor", group="Resources", unit="factor",
    definition="AWARE annual-average characterization factor for the county containing the cell centroid; higher values indicate greater relative scarcity.",
    source="Prepared county resource context using the AWARE annual-average factor.",
    calculation="The county value is assigned to each cell by centroid. Negative source sentinel values are treated as missing.",
    missing="Unavailable county values are Unknown and are excluded from complete-pair correlations.",
    caution="County scarcity is screening context and does not establish site water demand, rights, utility capacity, cooling design, or local hydrology.",
    basis="County AWARE annual average assigned at the cell centroid"
  ),
  list(
    key="waterWithdrawalMgd", label="Total water withdrawal", group="Resources", unit="MGD",
    definition="Total county water withdrawal across reported uses, measured in million gallons per day.",
    source="U.S. Geological Survey 2015 county water-use data in the prepared resource layer.",
    calculation="The county total is assigned to each cell by centroid; it is not divided by cell area.",
    missing="Unavailable county values are Unknown. A published zero remains 0.",
    caution="Total withdrawals are not data-center water use, available supply, consumptive use, or permitted capacity.",
    basis="County USGS total assigned at the cell centroid"
  ),
  list(
    key="droughtScore", label="Drought risk score", group="Resources", unit="score",
    definition="County drought risk score on the National Risk Index 0–100 scale.",
    source="FEMA National Risk Index county context in the prepared resource layer.",
    calculation="The county score is assigned to each cell by centroid.",
    missing="Unavailable county scores are Unknown and excluded from complete-pair calculations.",
    caution="The score represents county-level relative risk, not a facility-specific probability, forecast, or expected outage.",
    basis="County NRI drought score assigned at the cell centroid"
  ),
  list(
    key="heatScore", label="Heat-wave risk score", group="Resources", unit="score",
    definition="County heat-wave risk score on the National Risk Index 0–100 scale.",
    source="FEMA National Risk Index county context in the prepared resource layer.",
    calculation="The county score is assigned to each cell by centroid.",
    missing="Unavailable county scores are Unknown and excluded from complete-pair calculations.",
    caution="The score is county-level relative risk and does not measure site cooling performance or facility resilience.",
    basis="County NRI heat-wave score assigned at the cell centroid"
  ),
  list(
    key="cbpEstablishments", label="Data-processing establishments", group="Resources", unit="establishments",
    definition="Published county establishment count for NAICS 518210, Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services.",
    source="U.S. Census Bureau 2023 County Business Patterns, NAICS 518210.",
    calculation="The published county count is assigned to each cell by centroid.",
    missing="A county with no published CBP row is Unknown and is not treated as zero.",
    caution="This is a broader industry-ecosystem measure and is not a count of physical data-center campuses.",
    basis="County CBP 2023 value assigned at the cell centroid"
  ),
  list(
    key="policyBills", label="State data-center bills", group="Legislation", unit="bills",
    definition="Number of tracked state data-center legislative records in the prepared policy dataset.",
    source="Layer 07 state legislation summary and underlying state_legislation_summary.csv, reviewed 28 September 2026.",
    calculation="The state total is assigned to each cell by centroid.",
    missing="States with no tracked record are represented by the prepared state total; tracker absence is not proof that no relevant policy exists.",
    caution="A bill count mixes topics and statuses and does not measure policy stringency, enforcement, or project-level applicability.",
    basis="State bill count assigned at the cell centroid"
  ),
  list(
    key="incentive", label="Dedicated state incentive", group="Legislation", unit="0/1",
    definition="Indicator that the state has a dedicated data-center incentive program in the prepared snapshot.",
    source="Layer 07 NCSL-derived state incentive snapshot dated 25 September 2026.",
    calculation="State indicator is assigned to each cell by centroid: 1 = present, 0 = not recorded in the snapshot.",
    missing="The indicator reflects snapshot coverage; 0 should be read as not recorded rather than a permanent policy absence.",
    caution="Presence does not establish eligibility, award receipt, incentive value, compliance, or a causal effect on construction.",
    basis="State indicator assigned at the cell centroid"
  ),
  list(
    key="moratoriums", label="State moratorium tracker", group="Legislation", unit="records",
    definition="Count of tracked state moratorium-related data-center policy records.",
    source="Layer 07 NCSL-derived moratorium snapshot dated 25 September 2026.",
    calculation="The state tracker count is assigned to each cell by centroid.",
    missing="No tracked record is coded 0 within the snapshot; tracker absence is not proof of no local or untracked restriction.",
    caution="Records can differ in status, scope, duration, and legal effect; the count is not a stringency scale.",
    basis="State tracker count assigned at the cell centroid"
  ),
  list(
    key="localActionCount", label="Local-action records", group="Local opposition", unit="records",
    definition="Number of geocoded local government action records whose point falls inside the hexagon.",
    source="FracTracker local-actions GeoPackage used in Layer 08.",
    calculation="Point-in-polygon count of local-action records.",
    missing="No matched tracker point is coded 0; tracker absence is not proof of no local action.",
    caution="Records vary in action type and status, and point placement may represent a jurisdiction rather than a project site.",
    basis="FracTracker local-action point count; zero means no matched tracker record"
  ),
  list(
    key="directOppositionCount", label="Direct facility opposition", group="Local opposition", unit="facilities",
    definition="Number of facility records with direct project-specific opposition evidence.",
    source="Layer 08 matched opposition events derived from opposition_events.csv, reviewed 28 September 2026.",
    calculation="Count of facilities where opposition_direct_facility_flag equals 1 within each cell.",
    missing="Facilities without a direct matched record contribute 0; that is unknown/no match, not confirmed absence of opposition.",
    caution="Direct evidence indicates a documented match and does not provide a standardized intensity, duration, or causal effect.",
    basis="Direct matched facility count; zero means no direct match in the tracker"
  )
)

payload <- list(
  meta = list(
    snapshot = "28 September 2026",
    crs = "ESRI:102008 / North America Albers Equal Area Conic",
    cellWidthKm = cell_size_km,
    cellAreaSqKm = round(as.numeric(st_area(grid[1, ])) / 1e6, 1),
    cellCount = nrow(grid),
    facilityCount = nrow(facilities),
    adjacency = "Queen contiguity on full hexagons",
    note = "Descriptive screening grid. Correlations are not causal estimates; county and state values are repeated across cells by centroid assignment."
  ),
  variables = variables,
  cells = cells,
  facilityHex = facility_hex
)

writeLines(
  paste0("window.HEX_DASHBOARD_DATA=", toJSON(payload, dataframe = "rows", auto_unbox = TRUE, na = "null", digits = NA), ";"),
  file.path(out_dir, "hex-data.js"),
  useBytes = TRUE
)

cat(sprintf("Wrote %d analysis hexagons, %d occupied cells, and %d neighbor links.\n", nrow(grid), sum(grid$facility_count > 0), sum(lengths(neighbors))))
