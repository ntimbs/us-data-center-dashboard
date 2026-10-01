suppressPackageStartupMessages(library(sf))
suppressPackageStartupMessages(library(jsonlite))

sf_use_s2(FALSE)

script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]
script_path <- sub("^--file=", "", script_arg)
root <- normalizePath(file.path(dirname(script_path), "..", ".."))
site <- file.path(root, "US_Data_Center_Dashboard")
out_dir <- file.path(site, "dist", "virginia")
dir.create(file.path(out_dir, "downloads"), recursive = TRUE, showWarnings = FALSE)

facility_file <- file.path(root, "Local Opposition", "US Opposition Layer", "Layer 08 Local Opposition", "US_Data_Centers_Local_Opposition.gpkg")
state_file <- file.path(root, "Legislation", "US Legislation Layer", "Layer 07 State Policy", "US_Data_Centers_State_Policy.gpkg")
plant_file <- file.path(root, "Power", "US Power Layer", "Layer 02 eGRID 2024", "US_Data_Centers_Power_Context.gpkg")
grid_file <- file.path(root, "QGIS", "US_OSM_Power_Grid.gpkg")
county_file <- file.path(root, "Resources", "US Resources Layer", "Layer 06 Land and Development Context", "US_Data_Centers_Land_Development.gpkg")
actions_file <- file.path(root, "QGIS", "FracTracker_Local_Actions.gpkg")

target_crs <- "ESRI:102008"
snapshot <- "28 September 2026"

counties <- st_read(county_file, layer = "queue_counties_2025", quiet = TRUE)
counties <- counties[substr(as.character(counties$GEOID), 1, 2) == "51", ]
counties <- st_make_valid(st_transform(counties, target_crs))
counties <- counties[order(counties$GEOID), ]
row.names(counties) <- NULL

county_fields <- c(
  "GEOID", "NAME", "NAMELSAD", "ALAND", "aware_annual_average_cf", "water_scarcity_class",
  "usgs_total_withdrawal_mgd", "nri_risk_score", "nri_drought_risk_score", "nri_wildfire_risk_score",
  "nri_riverine_flood_risk_score", "nri_heat_wave_risk_score", "cbp_2023_establishments", "queue_active_mw"
)
counties <- counties[, county_fields]
counties$county_id <- as.character(counties$GEOID)
counties$county_name <- as.character(counties$NAMELSAD)
counties$short_name <- as.character(counties$NAME)
counties$land_area_sqkm <- as.numeric(counties$ALAND) / 1e6
counties$water_factor <- as.numeric(counties$aware_annual_average_cf)
counties$water_factor[counties$water_factor < 0] <- NA_real_
counties$water_class <- as.character(counties$water_scarcity_class)
counties$water_withdrawal_mgd <- as.numeric(counties$usgs_total_withdrawal_mgd)
counties$risk_score <- as.numeric(counties$nri_risk_score)
counties$drought_score <- as.numeric(counties$nri_drought_risk_score)
counties$wildfire_score <- as.numeric(counties$nri_wildfire_risk_score)
counties$flood_score <- as.numeric(counties$nri_riverine_flood_risk_score)
counties$heat_score <- as.numeric(counties$nri_heat_wave_risk_score)
counties$cbp_establishments <- as.numeric(counties$cbp_2023_establishments)
counties$queue_active_mw <- as.numeric(counties$queue_active_mw)

for (name in c(
  "facility_count", "reported_mw", "known_mw_count", "operating_count", "pipeline_count",
  "direct_opposition_count", "plant_count", "plant_operating_mw", "plant_nameplate_mw",
  "local_action_count", "hv_line_km"
)) counties[[name]] <- 0

