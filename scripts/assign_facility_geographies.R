suppressPackageStartupMessages(library(sf))
sf_use_s2(FALSE)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 4) stop("Usage: Rscript assign_facility_geographies.R POINTS.csv OUTPUT.csv CENSUS_DISTRICTS.shp SITE")
site <- normalizePath(args[4])
points <- read.csv(args[1], colClasses = c(id = "character", lon = "numeric", lat = "numeric"))
locations <- st_as_sf(points, coords = c("lon", "lat"), crs = 4326, remove = FALSE)

one_match <- function(polygons) {
  hits <- st_within(st_transform(locations, st_crs(polygons)), polygons)
  if (any(lengths(hits) > 1)) stop("A facility matched multiple polygons")
  vapply(hits, function(indices) if (length(indices)) indices[1] else NA_integer_, integer(1))
}

hex50 <- st_read(file.path(site, "dist/hex/downloads/us_hex_grid_50km.geojson"), quiet = TRUE)
hex100 <- st_read(file.path(site, "dist/hex/downloads/us_hex_grid_100km.geojson"), quiet = TRUE)
virginia <- st_read(file.path(site, "dist/virginia/downloads/virginia_county_data.geojson"), quiet = TRUE)
county_file <- file.path(dirname(site), "Local Opposition/US Opposition Layer/Layer 08 Local Opposition/US_Data_Centers_Local_Opposition.gpkg")
counties <- st_read(county_file, layer = "queue_counties_2025", quiet = TRUE)
districts <- st_read(args[3], quiet = TRUE)

h50 <- one_match(hex50)
h100 <- one_match(hex100)
va <- one_match(virginia)
county <- one_match(counties)
district <- one_match(districts)

county_values <- c(
  "GEOID", "queue_active_mw", "nri_risk_rating", "nri_drought_risk_rating",
  "nri_riverine_flood_risk_rating", "nri_heat_wave_risk_rating", "nri_wildfire_risk_rating",
  "water_scarcity_class", "aware_annual_average_cf", "cbp_2023_establishments",
  "opposition_county_event_count", "local_action_county_count", "county_facility_density_class"
)
missing_fields <- setdiff(county_values, names(counties))
if (length(missing_fields)) stop(paste("Missing county fields:", paste(missing_fields, collapse = ", ")))

va_aea <- st_transform(virginia, "ESRI:102008")
points_aea <- st_transform(locations, "ESRI:102008")
bbox <- st_bbox(va_aea)
scale <- min((1000 - 84) / (bbox[["xmax"]] - bbox[["xmin"]]), (600 - 68) / (bbox[["ymax"]] - bbox[["ymin"]]))
xy <- st_coordinates(points_aea)

out <- data.frame(
  id = points$id,
  hex50 = as.character(hex50$hex_id[h50]),
  hex100 = as.character(hex100$hex_id[h100]),
  vaCounty = as.character(virginia$county_id[va]),
  vaX = round(42 + (xy[, 1] - bbox[["xmin"]]) * scale, 1),
  vaY = round(34 + (bbox[["ymax"]] - xy[, 2]) * scale, 1),
  districtStateFips = as.character(districts$STATEFP[district]),
  districtNumber = as.character(districts$CD119FP[district]),
  stringsAsFactors = FALSE
)
for (field in county_values) out[[field]] <- counties[[field]][county]
write.csv(out, args[2], row.names = FALSE, na = "")
cat(sprintf("Matched %d/%d to 50 km hexes, %d to 100 km hexes, %d to Virginia counties, %d to national counties, %d to districts\n",
  sum(!is.na(h50)), nrow(out), sum(!is.na(h100)), sum(!is.na(va)), sum(!is.na(county)), sum(!is.na(district))))
