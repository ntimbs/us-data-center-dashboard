suppressPackageStartupMessages(library(sf))
sf_use_s2(FALSE)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 3) stop("Usage: Rscript prepare_2026_house_boundaries.R ZIPS_DIR POINTS.csv OUTPUT_DIR")
zip_dir <- args[1]
out_dir <- args[3]
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

fips <- c("01", "02", "04", "05", "06", "08", "09", "10", "12", "13", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56")
abbr <- c("AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY")
by_fips <- setNames(abbr, fips)

read_state <- function(fips_code) {
  # Census cautions that its 2026 Missouri shapefile still depicts a rejected
  # plan. Missouri used its unchanged 119th Congress map in the 2026 election.
  old_missouri <- fips_code == "29"
  file <- if (old_missouri) "tl_2024_29_cd119.zip" else sprintf("tl_2026_%s_cd120.zip", fips_code)
  path <- file.path(zip_dir, file)
  if (!file.exists(path)) stop(paste("Missing Census shapefile:", path))
  data <- st_read(paste0("/vsizip/", normalizePath(path)), quiet = TRUE)
  number <- if (old_missouri) data$CD119FP else data$CD120FP
  valid <- grepl("^[0-9]{2}$", number)
  data <- data[valid, ]
  number <- number[valid]
  data$district <- paste0(by_fips[[fips_code]], "-", ifelse(number == "00", "AL", number))
  if (anyDuplicated(data$district)) stop(paste("Duplicate districts in", file))
  data[, "district"]
}

districts <- do.call(rbind, lapply(fips, read_state))
districts <- st_transform(districts, 4326)
if (nrow(districts) != 435 || anyDuplicated(districts$district)) stop(sprintf("Expected 435 unique voting districts; found %d rows and %d unique IDs", nrow(districts), length(unique(districts$district))))

points <- read.csv(args[2], colClasses = c(id = "character", state = "character", lon = "numeric", lat = "numeric"))
sites <- st_as_sf(points, coords = c("lon", "lat"), crs = 4326, remove = FALSE)
matches <- st_covered_by(sites, districts)
assignments <- vapply(seq_along(matches), function(index) {
  hit <- matches[[index]]
  if (length(hit)) hit <- hit[substr(districts$district[hit], 1, 2) == points$state[index]]
  if (length(hit) > 1) stop(paste("Multiple district matches for", points$id[index]))
  if (length(hit)) districts$district[hit] else ""
}, character(1))
write.csv(data.frame(id = points$id, district = assignments), file.path(out_dir, "assignments.csv"), row.names = FALSE)

display <- st_transform(districts, "ESRI:102008")
display <- st_simplify(display, dTolerance = 350, preserveTopology = TRUE)
display <- st_transform(display, 4326)
st_write(display, file.path(out_dir, "districts.geojson"), driver = "GeoJSON", quiet = TRUE, delete_dsn = TRUE)
cat(sprintf("Prepared %d districts and %d/%d facility assignments\n", nrow(districts), sum(assignments != ""), length(assignments)))
