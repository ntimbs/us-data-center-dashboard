# Sources

[Repository overview](README.md) · [Searchable source directory](https://ntimbs.github.io/us-data-center-dashboard/sources/)

The 23 source entries below cover the published national facility, U.S. hexagon, and Virginia county views. Each entry identifies the publisher, the snapshot used, its contribution to the dashboard, and the original source links.

Facility inventory: **27 October 2026**. Spatial and policy context reviewed: **8 October 2026**. Preliminary 2026 House results retrieved: **5 November 2026**. Source websites may show newer data; these dates describe the versions used by the dashboard.

[Source links CSV](dist/sources/source-links.csv) · [Legislative source register CSV](dist/sources/legislation-sources.csv)

## Facilities

### U.S. Data Centers Tracker

**Publisher:** FracTracker Alliance

**Version / snapshot:** 27 October 2026 workbook; 1,730 facilities

**Used for:** Facility locations, project status, reported MW, operators, power-source labels, acreage, direct community-pushback flags, and timeline fields.

Uses Data_Centers_Database_102726.xlsx, sheet DB_Output_V2. Missing capacity remains unknown. Reported or expected online years and inventory-added dates are not a verified opening history. FracTracker’s source records contain the underlying facility references.

- [Tracker and methodology](https://fractracker.org/data-centers/)
- [Interactive source map](https://experience.arcgis.com/experience/5a4d072ad01449bba5698a80103fb909)

## Power & grid

### eGRID 2024 power plants

**Publisher:** U.S. Environmental Protection Agency

**Version / snapshot:** 2024 data; provisional development snapshot

**Used for:** Plant locations, fuel categories, nameplate capacity, generation, capacity factors, and nearby generation totals.

The dashboard uses a provisional development build, not a final eGRID release. The recorded development commit is linked below. Nearby generation does not establish supply to a data center.

- [Development source at recorded commit](https://github.com/USEPA/egrid/tree/8932a073aa4c0dac227f953e2805d5f64634b57e)
- [EPA eGRID data](https://www.epa.gov/egrid/detailed-data)

### eGRID subregion boundaries

**Publisher:** U.S. Environmental Protection Agency

**Version / snapshot:** 2023 Subregions and Multiple Subregions shapefiles

**Used for:** Facility eGRID subregion assignments and regional grid context.

Boundary vintage differs from the 2024 power-plant data. Geographic assignment does not verify a physical grid connection.

- [EPA mapping files](https://www.epa.gov/egrid/egrid-mapping-files)

### Electric Retail Service Territories

**Publisher:** Homeland Infrastructure Foundation-Level Data (HIFLD)

**Version / snapshot:** Downloaded 21 August 2025

**Used for:** Candidate electric utility territories for facility locations.

Overlapping territories remain ambiguous. A geographic match is not confirmation of the serving utility. The link documents the source dataset; it is not an archived copy of the project download.

- [Dataset documentation (Argonne)](https://gem.anl.gov/tool/layers/electric_retail_service_territories/versions/1/metadata.pdf)

### EIA-861 utility and operational data

**Publisher:** U.S. Energy Information Administration

**Version / snapshot:** 2024 Utility, Operational, and Balancing Authority files

**Used for:** Utility context and reported facility MW relative to a candidate utility’s peak demand.

Utility-relative scale uses an unverified spatial utility candidate. It is not available grid capacity or a deliverability assessment.

- [EIA-861 detailed data](https://www.eia.gov/electricity/data/eia861/)

### State electricity prices

**Publisher:** U.S. EIA; prepared by Dynamical Systems Laboratory

**Version / snapshot:** 2010–2024 series; map displays 2024

**Used for:** State industrial electricity prices, companion total-sector prices, and historical variance in the national and U.S. hex views.

Uses eia861_state_prices_real_2020_with_volatility.csv from the linked research repository. Coverage is the contiguous 48 states. State averages are not a facility tariff or negotiated rate.

- [Prepared price dataset](https://github.com/dynamicalsystemslaboratory/Data-centers-siting-across-U.S.-cities/blob/main/Section%202%20and%204/Data/eia861_state_prices_real_2020_with_volatility.csv)
- [EIA source program](https://www.eia.gov/electricity/data/eia861/)

### Consumer Price Index for All Urban Consumers (CPI-U)

**Publisher:** U.S. Bureau of Labor Statistics

**Version / snapshot:** Historical CPI-U workbook, August 2025 edition; 2020 price base

**Used for:** Inflation-adjusted companion values in the prepared electricity-price series.

The dashboard’s map uses nominal cents per kWh. CPI-adjusted companion values are part of its published price data.

- [BLS historical CPI-U table](https://www.bls.gov/cpi/tables/supplemental-files/home.htm)
- [Price preparation script](https://github.com/dynamicalsystemslaboratory/Data-centers-siting-across-U.S.-cities/blob/main/Section%202%20and%204/energy_price_inflaction_adjusted.py)

### OpenStreetMap power infrastructure

**Publisher:** OpenStreetMap contributors; distributed by Geofabrik

**Version / snapshot:** 7 September 2026 U.S. extract

**Used for:** Transmission-line overlays and line length, plus nearest-line and nearest-substation context.

The national overlay includes lines tagged 200 kV or higher. Contributor coverage and voltage tags vary. Proximity does not establish connection or spare capacity. © OpenStreetMap contributors; ODbL.

- [Geofabrik U.S. extracts](https://download.geofabrik.de/north-america/us.html)
- [Attribution and license](https://www.openstreetmap.org/copyright)

### Queued Up interconnection data

**Publisher:** Lawrence Berkeley National Laboratory

**Version / snapshot:** Project-level generation queue records through 2025

**Used for:** County-level active generation queue MW and contextual queue pressure.

Positive reported capacity components are aggregated by county. These are generation interconnection requests, not data-center load requests or guaranteed future power supply.

- [Queued Up data and methodology](https://emp.lbl.gov/queues)

## Water & hazards

### AWARE water-scarcity factors

**Publisher:** WULCA; county file distributed by Dynamical Systems Laboratory

**Version / snapshot:** Prepared county annual-average factors; context reviewed 8 October 2026

**Used for:** Water-scarcity classes and comparison variables across facility, hexagon, and Virginia county views.

Uses AWARE_US_CF.csv. The exact AWARE release is not recorded in the dashboard metadata; do not assume it is the latest AWARE2.0 release. County factors do not measure facility water use or water rights.

- [Prepared county factors](https://github.com/dynamicalsystemslaboratory/Data-centers-siting-across-U.S.-cities/blob/main/Section%202%20and%204/Data/AWARE_US_CF.csv)
- [AWARE method and versions](https://wulca-waterlca.org/what-is-aware/official-versions/)

### County-level water-use estimates

**Publisher:** U.S. Geological Survey (USGS)

**Version / snapshot:** 2015 estimates; usco2015v2.0.csv

**Used for:** Total county water withdrawal in the hexagon and Virginia county explorers.

Historical withdrawals are separate from water scarcity and do not establish present supply headroom or a specific data center’s consumption.

- [Dataset and citation](https://doi.org/10.5066/F7TB15V5)
- [Water-use report](https://doi.org/10.3133/cir1441)

### National Risk Index

**Publisher:** Federal Emergency Management Agency; county file distributed by Dynamical Systems Laboratory

**Version / snapshot:** Prepared county table; context reviewed 8 October 2026

**Used for:** Overall risk and drought, heat-wave, riverine-flood, and wildfire scores or ratings.

Uses NRI_Table_Counties.csv. Exact NRI release is not recorded in the dashboard metadata. County screening measures are not parcel-level hazard determinations.

- [Prepared county table](https://github.com/dynamicalsystemslaboratory/Data-centers-siting-across-U.S.-cities/blob/main/Section%202%20and%204/Data/NRI_Table_Counties.csv)
- [FEMA National Risk Index](https://www.fema.gov/nri)

## Land & geography

### County Business Patterns

**Publisher:** U.S. Census Bureau

**Version / snapshot:** 2023; NAICS 518210

**Used for:** County counts of data-processing, hosting, and related-services establishments.

Establishments are a broader business measure and should not be read as the dashboard’s physical data-center count.

- [2023 CBP data](https://www.census.gov/data/datasets/2023/econ/cbp/2023-cbp.html)
- [2023 CBP API documentation](https://api.census.gov/data/2023/cbp.html)

### Census boundaries and Gazetteer locations

**Publisher:** U.S. Census Bureau

**Version / snapshot:** 2023 state boundaries; 2024 county boundaries; 2026 Gazetteer files

**Used for:** State outlines, county assignments, area-based measures, Virginia’s 133 counties and independent cities, and the boundary framework for derived hexagons. Gazetteer internal points locate local-action jurisdictions.

The 50 km and 100 km hexagon grids are project-generated in an equal-area projection. Gazetteer points represent jurisdictions, not data-center sites. County and state attributes assigned to cells remain contextual geographic measures.

- [2023 state boundary files](https://www2.census.gov/geo/tiger/TIGER2023/STATE/)
- [2024 county boundary files](https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/)
- [Census Gazetteer files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html)

## Policy & opposition

### Subsidizing Servers: state tax incentives

**Publisher:** National Conference of State Legislatures

**Version / snapshot:** Source updated 1 April 2026; accessed 25 September 2026

**Used for:** Dedicated data-center incentives, electricity-tax treatment, and other state-policy context.

A state incentive flag does not establish project eligibility, receipt, or the value of an award.

- [NCSL incentive tables](https://www.ncsl.org/fiscal/subsidizing-servers-how-states-are-competing-to-attract-data-centers)

### Which States Are Banning Data Centers?

**Publisher:** National Conference of State Legislatures

**Version / snapshot:** Source updated 15 September 2026; accessed 25 September 2026

**Used for:** State moratorium tracker counts and statuses.

Tracked proposals include introduced, failed, vetoed, and other statuses. A tracker entry does not mean a ban is in force.

- [NCSL tracker and bill links](https://www.ncsl.org/fiscal/which-states-are-banning-data-centers)

### State data-center legislation records

**Publisher:** MultiState compilation; LegiScan and linked bill sources

**Version / snapshot:** 2024–April 2026 collection; dashboard context reviewed 8 October 2026

**Used for:** State bill counts, topic filters, source status, and bill-detail links.

The source register below reproduces every bill record in the published dashboard. Topic categories may overlap; bill counts do not measure regulatory stringency. Follow the individual source for subsequent actions.

- [Browse every bill source](#individual-legislative-sources)
- [Download bill source register](dist/sources/legislation-sources.csv)

### U.S. Datacenter Fights event database

**Publisher:** George Ingebretsen and community contributors

**Version / snapshot:** Accessed 18 September 2026; context reviewed 8 October 2026

**Used for:** County and state opposition-event counts and contextual tracker matches.

This opposition-event database is not a representative opinion survey. No tracker match means unknown. Direct facility-pushback flags originate in the FracTracker inventory. Data attribution: CC BY 4.0.

- [Source repository and references](https://github.com/Georgeingebretsen/datacenter-opposition-tracker)
- [Source event data](https://github.com/Georgeingebretsen/datacenter-opposition-tracker/blob/main/site/data/fights.json)

### Local bans, moratoriums, and protective ordinances

**Publisher:** FracTracker Alliance

**Version / snapshot:** Prepared local-action inventory; context reviewed 8 October 2026

**Used for:** Local-action counts and county context in the national, hexagon, and Virginia views.

Uses the project’s geocoded FracTracker local-action workbook. A county action count does not establish that an action applies to a particular facility.

- [FracTracker data and local-action sources](https://fractracker.org/data-centers/)

## Elections

### 2024 Precinct-Level Election Results

**Publisher:** The New York Times

**Version / snapshot:** 2024 election; accessed 15 October 2026

**Used for:** Presidential vote margins and precinct maps loaded by state in the national view.

© The New York Times Company. Precinct coverage and boundary quality vary. The dashboard loads precinct data from NYT and stores only a coverage manifest. Voting is political context, not evidence of views about data centers.

- [Published precinct map](https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html)
- [Data and caveats](https://github.com/nytimes/presidential-precinct-map-2024)
- [Terms and license](https://github.com/nytimes/presidential-precinct-map-2024/blob/main/LICENSE)

### 2024 Pres by CD

**Publisher:** Drew Savicki and contributing election-data researchers

**Version / snapshot:** 2024 presidential election; 435 House districts

**Used for:** Harris, Trump, and all-candidate presidential vote totals by congressional district.

This compiled sheet combines state election sources and contributed calculations. Ten rows have one-vote rounding differences. Margins use all presidential votes as the denominator.

- [Results spreadsheet](https://docs.google.com/spreadsheets/d/1ZHx5E0-5vuXxcZShBgsAl_vwAntkkanGqYQp0owNjoQ/edit?gid=0)

### 2026 U.S. House election results

**Publisher:** Polling Desk, using civicAPI

**Version / snapshot:** Preliminary snapshot retrieved 5 November 2026

**Used for:** Democratic, Republican, and all-candidate House votes, race calls, and reporting estimates.

This snapshot is not live or certified. Four districts have no reported vote totals. Margins use all reported candidate votes; voting does not measure attitudes toward data centers.

- [Polling Desk results](https://polling-desk.com/house-districts)
- [Source CSV](https://polling-desk.com/house-districts.csv)
- [civicAPI](https://civicapi.org/)

### Congressional district boundaries

**Publisher:** U.S. Census Bureau

**Version / snapshot:** 119th Congress (2024 files); 120th Congress (2026 files)

**Used for:** District geometry and facility-to-district assignments for both congressional voting layers.

The presidential layer uses 119th Congress boundaries. The 2026 House layer uses 120th Congress boundaries for 49 states and the unchanged 119th Congress Missouri plan. Four facility points are unassigned in the presidential layer and two in the 2026 House layer.

- [119th Congress cartographic boundaries](https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip)
- [120th Congress TIGER/Line files](https://www2.census.gov/geo/tiger/TIGER2026/CD/)
- [Missouri 119th Congress boundaries](https://www2.census.gov/geo/tiger/TIGER2024/CD/tl_2024_29_cd119.zip)
- [Census boundary notes](https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.html)

## Individual legislative sources

All **547 bill records** from the published dashboard, including their individual source URLs, are available in the [legislative source register](dist/sources/legislation-sources.csv). [Search the bill register on the website](https://ntimbs.github.io/us-data-center-dashboard/sources/#bill-sources). Statuses describe the saved collection, not current law; repeated source URLs are retained as published.

## Project calculations and provenance

Hexagons, density measures, timeline summaries, correlations, regressions, and spatial statistics are project calculations. The measure guides in the hexagon and Virginia views explain the variables and calculations. Original record-level references remain with their source providers. Geographic proximity and county or state context do not establish site-specific utility service, capacity, water rights, policy applicability, or community views.

Source-directory review: **23 November 2026**. This catalogue and the website directory are generated together by [scripts/build_sources.py](scripts/build_sources.py) from [the source catalogue](dist/sources/catalog.json) and the published dashboard data.