facilities <- st_read(facility_file, layer = "data_centers", quiet = TRUE)
facilities <- st_transform(facilities, target_crs)
facility_join <- st_join(facilities, counties[, "county_id"], join = st_within, left = FALSE)
if (nrow(facility_join)) {
  groups <- split(seq_len(nrow(facility_join)), facility_join$county_id)
  pos <- match(names(groups), counties$county_id)
  counties$facility_count[pos] <- vapply(groups, length, integer(1))
  counties$reported_mw[pos] <- vapply(groups, function(ii) sum(as.numeric(facility_join$mw_mid[ii]), na.rm = TRUE), numeric(1))
  counties$known_mw_count[pos] <- vapply(groups, function(ii) sum(!is.na(as.numeric(facility_join$mw_mid[ii]))), integer(1))
  counties$operating_count[pos] <- vapply(groups, function(ii) sum(facility_join$project_phase[ii] == "Operating", na.rm = TRUE), integer(1))
  counties$pipeline_count[pos] <- vapply(groups, function(ii) sum(facility_join$activity_group[ii] == "Active pipeline", na.rm = TRUE), integer(1))
  counties$direct_opposition_count[pos] <- vapply(groups, function(ii) sum(as.numeric(facility_join$opposition_direct_facility_flag[ii]) == 1, na.rm = TRUE), integer(1))
}

plants <- st_read(plant_file, layer = "egrid_power_plants_2024", quiet = TRUE)
plants <- st_transform(plants, target_crs)
plant_join <- st_join(plants, counties[, "county_id"], join = st_within, left = FALSE)
if (nrow(plant_join)) {
  groups <- split(seq_len(nrow(plant_join)), plant_join$county_id)
  pos <- match(names(groups), counties$county_id)
  counties$plant_count[pos] <- vapply(groups, length, integer(1))
  counties$plant_operating_mw[pos] <- vapply(groups, function(ii) sum(as.numeric(plant_join$operating_mw[ii]), na.rm = TRUE), numeric(1))
  counties$plant_nameplate_mw[pos] <- vapply(groups, function(ii) sum(as.numeric(plant_join$NAMEPCAP[ii]), na.rm = TRUE), numeric(1))
}

actions <- st_read(actions_file, layer = "local_actions_by_status", quiet = TRUE)
actions <- st_transform(actions, target_crs)
action_join <- st_join(actions, counties[, "county_id"], join = st_within, left = FALSE)
if (nrow(action_join)) {
  counts <- table(action_join$county_id)
  counties$local_action_count[match(names(counts), counties$county_id)] <- as.integer(counts)
}

message("Reading Virginia high-voltage transmission lines...")
lines <- st_read(
  grid_file,
  query = "SELECT geom, osm_id, voltage_max_kv FROM transmission_lines WHERE voltage_max_kv >= 200",
  quiet = TRUE
)
lines <- st_transform(lines, target_crs)
lines <- lines[lengths(st_intersects(lines, st_union(counties))) > 0, ]
message("Intersecting high-voltage lines with Virginia counties...")
pieces <- suppressWarnings(st_intersection(counties[, "county_id"], lines))
if (nrow(pieces)) {
  lengths_km <- as.numeric(st_length(pieces)) / 1000
  sums <- tapply(lengths_km, pieces$county_id, sum, na.rm = TRUE)
  counties$hv_line_km[match(names(sums), counties$county_id)] <- as.numeric(sums)
}

neighbors <- st_touches(counties)
counties$neighbor_ids <- vapply(neighbors, function(ii) paste(counties$county_id[ii], collapse = ";"), character(1))

centers <- st_centroid(counties)
centers_ll <- st_transform(centers, 4326)
center_xy_ll <- st_coordinates(centers_ll)
counties$center_lon <- center_xy_ll[, 1]
counties$center_lat <- center_xy_ll[, 2]

bbox <- st_bbox(counties)
map_width <- 1000
map_height <- 600
pad_x <- 42
pad_y <- 34
scale_factor <- min(
  (map_width - 2 * pad_x) / (bbox[["xmax"]] - bbox[["xmin"]]),
  (map_height - 2 * pad_y) / (bbox[["ymax"]] - bbox[["ymin"]])
)
screen_xy <- function(coords) {
  cbind(
    pad_x + (coords[, 1] - bbox[["xmin"]]) * scale_factor,
    pad_y + (bbox[["ymax"]] - coords[, 2]) * scale_factor
  )
}

