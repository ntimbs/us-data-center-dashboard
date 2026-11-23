# Source coverage, links, and reuse audit

Reviewed **23 November 2026** against the published dashboard and its preparation code.

[Repository overview](README.md) · [Full source catalogue](SOURCES.md) · [Searchable Sources page](https://ntimbs.github.io/us-data-center-dashboard/sources/) · [URL check results (CSV)](dist/sources/link-checks.csv)

The catalogue now covers all dataset inputs identified in this review of the national, U.S. hexagon, and Virginia county views, including all three election layers. **The sources are not all openly licensed, and not every external URL could be verified.** Public access, successful HTTP responses, and permission to reuse are separate questions.

## Coverage and corrections

The review traced the published facility fields, state policy and price records, power-plant and transmission overlays, all 19 hexagon variables, all 15 Virginia variables, and the precinct and district election layers to their preparation inputs. It also inspected the available local source metadata and original legislation workbook. The 23 catalogue entries cover:

| Dashboard data | Sources represented |
| --- | --- |
| Facility locations, status, reported MW, acreage, dates, and direct pushback flags | FracTracker facility inventory |
| Power plants, fuel, generation, and subregions | EPA eGRID provisional 2024 plant data and 2023 boundaries |
| Utility candidates and relative peak-demand scale | HIFLD territories and EIA-861 utility/operational data |
| State electricity prices and companion adjusted series | EIA, Dynamical Systems Laboratory prepared files, and BLS CPI-U |
| Transmission, substations, and generation queues | OpenStreetMap/Geofabrik; Berkeley Lab and GridTracker |
| Water scarcity, historical withdrawals, and hazards | WULCA AWARE prepared county file; USGS 2015 water use; FEMA NRI prepared county file |
| Establishments and geography | Census CBP, state/county boundaries, Gazetteer, and TIGERweb |
| Policy and local action context | NCSL incentive and moratorium trackers; LegiScan-based bill compilation; FracTracker local actions |
| County/state opposition-event context | Cam Acosta and George Ingebretsen’s event database |
| Elections | NYT precinct results; Drew Savicki’s presidential district compilation; Polling Desk/civicAPI House results; Census congressional boundaries |

Corrections made during this audit:

- Added the Census TIGERweb reservation-point fallback used to geocode the Eastern Cherokee local-action jurisdiction, and the original HIFLD ArcGIS item/service links.
- Added GridTracker to the Queued Up attribution and Cam Acosta to the opposition-event attribution.
- Corrected the bill collection’s provenance to a project compilation based principally on LegiScan. The original workbook’s methodology supports this; the previous MultiState label and the app’s “NCSL-derived” bill label were unsupported. NCSL remains the source of the separate incentive and moratorium trackers.
- Corrected the hexagon and Virginia measure descriptions: direct facility-pushback flags come from FracTracker’s `community_pushback` field. The separate opposition-event database supplies county/state event context.
- Replaced eight unreliable GitHub file-view links with successfully checked direct-file URLs. Added reuse terms or an explicit uncertainty to every catalogue entry.

The bill register contains **547 published records and 544 distinct source URLs**, all on LegiScan. The original 549-row workbook includes two federal records omitted from the state dashboard. No published bill record is missing from the register.

This is an inventory of the dashboard’s data inputs, not a recursive bibliography of every news article, petition, permit, state election record, or bill text cited within upstream datasets. Those underlying references remain with their providers. Fonts, analytics, logos, and other presentation assets are outside this data-source audit. Derived hexagons, aggregates, timelines, and statistical calculations are project outputs, not additional external datasets.

## Link-check results

The final register contains **649 distinct external URLs**: 54 catalogue URLs, one additional Census reference already linked by the app/README, 50 NYT runtime precinct feeds, and 544 bill URLs. Counts below reflect the final URLs after the direct-file replacements.

| URL group | HTTP success | Could not verify |
| --- | ---: | ---: |
| Catalogue and additional Census reference | 52 | 3 |
| NYT runtime state/DC precinct feeds | 50 | 0 |
| LegiScan bill URLs | 0 | 544 |
| **Total** | **102** | **547** |

All 50 precinct feeds returned HTTP 200 and the expected gzip header. Catalogue successes were checked for obvious access-challenge/error titles. **No final checked URL returned HTTP 404 or 410.** This does not certify blocked or unrequested URLs as working.

The three non-bill URLs returning HTTP 403 were the [Queued Up landing page](https://emp.lbl.gov/queues), [Argonne’s HIFLD metadata PDF](https://gem.anl.gov/tool/layers/electric_retail_service_territories/versions/1/metadata.pdf), and the [NYT published precinct article](https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html). Queued Up and the Argonne documentation could also be read through the web research tool, but their direct HTTP checks remained blocked. The original HIFLD item/service, NYT repository/license, and NYT data feeds did respond successfully.

LegiScan returned HTTP 403 for **six requests**. Further requests were stopped at the host access-denial threshold; a concurrent in-flight request accounts for the sixth response. The remaining **538 URLs were not requested**. All 544 bill URLs therefore remain unverified, rather than being labeled broken or successfully checked. A working provider homepage would not verify each bill URL.

The [CSV](dist/sources/link-checks.csv) preserves the requested URL, context, HTTP outcome, redirect destination where available, and check date. Checks use GET requests, follow redirects, and read the first 12 KB rather than downloading entire datasets. They establish reachability and basic content type, not a full integrity check, browser compatibility guarantee, or permanent availability. Local Sources-page targets and anchors were checked separately.

To repeat the HTTP checks, run `python3 scripts/check_source_links.py`; inspect the new results before updating this dated report. Access controls and transient errors can produce different results on subsequent runs.

## Licensing and reuse

“Open source” normally describes software. For these datasets, the useful distinctions are public-domain data, an explicit open-data license, restricted use, and unverified terms. **There is no basis for a blanket open-source or open-data claim for this dashboard’s inputs.**

- [FracTracker’s tracker terms](https://fractracker.org/data-centers/) permit noncommercial sharing with credit.
- The [NYT data agreement](https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/LICENSE) restricts use and redistribution, including noncommercial conditions and an editorial exception.
- [NCSL’s terms](https://www.ncsl.org/terms-of-use) reserve rights and do not provide a general open-data license.
- Open examples include [OpenStreetMap’s ODbL](https://www.openstreetmap.org/copyright), [CC BY 4.0 Queued Up data](https://emp.lbl.gov/queues), and the [opposition tracker’s CC BY 4.0 data](https://raw.githubusercontent.com/Georgeingebretsen/datacenter-opposition-tracker/main/LICENSE). Attribution and other license conditions still apply.

Each entry below links to the source card containing its evidence and qualifications.

| Source | Reuse finding |
| --- | --- |
| [U.S. Data Centers Tracker](https://ntimbs.github.io/us-data-center-dashboard/sources/#facilities) | Restricted: noncommercial sharing |
| [eGRID 2024 power plants](https://ntimbs.github.io/us-data-center-dashboard/sources/#egrid-plants) | Public-domain EPA data; MIT code |
| [eGRID subregion boundaries](https://ntimbs.github.io/us-data-center-dashboard/sources/#egrid-regions) | Public-domain EPA data |
| [Electric Retail Service Territories](https://ntimbs.github.io/us-data-center-dashboard/sources/#utility-territories) | Public use: no use restrictions in metadata |
| [EIA-861 utility and operational data](https://ntimbs.github.io/us-data-center-dashboard/sources/#eia-utilities) | Public-domain EIA data |
| [State electricity prices](https://ntimbs.github.io/us-data-center-dashboard/sources/#electricity-prices) | Mixed: EIA public domain; prepared-file license unverified |
| [Consumer Price Index for All Urban Consumers (CPI-U)](https://ntimbs.github.io/us-data-center-dashboard/sources/#cpi) | Public-domain BLS data |
| [OpenStreetMap power infrastructure](https://ntimbs.github.io/us-data-center-dashboard/sources/#osm) | Open data: ODbL 1.0 |
| [Queued Up interconnection data](https://ntimbs.github.io/us-data-center-dashboard/sources/#queues) | Open data: CC BY 4.0 |
| [AWARE water-scarcity factors](https://ntimbs.github.io/us-data-center-dashboard/sources/#aware) | Unverified for the exact prepared snapshot |
| [County-level water-use estimates](https://ntimbs.github.io/us-data-center-dashboard/sources/#usgs-water) | Public-domain USGS data |
| [National Risk Index](https://ntimbs.github.io/us-data-center-dashboard/sources/#fema-nri) | Unverified for the exact prepared snapshot |
| [County Business Patterns](https://ntimbs.github.io/us-data-center-dashboard/sources/#cbp) | Federal statistical data; Census use conditions |
| [Census boundaries and Gazetteer locations](https://ntimbs.github.io/us-data-center-dashboard/sources/#census-geography) | Federal geographic data; Census acknowledgement |
| [Subsidizing Servers: state tax incentives](https://ntimbs.github.io/us-data-center-dashboard/sources/#ncsl-incentives) | Restricted: NCSL rights reserved |
| [Which States Are Banning Data Centers?](https://ntimbs.github.io/us-data-center-dashboard/sources/#ncsl-moratoria) | Restricted: NCSL rights reserved |
| [State data-center legislation records](https://ntimbs.github.io/us-data-center-dashboard/sources/#legislation) | Unverified: compilation and provider terms |
| [U.S. Datacenter Fights event database](https://ntimbs.github.io/us-data-center-dashboard/sources/#opposition-events) | Open data: CC BY 4.0; code: MIT |
| [Local bans, moratoriums, and protective ordinances](https://ntimbs.github.io/us-data-center-dashboard/sources/#local-actions) | Unverified workbook; provider has noncommercial terms |
| [2024 Precinct-Level Election Results](https://ntimbs.github.io/us-data-center-dashboard/sources/#nyt-precincts) | Restricted: NYT noncommercial data agreement |
| [2024 Pres by CD](https://ntimbs.github.io/us-data-center-dashboard/sources/#presidential-districts) | Unverified: no explicit open license found |
| [2026 U.S. House election results](https://ntimbs.github.io/us-data-center-dashboard/sources/#house-results) | Reuse allowed with attribution: civicAPI terms |
| [Congressional district boundaries](https://ntimbs.github.io/us-data-center-dashboard/sources/#district-boundaries) | Federal geographic data; Census acknowledgement |

The exact AWARE and FEMA prepared-file releases remain unrecorded. No repository-wide license was found in the Dynamical Systems Laboratory distribution repository, and no explicit open license was found for the Drew Savicki spreadsheet or the LegiScan-based compilation. A current upstream license cannot automatically establish the terms of an unidentified historical copy. The separately prepared FracTracker local-action workbook also lacks a recorded workbook-specific license.

The project repository itself has no `LICENSE` file. Making code or data visible on GitHub does not, by itself, grant an open-source license. This audit records source terms; it does not relicense upstream material or establish permission for every derivative use.

## Validation and remaining limits

The generated website catalogue, GitHub catalogue, and source-link CSV contain the same 23 entries and reuse findings. The legislative CSV matches all 547 published bill records. Only attribution text changed in the map data files; their numeric and geographic values are unchanged. Internal source-directory links and fragments resolve locally.

To close the remaining gaps, the exact historical licenses/provenance of the uncertain prepared files would need to be recovered, and LegiScan bill destinations plus the blocked publisher pages would need successful verification in an allowed access context. The catalogue explicitly retains these uncertainties rather than asserting that every link works or every source is open.
