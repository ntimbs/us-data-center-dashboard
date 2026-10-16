# U.S. Data Center Ecosystem Tracker

The UVA National Security Institute’s U.S. Data Center Dashboard is a living ecosystem tracker of the infrastructure behind AI. Currently, we map data centers alongside a variety of energy, water, climate, and policy considerations. Its interactive interface helps researchers and the public explore how material constraints and community concerns may shape U.S. AI infrastructure. 

Designed to be a living and customizable tool ,the U.S. Data Center Ecosystem Tracker can evolve with feedback from researchers, community organizers, and others working to understand these impacts. The project will also provide a foundation for future comparative analysis of U.S. and Chinese capabilities as that work develops. 

**Live dashboard:** https://ntimbs.github.io/us-data-center-dashboard/


## Dashboard views

- **[National facility view](https://ntimbs.github.io/us-data-center-dashboard/):** facility status, reported capacity, power source, eGRID power plants by generation source, optional 200+ kV transmission lines, 2024 state industrial electricity prices, separate AWARE water-scarcity and FEMA hazard themes, legislation, local opposition, and a cumulative facility timeline.
- **[U.S. hexagon spatial explorer](https://ntimbs.github.io/us-data-center-dashboard/hex/):** equal-area cells for comparing data-center activity with contextual measures—including state industrial electricity prices—and spatial statistics, with facility measures re-aggregated through the selected timeline year.
- **[Virginia county explorer](https://ntimbs.github.io/us-data-center-dashboard/virginia/):** county-level data-center and contextual measures for Virginia, with a cumulative facility timeline.

The public dashboard is built in the `dist` directory and published through the repository's `gh-pages` branch.

The timeline offers an inventory-added basis and an online/active basis. The latter uses a reported or expected online year when available and also includes records currently classified Operating or Expanding no later than their inventory-added year. It is a cumulative screening timeline, not a verified history of facility openings or status transitions.

### 2024 presidential precinct vote layer

In the national view, choose **Opposition → 2024 presidential precinct vote**, then select a state to load its precinct boundaries and results directly from The New York Times. Click a precinct for Harris, Trump, and total presidential votes, margin, and whether its boundary is official. Colors use `(Harris votes − Trump votes) / all presidential votes`, not a two-party denominator. This is political context and does not measure support for or opposition to data centers. Coverage and boundary quality vary by state.

Citation: “2024 Precinct-Level Election Results.” *New York Times*, [published precinct map](https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html). Accessed October 15, 2026. © The New York Times Company. [Source data and caveats](https://github.com/nytimes/presidential-precinct-map-2024) · [terms and license](https://github.com/nytimes/presidential-precinct-map-2024/blob/main/LICENSE). One source record lacks display geometry. This repository contains only an aggregate coverage manifest, not the precinct dataset. To rebuild that manifest from a local copy of the source, place `precincts-with-results` and `precincts-with-results.topojson.gz` in `../NYT_2024_vote_data/` and run `PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_precinct_votes.py` from this directory.

### 2024 presidential congressional district vote layer

Choose **Opposition → 2024 presidential congressional district vote** for all 435 House districts. Select a state to focus the map and see its data centers counted in the same seven vote-margin categories; select a district to see its Harris, Trump, and total presidential votes plus the number of filtered data centers in that district. The margin is `(Harris votes − Trump votes) / all presidential votes`. This layer uses [2024 Pres by CD, curated by Drew Savicki](https://docs.google.com/spreadsheets/d/1ZHx5E0-5vuXxcZShBgsAl_vwAntkkanGqYQp0owNjoQ/edit?gid=0) and [Census Bureau 119th congressional district boundaries](https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html), rather than aggregating NYT precinct shapes. The district result sheet combines state election sources and contributed district calculations. Ten district rows have one-vote rounding differences between their candidate subtotals and published totals. The map assigns facility points to the official 2024 district geometry; four facility points in the current inventory lie outside their stated state's mapped district boundary and remain in a separate category. Voting is political context, not evidence of support for or opposition to data centers.

The committed `dist/votes/districts.json` is a simplified display layer with the district vote totals and facility assignments. To rebuild it, download the [CSV export](https://docs.google.com/spreadsheets/d/1ZHx5E0-5vuXxcZShBgsAl_vwAntkkanGqYQp0owNjoQ/export?format=csv&gid=0) and [Census cartographic boundary ZIP](https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip), install `pyshp` and `shapely`, and run `python3 scripts/build_congressional_votes.py RESULTS.csv BOUNDARIES.zip`. The source downloads are not committed.