# Ramer-Douglas-Peucker simplification in screen-pixel space. Source county
# boundaries carry far more vertices than a 1000x600 viewBox can show; this
# mirrors the tolerance-based simplify() used for state outlines in
# scripts/build_data.py and cuts rendered path size by ~95%+ with <0.5% area
# drift, without touching the underlying analytical geometry.
simplify_ring <- function(xy, tolerance = 0.5) {
  n <- nrow(xy)
  if (n <= 4) return(xy)
  closed <- isTRUE(all.equal(xy[1, ], xy[n, ]))
  working <- if (closed) xy[-n, , drop = FALSE] else xy
  m <- nrow(working)
  if (m <= 3) return(xy)

  perp_dist <- function(p, a, b) {
    if (a[1] == b[1] && a[2] == b[2]) return(sqrt(sum((p - a)^2)))
    abs((b[2] - a[2]) * p[1] - (b[1] - a[1]) * p[2] + b[1] * a[2] - b[2] * a[1]) /
      sqrt((b[2] - a[2])^2 + (b[1] - a[1])^2)
  }

  rdp <- function(pts) {
    k <- nrow(pts)
    if (k <= 2) return(pts)
    dists <- vapply(seq(2, k - 1), function(i) perp_dist(pts[i, ], pts[1, ], pts[k, ]), numeric(1))
    max_dist <- max(dists)
    if (max_dist > tolerance) {
      index <- which.max(dists) + 1
      left <- rdp(pts[seq_len(index), , drop = FALSE])
      right <- rdp(pts[seq(index, k), , drop = FALSE])
      rbind(left[-nrow(left), , drop = FALSE], right)
    } else {
      rbind(pts[1, ], pts[k, ])
    }
  }

  result <- rdp(working)
  if (closed) result <- rbind(result, result[1, ])
  result
}

geometry_path <- function(feature) {
  polygons <- suppressWarnings(st_cast(feature, "POLYGON"))
  parts <- character(0)
  for (j in seq_len(nrow(polygons))) {
    coords <- st_coordinates(polygons[j, ])
    if (!nrow(coords)) next
    ring_col <- if ("L1" %in% colnames(coords)) "L1" else NULL
    rings <- if (is.null(ring_col)) list(coords) else split(as.data.frame(coords), coords[, ring_col])
    for (ring in rings) {
      xy <- screen_xy(as.matrix(ring[, c("X", "Y")]))
      xy <- simplify_ring(xy)
      if (nrow(xy) < 3) next
      parts <- c(parts, paste0("M", paste0(round(xy[, 1], 1), ",", round(xy[, 2], 1), collapse = "L"), "Z"))
    }
  }
  paste(parts, collapse = "")
}
counties$path <- vapply(seq_len(nrow(counties)), function(i) geometry_path(counties[i, ]), character(1))

facility_screen <- screen_xy(st_coordinates(facility_join))
facility_points <- lapply(seq_len(nrow(facility_join)), function(i) list(
  id = as.character(facility_join$facility_id[i]),
  name = as.character(facility_join$facility_name[i]),
  countyId = as.character(facility_join$county_id[i]),
  phase = as.character(facility_join$project_phase[i]),
  mw = if (is.na(facility_join$mw_mid[i])) NULL else round(as.numeric(facility_join$mw_mid[i]), 2),
  x = round(facility_screen[i, 1], 1),
  y = round(facility_screen[i, 2], 1)
))

numeric_round <- c(
  "center_lon", "center_lat", "land_area_sqkm", "reported_mw", "plant_operating_mw",
  "plant_nameplate_mw", "hv_line_km", "water_factor", "water_withdrawal_mgd", "risk_score",
  "drought_score", "wildfire_score", "flood_score", "heat_score", "queue_active_mw"
)
for (name in numeric_round) counties[[name]] <- round(as.numeric(counties[[name]]), 2)

export_fields <- c(
  "county_id", "county_name", "short_name", "center_lon", "center_lat", "land_area_sqkm", "neighbor_ids",
  "facility_count", "reported_mw", "known_mw_count", "operating_count", "pipeline_count",
  "direct_opposition_count", "plant_count", "plant_operating_mw", "plant_nameplate_mw", "hv_line_km",
  "queue_active_mw", "water_factor", "water_class", "water_withdrawal_mgd", "risk_score",
  "drought_score", "wildfire_score", "flood_score", "heat_score", "cbp_establishments", "local_action_count"
)
write.csv(st_drop_geometry(counties[, export_fields]), file.path(out_dir, "downloads", "virginia_county_data.csv"), row.names = FALSE, na = "")
st_write(st_transform(counties[, export_fields], 4326), file.path(out_dir, "downloads", "virginia_county_data.geojson"), delete_dsn = TRUE, quiet = TRUE)

