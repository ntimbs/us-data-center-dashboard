"""Build the GitHub catalogue, public source directory, and bill register.

Run after editing dist/sources/catalog.json or refreshing dashboard-data.js.
Only Python's standard library is required; no local research files are needed.
"""

import csv
import json
from collections import defaultdict
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/sources"


def link(label, url):
    parsed = urlsplit(url)
    if parsed.scheme not in ("", "https", "http") or (parsed.scheme and not parsed.netloc):
        raise ValueError(f"Invalid source link: {url}")
    external = ' target="_blank" rel="noopener noreferrer"' if parsed.scheme else ""
    return f'<a href="{escape(url, quote=True)}"{external}>{escape(label)}</a>'


def main():
    catalog = json.loads((OUT / "catalog.json").read_text())
    sources = catalog["sources"]
    assert len({s["id"] for s in sources}) == len(sources), "Duplicate source IDs"
    raw = (ROOT / "dist/dashboard-data.js").read_text()
    dashboard = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    bills = sorted(
        [dict(state=s["abbr"], **b) for s in dashboard["states"] for b in s["bills"]],
        key=lambda b: (b["state"], b["year"] or 0, b["bill"]),
    )
    with (OUT / "source-links.csv").open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["category", "source", "publisher", "vintage", "used_for", "notes", "reuse_status", "reuse_notes", "link_label", "url"])
        for s in sources:
            for item in s["links"]:
                url = item["url"]
                if not urlsplit(url).scheme:
                    url = "https://ntimbs.github.io/us-data-center-dashboard/sources/" + url
                writer.writerow([s["category"], s["title"], s["publisher"], s["vintage"], s["use"], s["notes"], s["reuse"]["status"], s["reuse"]["notes"], item["label"], url])
    with (OUT / "legislation-sources.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["state", "bill", "year", "snapshot_status", "last_action_date", "source_url"])
        writer.writerows([b["state"], b["bill"], b["year"], b["status"], b["lastActionDate"], b["sourceUrl"]] for b in bills)

    groups = defaultdict(list)
    for s in sources:
        groups[s["category"]].append(s)

    markdown = [
        "# Sources",
        "[Repository overview](README.md) · [Searchable source directory](https://ntimbs.github.io/us-data-center-dashboard/sources/)",
        f"The {len(sources)} source entries below cover the published national facility, U.S. hexagon, and Virginia county views. Each entry identifies the publisher, the snapshot used, its contribution to the dashboard, and the original source links.",
        "Facility inventory: **27 October 2026**. Spatial and policy context reviewed: **8 October 2026**. Preliminary 2026 House results retrieved: **5 November 2026**. Source websites may show newer data; these dates describe the versions used by the dashboard.",
        "[Source links CSV](dist/sources/source-links.csv) · [Legislative source register CSV](dist/sources/legislation-sources.csv)",
        "**Publicly accessible does not mean openly licensed.** Sources include public-domain data, open licenses, noncommercial restrictions, and files whose exact reuse terms remain unverified. Each entry below records the evidence reviewed. See the [coverage, link, and licensing audit](SOURCE_AUDIT.md) and [individual URL check results](dist/sources/link-checks.csv). Link checks are a dated snapshot, not a guarantee of continued access.",
    ]
    for category, entries in groups.items():
        markdown.append(f"## {category}")
        for s in entries:
            markdown.extend([
                f"### {s['title']}",
                f"**Publisher:** {s['publisher']}\n\n**Version / snapshot:** {s['vintage']}",
                f"**Used for:** {s['use']}",
                s["notes"],
                f"**Reuse: {s['reuse']['status']}.** {s['reuse']['notes']}",
            ])
            source_links = []
            for item in s["links"]:
                url = item["url"]
                if url == "#bill-sources":
                    url = "#individual-legislative-sources"
                elif not urlsplit(url).scheme:
                    url = "dist/sources/" + url
                source_links.append(f"- [{item['label']}]({url})")
            markdown.append("\n".join(source_links))
    markdown.extend([
        "## Individual legislative sources",
        f"All **{len(bills)} bill records** from the published dashboard, including their individual source URLs, are available in the [legislative source register](dist/sources/legislation-sources.csv). [Search the bill register on the website](https://ntimbs.github.io/us-data-center-dashboard/sources/#bill-sources). Statuses describe the saved collection, not current law; repeated source URLs are retained as published.",
        "## Project calculations and provenance",
        "Hexagons, density measures, timeline summaries, correlations, regressions, and spatial statistics are project calculations. The measure guides in the hexagon and Virginia views explain the variables and calculations. Original record-level references remain with their source providers. Geographic proximity and county or state context do not establish site-specific utility service, capacity, water rights, policy applicability, or community views.",
        f"Source-directory review: **{catalog['reviewed']}**. This catalogue and the website directory are generated together by [scripts/build_sources.py](scripts/build_sources.py) from [the source catalogue](dist/sources/catalog.json) and the published dashboard data.",
    ])
    (ROOT / "SOURCES.md").write_text("\n\n".join(markdown) + "\n")

    sections = []
    jumps = []
    for index, (category, entries) in enumerate(groups.items(), 1):
        section_id = f"category-{index}"
        jumps.append(link(category, f"#{section_id}"))
        cards = []
        for s in entries:
            links = "".join(f'<li>{link(item["label"], item["url"])}</li>' for item in s["links"])
            cards.append(f'''<article class="source-card" id="{escape(s['id'])}">
              <p class="publisher">{escape(s['publisher'])}</p>
              <h3>{escape(s['title'])}</h3>
              <p class="vintage">{escape(s['vintage'])}</p>
              <p>{escape(s['use'])}</p>
              <p class="source-note">{escape(s['notes'])}</p>
              <p class="source-reuse"><strong>Reuse: {escape(s['reuse']['status'])}.</strong> {escape(s['reuse']['notes'])}</p>
              <ul class="source-links" aria-label="Links for {escape(s['title'], quote=True)}">{links}</ul>
            </article>''')
        sections.append(f'<section class="source-group" id="{section_id}" aria-labelledby="{section_id}-title"><h2 id="{section_id}-title">{escape(category)}</h2><div class="source-grid">{"".join(cards)}</div></section>')

    bill_rows = []
    for b in bills:
        source_link = link(f"{b['state']} {b['bill']} ({b['year']})", b["sourceUrl"]) if b["sourceUrl"] else "No source link recorded"
        bill_rows.append(f'<tr><td>{escape(b["state"])}</td><th scope="row">{escape(b["bill"])}</th><td>{b["year"] or "—"}</td><td>{escape(b["status"])}</td><td>{source_link}</td></tr>')
    linked = sum(bool(b["sourceUrl"]) for b in bills)
    # Reuse the existing analytics and favicon without introducing a second setup.
    home = (ROOT / "dist/index.html").read_text()
    head_extras = home[home.index("  <!-- Google tag"):home.index('  <meta charset')]
    favicon = next(line for line in home.splitlines() if 'rel="icon"' in line)
    html = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
{head_extras}  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Sources, snapshot dates, methodology notes, and original links for the U.S. Data Center Ecosystem Tracker.">
  <title>Sources | U.S. Data Center Ecosystem Tracker</title>
{favicon}
  <link rel="stylesheet" href="../styles.css?v=3.3">
  <link rel="stylesheet" href="styles.css?v=1">
  <script src="app.js?v=1" defer></script>
</head>
<body class="sources-page">
  <a class="skip-link" href="#main">Skip to sources</a>
  <header class="topbar">
    <div class="brand"><div class="brand-mark" aria-hidden="true"><span></span><span></span></div><div><p class="brand-title">U.S. Data Center Ecosystem Tracker</p><p>Sources &amp; provenance</p></div></div>
    <nav class="header-actions" aria-label="Dashboard views">
      <a href="../">Facility view</a><a href="../hex/">U.S. hex view</a><a href="../virginia/">Virginia counties</a><a href="./" aria-current="page">Sources</a>
    </nav>
  </header>
  <main id="main" class="sources-main">
    <div class="sources-intro">
      <div><p class="eyebrow">Data &amp; documentation</p><h1>Sources behind the tracker</h1><p class="lede">Explore the datasets used across the national facility, U.S. hexagon, and Virginia county views. Each entry explains what it contributes, the snapshot used, and where to find the original source.</p></div>
      <div class="institutional-logos"><img src="../assets/uva-nsi-logo.png" alt="University of Virginia National Security Institute"><img src="../assets/scsp-logo.webp" alt="Special Competitive Studies Project"></div>
    </div>
    <div class="snapshot-grid" aria-label="Data snapshots">
      <div><span>Facility inventory</span><strong>27 October 2026</strong></div><div><span>Spatial &amp; policy context reviewed</span><strong>8 October 2026</strong></div><div><span>2026 House results</span><strong>5 November 2026 · preliminary</strong></div>
    </div>
    <p class="scope-note">This directory covers the sources used in the published dashboard. Source websites may now show newer data. Dates below describe the versions used here; adding this directory does not refresh the maps. Original record-level references remain with their source providers. The bill register below also exposes the individual links already used in this dashboard.</p>
    <section class="methods-note" aria-labelledby="auditTitle"><h2 id="auditTitle">Access and reuse</h2><p>These sources are not all openly licensed. The collection includes public-domain and openly licensed data, noncommercial restrictions, and sources whose exact reuse terms remain unverified. Each source card records its reuse status and supporting terms.</p><p>Reviewed {escape(catalog['reviewed'])}. Some providers block automated link checks; those links remain unverified. Read the <a href="https://github.com/ntimbs/us-data-center-dashboard/blob/main/SOURCE_AUDIT.md">coverage, link, and licensing audit</a> or <a href="link-checks.csv" download>download individual URL check results (CSV)</a>.</p></section>
    <div class="source-tools"><label for="sourceSearch">Find a dataset<input id="sourceSearch" type="search" placeholder="Search source, topic, publisher, or year" autocomplete="off"></label><a class="download-link" href="source-links.csv" download>Download source links (CSV)</a></div>
    <nav class="category-links" aria-label="Source categories">{' '.join(jumps)} {link('Bill source register', '#bill-sources')}</nav>
    <p id="sourceCount" class="result-count" role="status">{len(sources)} source entries</p>
    <p id="sourceEmpty" class="empty-state" hidden>No datasets match this search. Try a publisher or a broader topic.</p>
    {''.join(sections)}
    <section id="bill-sources" class="bill-section" aria-labelledby="billTitle">
      <h2 id="billTitle">Individual legislative sources</h2>
      <p>All {len(bills)} bill records in the dashboard’s policy layer are included, with {linked} source links. Statuses describe the saved collection, not current law. Records are retained as published, including repeated source URLs.</p>
      <p><a class="download-link" href="legislation-sources.csv" download>Download bill source register (CSV)</a></p>
      <details id="billDetails"><summary>Browse {len(bills)} bill records</summary>
        <label class="bill-search" for="billSearch">Find a bill<input id="billSearch" type="search" placeholder="State abbreviation, bill number, year, or status" autocomplete="off"></label>
        <p id="billCount" class="result-count" role="status">{len(bills)} bill records</p>
        <div class="table-scroll" role="region" aria-label="Legislative source register" tabindex="0"><table><caption>State legislation source register · context reviewed 8 October 2026</caption><thead><tr><th scope="col">State</th><th scope="col">Bill</th><th scope="col">Year</th><th scope="col">Snapshot status</th><th scope="col">Source record</th></tr></thead><tbody>{''.join(bill_rows)}</tbody></table></div>
        <p id="billEmpty" class="empty-state" hidden>No bill records match this search.</p>
      </details>
    </section>
    <section class="methods-note" aria-labelledby="methodsTitle"><h2 id="methodsTitle">How the sources are combined</h2><p>Facility points are assigned to geographic boundaries and summarized for the map views. Hexagons, density measures, timeline summaries, correlations, regressions, and spatial statistics are project calculations. County or state context does not establish a site’s utility connection, capacity, water rights, policy exposure, or community views.</p><p>The measure guides in the hexagon and Virginia views explain individual variables and calculations. For the published data and preparation code, see the <a href="https://github.com/ntimbs/us-data-center-dashboard">GitHub repository</a>. Source-directory review: {escape(catalog['reviewed'])}.</p></section>
  </main>
  <footer class="sources-footer"><a href="../">Return to the national facility view</a><span>UVA National Security Institute · Special Competitive Studies Project</span></footer>
</body>
</html>
'''
    (OUT / "index.html").write_text(html)
    print(f"Built {len(sources)} source entries and {len(bills)} bill records ({linked} linked).")


if __name__ == "__main__":
    main()