short_map <- c(
  county_id = "id", county_name = "countyName", short_name = "shortName", center_lon = "lon", center_lat = "lat",
  land_area_sqkm = "landAreaSqKm", neighbor_ids = "neighbors", facility_count = "facilityCount",
  reported_mw = "reportedMw", known_mw_count = "knownMwCount", operating_count = "operatingCount",
  pipeline_count = "pipelineCount", direct_opposition_count = "directOppositionCount", plant_count = "plantCount",
  plant_operating_mw = "plantOperatingMw", plant_nameplate_mw = "plantNameplateMw", hv_line_km = "hvLineKm",
  queue_active_mw = "queueActiveMw", water_factor = "waterFactor", water_class = "waterClass",
  water_withdrawal_mgd = "waterWithdrawalMgd", risk_score = "riskScore", drought_score = "droughtScore",
  wildfire_score = "wildfireScore", flood_score = "floodScore", heat_score = "heatScore",
  cbp_establishments = "cbpEstablishments", local_action_count = "localActionCount", path = "path"
)
cells <- st_drop_geometry(counties[, names(short_map)])
names(cells) <- unname(short_map)
cells$neighbors <- strsplit(cells$neighbors, ";", fixed = TRUE)
cells$neighbors <- lapply(cells$neighbors, function(x) x[nzchar(x)])

hex_text <- paste(readLines(file.path(site, "dist", "hex", "hex-data.js"), warn = FALSE), collapse = "\n")
hex_text <- sub("^window\\.HEX_DASHBOARD_DATA=", "", hex_text)
hex_text <- sub(";[[:space:]]*$", "", hex_text)
all_variables <- fromJSON(hex_text, simplifyVector = FALSE)$variables
keep_keys <- c(
  "facilityCount", "reportedMw", "operatingCount", "pipelineCount", "plantOperatingMw", "plantCount",
  "hvLineKm", "queueActiveMw", "waterFactor", "waterWithdrawalMgd", "droughtScore", "heatScore",
  "cbpEstablishments", "localActionCount", "directOppositionCount"
)
variables <- Filter(function(v) v$key %in% keep_keys, all_variables)
variables <- variables[match(keep_keys, vapply(variables, function(v) v$key, character(1)))]

adapt_county_text <- function(text) {
  text <- gsub("the county containing the cell centroid", "the county", text, fixed = TRUE)
  text <- gsub("inside the hexagon", "inside the county", text, fixed = TRUE)
  text <- gsub("within the hexagon", "within the county", text, fixed = TRUE)
  text <- gsub("within each cell", "within each county", text, fixed = TRUE)
  text <- gsub("with each cell", "with each county", text, fixed = TRUE)
  text <- gsub("within-cell", "within-county", text, fixed = TRUE)
  text <- gsub("one cell", "one county", text, fixed = TRUE)
  text <- gsub("by cell", "by county", text, fixed = TRUE)
  text <- gsub("Each cell", "Each county", text, fixed = TRUE)
  text <- gsub("A cell", "A county", text, fixed = TRUE)
  text <- gsub("Cells", "Counties", text, fixed = TRUE)
  text
}
for (i in seq_along(variables)) {
  for (field in c("definition", "source", "calculation", "missing", "caution", "basis")) {
    variables[[i]][[field]] <- adapt_county_text(variables[[i]][[field]])
  }
}
set_variable_text <- function(key, field, value) {
  i <- which(vapply(variables, function(v) v$key, character(1)) == key)
  if (length(i)) variables[[i]][[field]] <<- value
}
set_variable_text("queueActiveMw", "calculation", "Positive reported MW fields are summed in the source interconnection records and used directly as a county attribute.")
set_variable_text("queueActiveMw", "basis", "Berkeley Lab county-level active-queue MW")
set_variable_text("waterFactor", "calculation", "The county AWARE value is used directly. Negative source sentinel values are treated as missing.")
set_variable_text("waterFactor", "basis", "County AWARE annual-average characterization factor")
set_variable_text("waterWithdrawalMgd", "calculation", "The published county total is used directly; it is not divided by county area.")
set_variable_text("waterWithdrawalMgd", "basis", "County USGS total withdrawal")
set_variable_text("droughtScore", "calculation", "The published FEMA NRI county score is used directly.")
set_variable_text("droughtScore", "basis", "County FEMA NRI drought-risk score")
set_variable_text("heatScore", "calculation", "The published FEMA NRI county score is used directly.")
set_variable_text("heatScore", "basis", "County FEMA NRI heat-wave-risk score")
set_variable_text("cbpEstablishments", "calculation", "The published 2023 County Business Patterns county count is used directly.")
set_variable_text("cbpEstablishments", "basis", "County CBP 2023 establishment count")
set_variable_text("facilityCount", "source", sprintf("Layer 08 data_centers table derived from Data_Centers_Database.xlsx (DB_Output_V2); %d of 1,669 national records fall within Virginia county boundaries.", nrow(facility_join)))
set_variable_text("reportedMw", "source", sprintf("Layer 08 field mw_mid for the %d Virginia facility records; values originate in the project database.", nrow(facility_join)))
set_variable_text("operatingCount", "source", sprintf("Layer 08 project_phase field for the %d Virginia facility records.", nrow(facility_join)))
set_variable_text("pipelineCount", "source", sprintf("Layer 08 activity_group derived from project_phase for the %d Virginia facility records.", nrow(facility_join)))
set_variable_text("plantOperatingMw", "source", sprintf("U.S. EPA eGRID 2024 operating_mw field for %d Virginia power-plant records.", nrow(plant_join)))
set_variable_text("plantCount", "source", sprintf("U.S. EPA eGRID 2024; %d power-plant records fall within Virginia county boundaries.", nrow(plant_join)))
set_variable_text("localActionCount", "source", sprintf("FracTracker local-actions GeoPackage used in Layer 08; %d point records fall within Virginia county boundaries.", nrow(action_join)))
set_variable_text("directOppositionCount", "source", sprintf("Layer 08 matched facility opposition derived from opposition_events.csv; %d Virginia facility records have the direct-opposition flag.", sum(counties$direct_opposition_count, na.rm = TRUE)))

state_policy <- st_read(state_file, layer = "state_legislation_summary", quiet = TRUE)
state_policy <- st_drop_geometry(state_policy[state_policy$state == "VA", ])
policy <- list(
  totalBills = as.numeric(state_policy$policy_total_bills[1]),
  billsPassed = as.numeric(state_policy$policy_bills_pass[1]),
  incentive = as.numeric(state_policy$policy_dedicated_incentive_flag[1]),
  electricityTax = as.numeric(state_policy$policy_electricity_tax_incentive_flag[1]),
  moratoriumRecords = as.numeric(state_policy$policy_moratorium_tracker_count[1])
)

meta <- list(
  snapshot = snapshot,
  crs = "ESRI:102008 / North America Albers Equal Area Conic",
  geography = "Virginia counties and independent cities",
  countyCount = nrow(counties),
  facilityCount = nrow(facility_join),
  plantCount = nrow(plant_join),
  actionCount = nrow(action_join),
  adjacency = "Queen contiguity",
  policy = policy,
  note = "Point and line measures are aggregated to county boundaries. Resource and queue measures are native county attributes. Virginia state-policy measures are shown as context because they do not vary across counties."
)

cell_records <- lapply(seq_len(nrow(cells)), function(i) {
  setNames(lapply(names(cells), function(name) {
    column <- cells[[name]]
    if (is.list(column)) column[[i]] else column[i]
  }), names(cells))
})
payload <- list(meta = meta, variables = variables, cells = cell_records, facilities = facility_points)
json <- toJSON(payload, auto_unbox = TRUE, na = "null", null = "null", digits = 8)
writeLines(paste0("window.VA_COUNTY_DATA=", json, ";"), file.path(out_dir, "county-data.js"), useBytes = TRUE)

message(sprintf(
  "Wrote %d Virginia county equivalents with %d facilities, %d power plants, and %d local actions.",
  nrow(counties), nrow(facility_join), nrow(plant_join), nrow(action_join)
))
