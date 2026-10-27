(() => {
  const { facilities, states, meta, policyTypes = [] } = window.DASHBOARD_DATA;
  let powerPlants = [];
  let plantById = new Map();
  let powerPlantLoadPromise = null;
  let transmissionData = null;
  let transmissionLoadPromise = null;
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const priceFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
  const value = (v, suffix = "") => v === null || v === undefined || v === "" ? "Unknown" : `${typeof v === "number" ? fmt.format(v) : v}${suffix}`;
  const policyColors = ["#102436", "#16435a", "#1f6475", "#a87532", "#c45c59"];
  const policyBins = [
    { label: "0 bills", min: 0, max: 0 },
    { label: "1–4 bills", min: 1, max: 4 },
    { label: "5–9 bills", min: 5, max: 9 },
    { label: "10–19 bills", min: 10, max: 19 },
    { label: "20+ bills", min: 20, max: Infinity }
  ];
  const costColors = ["#12384a", "#17606b", "#1f8a86", "#c28a3d", "#d65f59"];
  const costBins = [
    { label: "Under 7 ¢/kWh", min: -Infinity, max: 6.99 },
    { label: "7–7.99 ¢/kWh", min: 7, max: 7.99 },
    { label: "8–8.99 ¢/kWh", min: 8, max: 8.99 },
    { label: "9–11.99 ¢/kWh", min: 9, max: 11.99 },
    { label: "12+ ¢/kWh", min: 12, max: Infinity }
  ];
  const hazardMeasures = {
    risk: { label: "Overall hazard", field: "risk" },
    drought: { label: "Drought", field: "drought" },
    flood: { label: "Riverine flood", field: "flood" },
    heat: { label: "Heat wave", field: "heat" },
    wildfire: { label: "Wildfire", field: "wildfire" }
  };
  const hazardCategories = [
    ["Very Low", "#2dd4bf"], ["Relatively Low", "#84cc16"], ["Relatively Moderate", "#f5b942"],
    ["Relatively High", "#fb923c"], ["Very High", "#e11d48"], ["No Rating", "#64748b"],
    ["Insufficient Data", "#475569"], ["Unknown", "#334155"]
  ];
  const voteCategories = [
    ["Harris +40 or more", "#2563a6"], ["Harris +15 to 40", "#4b91d2"], ["Harris +5 to 15", "#8bb8dc"],
    ["Within 5 points", "#b8b6ba"], ["Trump +5 to 15", "#e8a0a0"], ["Trump +15 to 40", "#d76565"], ["Trump +40 or more", "#a92f38"]
  ];
  const voteConfig = {
    title: "2024 presidential vote by precinct",
    insight: ["Voting is community context", "Colors show Harris’s lead over Trump as a share of all presidential votes in each mapped precinct. Vote results do not measure support for or opposition to data centers. Some boundaries are estimated, and some areas have no usable precinct results."],
    source: "“2024 Precinct-Level Election Results.” New York Times. Accessed 15 October 2026.",
    sourceUrl: "https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html",
    categories: voteCategories
  };
  const districtConfig = {
    title: "2024 presidential vote by congressional district",
    insight: ["District voting is community context", "Colors show Harris’s lead over Trump as a share of all presidential votes in each 2024 congressional district. Facility counts use point locations within Census 119th district boundaries. Presidential votes do not measure views about data centers."],
    source: "2024 Pres by CD, curated by Drew Savicki; U.S. Census Bureau, 119th congressional districts.",
    sourceUrl: "https://docs.google.com/spreadsheets/d/1ZHx5E0-5vuXxcZShBgsAl_vwAntkkanGqYQp0owNjoQ/edit?gid=0",
    categories: voteCategories
  };
  const voteDataBase = "https://int.nyt.com/newsgraphics/elections/map-data/2024/national";

  const config = {
    status: {
      title: "Operating status",
      insight: ["Project status is the outcome anchor", "Use proposed, development, operating, suspended, and cancelled records to define comparison groups. Preserve the snapshot date before modeling transitions."],
      source: "FracTracker U.S. Data Centers Tracker, 27 October 2026 facility inventory; reported project-status field.",
      sourceUrl: "https://experience.arcgis.com/experience/5a4d072ad01449bba5698a80103fb909",
      categories: [
        ["Operating", "#2dd4bf"], ["Development", "#60a5fa"], ["Expanding", "#a78bfa"],
        ["Proposed", "#f5b942"], ["Pre-proposal", "#eab676"], ["Suspended", "#fb7185"], ["Cancelled", "#e11d48"], ["Unknown", "#718096"]
      ],
      key: f => f.phase || "Unknown"
    },
    capacity: {
      title: "Reported MW capacity",
      insight: ["Capacity coverage is incomplete", "Point size and color use reported MW or the midpoint of a reported range. Unknown values remain visible and are never converted to zero."],
      source: "FracTracker U.S. Data Centers Tracker, 27 October 2026 facility inventory; reported MW capacity field.",
      sourceUrl: "https://experience.arcgis.com/experience/5a4d072ad01449bba5698a80103fb909",
      categories: [["Mega campus (1,000+ MW)", "#7c3aed"], ["Hyperscale (100-999 MW)", "#2563eb"], ["Large (51-99 MW)", "#0891b2"], ["Medium (11-50 MW)", "#14b8a6"], ["Small (0-10 MW)", "#84cc16"], ["Unknown", "#64748b"]],
      key: f => f.capacity || "Unknown"
    },
    power: {
      title: "Reported power source",
      insight: ["Reported sourcing is sparse", "Power categories describe source text and announced arrangements. They do not identify the hourly delivered mix or prove a physical grid connection."],
      source: "FracTracker U.S. Data Centers Tracker, 27 October 2026 facility inventory; reported power-source field.",
      sourceUrl: "https://experience.arcgis.com/experience/5a4d072ad01449bba5698a80103fb909",
      categories: [["Grid", "#60a5fa"], ["Natural gas", "#f59e0b"], ["Renewable", "#22c55e"], ["Nuclear", "#a78bfa"], ["Mixed", "#f97316"], ["Other fossil", "#ef4444"], ["Storage or fuel cell", "#06b6d4"], ["Other", "#94a3b8"], ["Unknown", "#475569"]],
      key: f => f.power || "Unknown"
    },
    generation: {
      title: "Power plants by generation source",
      insight: ["Generation infrastructure is a separate evidence layer", "Plant markers show eGRID facilities by primary generation source. The optional line overlay shows mapped 200+ kV transmission infrastructure; neither proximity layer establishes that a plant or line serves a facility."],
      source: "EPA eGRID 2024 provisional development snapshot and OpenStreetMap power infrastructure dated 7 September 2026.",
      categories: [
        ["Solar", "#facc15"], ["Natural gas", "#fb923c"], ["Hydro", "#38bdf8"],
        ["Wind", "#2dd4bf"], ["Oil", "#f87171"], ["Biomass", "#84cc16"],
        ["Coal", "#a3a3a3"], ["Nuclear", "#c084fc"], ["Geothermal", "#f472b6"],
        ["Other fossil", "#b45309"], ["Other", "#94a3b8"], ["Unknown", "#475569"]
      ],
      key: plant => plant.fuel || "Unknown"
    },
    cost: {
      title: "2024 industrial electricity price",
      insight: ["State averages provide market context", "The map shows the 2024 average industrial electricity price in nominal cents per kilowatt-hour. It is useful for broad comparisons but does not represent a utility tariff or a data center’s negotiated contract."],
      source: "EIA-861 state electricity-price series, 2010–2024, with CPI-adjusted companion values.",
      categories: costBins.map((bin, index) => [bin.label, costColors[index]]),
      key: state => state.electricityPrice?.industrial
    },
    water: {
      title: "County water-scarcity screening",
      insight: ["Water scarcity is screening context", "The AWARE annual-average factor compares relative county water scarcity. It does not measure facility withdrawals, water rights, utility capacity, treatment capacity, cooling technology, or future supply."],
      source: "AWARE annual-average water-scarcity factor, joined to facilities by five-digit county FIPS.",
      categories: [["Under 0.5", "#2dd4bf"], ["0.5–0.99", "#84cc16"], ["1–4.99", "#f5b942"], ["5 or more", "#fb7185"], ["Unknown", "#64748b"]],
      key: f => f.waterClass || "Unknown"
    },
    hazard: {
      title: "FEMA hazard screening",
      insight: ["Hazard ratings are county-level context", "Choose an overall or hazard-specific FEMA National Risk Index rating. These ratings support broad screening; they are not parcel-level exposure, forecasts, engineering assessments, or estimates of facility resilience."],
      source: "FEMA National Risk Index county risk ratings.",
      categories: hazardCategories,
      key: f => f[hazardMeasures[currentHazardMeasure].field] || "Unknown"
    },
    policy: {
      title: "Tracked state legislation",
      insight: ["Bill activity varies by topic and status", "Use the measure menu to map total bills, legislative status, or one of 22 policy types. Click a state for counts and bill-level records."],
      source: "State legislative tracking of data-center-related bills (NCSL-derived), reviewed 28 September 2026.",
      categories: [["Dedicated incentive", "#2dd4bf"], ["Moratorium tracker entry", "#fb7185"], ["Other state context", "#60a5fa"]],
      key: f => f.incentive ? "Dedicated incentive" : f.moratoriumCount > 0 ? "Moratorium tracker entry" : "Other state context"
    },
    opposition: {
      title: "Opposition evidence hierarchy",
      insight: ["Evidence strength varies", "Direct facility records are project-level evidence. County and state tracker matches describe the surrounding environment, while absence from a tracker remains unknown."],
      source: "FracTracker local-action records and compiled facility-level opposition-event tracking.",
      categories: [["Direct facility record", "#fb7185"], ["County tracker context only", "#f5b942"], ["State tracker context only", "#60a5fa"], ["No tracker match; opposition unknown", "#64748b"]],
      key: f => f.oppositionClass || "No tracker match; opposition unknown"
    }
  };

  const filterGroupDefs = {
    status: { key: f => f.phase || "Unknown", categories: config.status.categories },
    activity: { key: f => f.activity || "Unknown", categories: [["Existing", "#2dd4bf"], ["Existing / expansion", "#a78bfa"], ["Active pipeline", "#60a5fa"], ["Paused / cancelled", "#fb7185"], ["Unknown", "#718096"]] },
    capacity: { key: f => f.capacity || "Unknown", categories: config.capacity.categories },
    power: { key: f => f.power || "Unknown", categories: config.power.categories }
  };

  const els = Object.fromEntries([
    "searchInput", "stateFilter",
    "statusChecks", "activityChecks", "capacityChecks", "powerChecks", "statusSelection", "activitySelection", "capacitySelection", "powerSelection",
    "resetFilters", "selectionCount", "exportButton", "metricFacilities", "metricShare", "metricMw", "metricOperating", "metricOpposition",
    "stateLayer", "transmissionLayer", "plantLayer", "facilityLayer", "map", "mapShell", "tooltip", "legend", "viewTitle", "statusChart", "chartTotal", "insightTitle", "insightText", "insightSource",
    "coverageLine", "detailPanel", "zoomIn", "zoomOut", "zoomReset", "policyControls", "policyTopic", "policyStatusGroup", "generationControls", "generationSource", "transmissionToggle", "transmissionStatus", "hazardControls", "hazardMeasure",
    "profileEyebrow", "profileTitle", "timelineBasis", "timelineRange", "timelineYearLabel", "timelineMin", "timelineMax", "timelineCoverage", "timelinePlay",
    "oppositionControls", "oppositionMeasure", "voteStatus", "voteLayer"
  ].map(id => [id, document.getElementById(id)]));

  let currentView = "status";
  let filtered = facilities;
  let selectedId = null;
  let selectedPlantId = null;
  let selectedStateAbbr = null;
  let policyTopic = "";
  let policyStatuses = new Set(["Active", "Pass", "Fail", "Veto"]);
  let currentHazardMeasure = "risk";
  let oppositionMeasure = "evidence";
  let voteManifest = null;
  let voteLoadPromise = null;
  const voteStateCache = new Map();
  const voteStateRows = new Map();
  const voteFacilityBins = new Map();
  let voteDisplayState = "";
  let selectedPrecinct = null;
  let voteRenderVersion = 0;
  let districtData = null;
  let districtLoadPromise = null;
  let selectedDistrict = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let dragging = false;
  let dragStart = null;
  let dragMoved = false;
  let timelineMode = "inventory";
  let timelineYear = 0;
  let timelineTimer = null;
  const stateByAbbr = new Map(states.map(state => [state.abbr, state]));
  const precinctActive = () => currentView === "opposition" && oppositionMeasure === "votes";
  const districtActive = () => currentView === "opposition" && oppositionMeasure === "districts";
  const votesActive = () => precinctActive() || districtActive();
  const activeConfig = () => precinctActive() ? voteConfig : districtActive() ? districtConfig : config[currentView];
  function voteBin(margin) {
    if (margin >= 0.4) return 0;
    if (margin >= 0.15) return 1;
    if (margin >= 0.05) return 2;
    if (margin > -0.05) return 3;
    if (margin > -0.15) return 4;
    if (margin > -0.4) return 5;
    return 6;
  }
  const voteColor = margin => Number.isFinite(margin) ? voteCategories[voteBin(margin)][1] : "#64748b";

  function inventoryAddedYear(f) {
    const match = String(f.dateCreated || "").match(/^(\d{4})/);
    return match ? Number(match[1]) : null;
  }
  function facilityTimelineYear(f, mode = timelineMode) {
    const addedYear = inventoryAddedYear(f);
    if (mode === "online") {
      const onlineYear = Number.isInteger(f.onlineYear) ? f.onlineYear : null;
      const activeSnapshotYear = ["Operating", "Expanding"].includes(f.phase) ? addedYear : null;
      if (Number.isInteger(onlineYear) && Number.isInteger(activeSnapshotYear)) return Math.min(onlineYear, activeSnapshotYear);
      return Number.isInteger(onlineYear) ? onlineYear : activeSnapshotYear;
    }
    return addedYear;
  }
  function timelineBounds(mode = timelineMode) {
    const years = facilities.map(f => facilityTimelineYear(f, mode)).filter(Number.isInteger);
    return { min: Math.min(...years), max: Math.max(...years), dated: years.length, undated: facilities.length - years.length };
  }
  function matchesTimeline(f) {
    const year = facilityTimelineYear(f);
    if (Number.isInteger(year)) return year <= timelineYear;
    return timelineMode === "inventory" && timelineYear === timelineBounds().max;
  }
  function stopTimeline() {
    if (timelineTimer) clearInterval(timelineTimer);
    timelineTimer = null;
    els.timelinePlay.textContent = "Play";
  }
  function renderTimelineCoverage() {
    const bounds = timelineBounds();
    const shown = facilities.filter(matchesTimeline).length;
    els.timelineYearLabel.textContent = timelineYear;
    els.timelineRange.setAttribute("aria-valuetext", `Cumulative through ${timelineYear}`);
    els.timelineCoverage.textContent = timelineMode === "inventory"
      ? `${fmt.format(shown)} records shown. ${fmt.format(bounds.dated)} have an inventory-added year; ${fmt.format(bounds.undated)} undated records appear only at the latest year. Colors show current status, not historical status.`
      : `${fmt.format(shown)} of ${fmt.format(bounds.dated)} timeline-eligible records are shown. This includes reported/expected online years plus current Operating or Expanding records no later than their inventory-added year. ${fmt.format(bounds.undated)} records have no eligible date; this is not a verified opening history.`;
  }
  function configureTimeline(resetToMax = false) {
    const bounds = timelineBounds();
    if (resetToMax || timelineYear < bounds.min || timelineYear > bounds.max) timelineYear = bounds.max;
    els.timelineRange.min = bounds.min;
    els.timelineRange.max = bounds.max;
    els.timelineRange.value = timelineYear;
    els.timelineMin.textContent = bounds.min;
    els.timelineMax.textContent = bounds.max;
    renderTimelineCoverage();
  }
  function playTimeline() {
    if (timelineTimer) { stopTimeline(); return; }
    const bounds = timelineBounds();
    if (timelineYear >= bounds.max) timelineYear = bounds.min;
    els.timelineRange.value = timelineYear;
    renderTimelineCoverage();
    applyFilters();
    els.timelinePlay.textContent = "Pause";
    timelineTimer = setInterval(() => {
      if (timelineYear >= bounds.max) { stopTimeline(); return; }
      timelineYear += 1;
      els.timelineRange.value = timelineYear;
      renderTimelineCoverage();
      applyFilters();
    }, 900);
  }

  const unique = (key) => [...new Set(facilities.map(f => f[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  const populate = (select, values) => values.forEach(v => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
  populate(els.stateFilter, unique("state"));
  configureTimeline(true);

  function escapeHtml(input) {
    return String(input ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

  function loadPowerPlants() {
    if (powerPlants.length || meta.powerPlants === 0) return Promise.resolve(powerPlants);
    if (powerPlantLoadPromise) return powerPlantLoadPromise;
    els.generationSource.disabled = true;
    els.generationSource.innerHTML = `<option value="">Loading plant data…</option>`;
    powerPlantLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "power-plant-data.js?v=1.1";
      script.onload = () => {
        const dataset = window.POWER_PLANT_DATA || {};
        const fields = dataset.fields || [];
        powerPlants = (dataset.plants || []).map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
        plantById = new Map(powerPlants.map(plant => [plant.id, plant]));
        els.generationSource.innerHTML = `<option value="">All sources</option>`;
        const plantSources = config.generation.categories.map(([label]) => label).filter(label => powerPlants.some(plant => config.generation.key(plant) === label));
        populate(els.generationSource, plantSources);
        els.generationSource.disabled = false;
        resolve(powerPlants);
      };
      script.onerror = () => {
        els.generationSource.innerHTML = `<option value="">Plant data unavailable</option>`;
        reject(new Error("Could not load power-plant data"));
      };
      document.head.appendChild(script);
    });
    return powerPlantLoadPromise;
  }

  function loadTransmissionLines() {
    if (transmissionData) return Promise.resolve(transmissionData);
    if (transmissionLoadPromise) return transmissionLoadPromise;
    els.transmissionToggle.disabled = true;
    els.transmissionStatus.textContent = "Loading…";
    transmissionLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "transmission-data.js?v=1.0";
      script.onload = () => {
        transmissionData = window.TRANSMISSION_DATA || null;
        els.transmissionToggle.disabled = false;
        els.transmissionStatus.textContent = transmissionData ? `${fmt.format(transmissionData.featureCount)} mapped features` : "Unavailable";
        if (transmissionData) resolve(transmissionData);
        else reject(new Error("Transmission data missing"));
      };
      script.onerror = () => {
        els.transmissionToggle.disabled = false;
        els.transmissionToggle.checked = false;
        els.transmissionStatus.textContent = "Unavailable";
        reject(new Error("Could not load transmission data"));
      };
      document.head.appendChild(script);
    });
    return transmissionLoadPromise;
  }

  async function voteJson(path) {
    const response = await fetch(`votes/${path}`);
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  }
  function loadDistrictData() {
    if (!districtLoadPromise) {
      districtLoadPromise = voteJson("districts.json").then(data => {
        if (data.districts.length !== 435) throw new Error("Incomplete congressional district data");
        districtData = data;
        return data;
      }).catch(error => { districtLoadPromise = null; throw error; });
    }
    return districtLoadPromise;
  }
  function districtFacilitySummary() {
    if (!districtData) return null;
    const districtById = new Map(districtData.districts.map(row => [row[0], row]));
    const counts = voteCategories.map(() => 0);
    let unmatched = 0;
    for (const facility of filtered) {
      const row = districtById.get(districtData.facilities[facility.id]);
      if (!row) unmatched++;
      else counts[voteBin((row[1] - row[2]) / row[3])]++;
    }
    return { counts, unmatched, matched: filtered.length - unmatched };
  }
  function showDistrictDetails(id) {
    const row = districtData?.districts.find(item => item[0] === id);
    if (!row || !districtActive()) return;
    selectedDistrict = id;
    selectedId = selectedPlantId = selectedStateAbbr = null;
    const margin = (row[1] - row[2]) / row[3];
    const count = filtered.filter(facility => districtData.facilities[facility.id] === id).length;
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">2024 congressional district</span><h2>${escapeHtml(id)}</h2><p class="detail-location">${fmt.format(count)} selected data ${count === 1 ? "center" : "centers"} in this district</p></div><button class="close-detail" type="button" aria-label="Close district details">×</button></div>
      <span class="phase-pill">${margin >= 0 ? "Harris" : "Trump"} +${(Math.abs(margin) * 100).toFixed(1)} points</span>
      ${detailSection("Presidential votes", [detailItem("Kamala Harris", row[1]), detailItem("Donald Trump", row[2]), detailItem("All candidates", row[3])])}
      <p class="policy-note">Facility count reflects the current filters and the 119th congressional district boundary. The margin is (Harris − Trump) ÷ all presidential votes. Voting does not indicate a position on data centers.</p>
      <p class="policy-note">Results: <a href="${districtConfig.sourceUrl}" target="_blank" rel="noopener">2024 Pres by CD</a> · Boundaries: <a href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html" target="_blank" rel="noopener">U.S. Census Bureau</a>.</p>
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    els.voteLayer.querySelector(".vote-district.selected")?.classList.remove("selected");
    els.voteLayer.querySelector(`.vote-district[data-district="${id}"]`)?.classList.add("selected");
  }
  async function renderDistrictLayer(version) {
    els.voteStatus.textContent = "Loading congressional districts…";
    els.voteLayer.replaceChildren();
    try {
      const data = await loadDistrictData();
      if (version !== voteRenderVersion || !districtActive()) return;
      const state = els.stateFilter.value;
      const rows = state ? data.districts.filter(row => row[0].startsWith(`${state}-`)) : data.districts;
      els.voteLayer.innerHTML = rows.map(row => `<path class="vote-district${selectedDistrict === row[0] ? " selected" : ""}" data-district="${row[0]}" d="${row[4]}" fill="${voteColor((row[1] - row[2]) / row[3])}" fill-rule="evenodd" role="button" tabindex="0" aria-label="${row[0]} congressional district vote details"><title>${row[0]} · ${((row[1] - row[2]) / row[3] * 100).toFixed(1)} point Harris margin</title></path>`).join("");
      els.voteStatus.textContent = `${fmt.format(rows.length)} congressional ${rows.length === 1 ? "district" : "districts"}${state ? ` in ${state}` : " nationwide"}`;
      if (state) {
        const bounds = rows.reduce((box, row) => [Math.min(box[0], row[5][0]), Math.min(box[1], row[5][1]), Math.max(box[2], row[5][2]), Math.max(box[3], row[5][3])], [Infinity, Infinity, -Infinity, -Infinity]);
        const scale = Math.max(1, Math.min(20, 900 / Math.max(1, bounds[2] - bounds[0]), 510 / Math.max(1, bounds[3] - bounds[1])));
        transform = { scale, x: 500 - scale * (bounds[0] + bounds[2]) / 2, y: 300 - scale * (bounds[1] + bounds[3]) / 2 };
        updateTransform();
      } else resetView();
      renderFacilities();
      renderSummary();
      renderLegend();
      if (selectedStateAbbr === state && stateByAbbr.has(state)) showVoteStateDetails(stateByAbbr.get(state));
    } catch (_) {
      if (version !== voteRenderVersion) return;
      els.voteLayer.replaceChildren();
      els.voteStatus.textContent = "District data unavailable";
      els.coverageLine.textContent = "The congressional district data could not be loaded. Refresh the page and try again.";
    }
  }
  function loadVoteData() {
    if (voteLoadPromise) return voteLoadPromise;
    voteLoadPromise = voteJson("manifest.json").then(manifest => {
      voteManifest = manifest;
      const selectedState = els.stateFilter.value;
      const options = new Set([...els.stateFilter.options].map(option => option.value).filter(Boolean));
      Object.keys(manifest.states).forEach(state => options.add(state));
      els.stateFilter.innerHTML = '<option value="">All states</option>';
      populate(els.stateFilter, [...options].sort());
      els.stateFilter.value = selectedState;
      return manifest;
    }).catch(error => { voteLoadPromise = null; throw error; });
    return voteLoadPromise;
  }
  function projectVotePoint(lon, lat, state) {
    if (state === "HI") return [300 + (lon + 161) * 19, 512 + (23 - lat) * 19];
    if (state === "AK") return [48 + (lon + 170) * 4.5, 445 + (72 - lat) * 4.3];
    return [95 + (lon + 125) * 14.15, 45 + (50 - lat) * 20.1];
  }
  function votePath(geometry, arcs, transform, state) {
    const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs || [];
    const parts = [];
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons) for (const ring of polygon) {
      const points = [];
      for (const arcIndex of ring) {
        const arc = arcs[arcIndex >= 0 ? arcIndex : ~arcIndex];
        let x = 0, y = 0;
        const decoded = arc.map(([dx, dy]) => {
          x += dx; y += dy;
          return projectVotePoint(x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1], state);
        });
        if (arcIndex < 0) decoded.reverse();
        for (let i = points.length ? 1 : 0; i < decoded.length; i++) points.push(decoded[i]);
      }
      if (points.length < 3) continue;
      const reduced = [points[0]];
      for (const point of points.slice(1, -1)) {
        const prior = reduced[reduced.length - 1];
        if (Math.hypot(point[0] - prior[0], point[1] - prior[1]) >= 0.03) reduced.push(point);
      }
      if (reduced.length < 3) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        reduced.splice(0, reduced.length, [cx - .12, cy - .12], [cx + .12, cy - .12], [cx + .12, cy + .12], [cx - .12, cy + .12]);
      }
      for (const [x, y] of reduced) {
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
      }
      parts.push("M" + reduced.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L") + "Z");
    }
    return [parts.join(""), bounds];
  }
  async function fetchVoteState(state) {
    const response = await fetch(`${voteDataBase}/${state}-precincts-with-results.topojson.gz`);
    if (!response.ok || !response.body) throw new Error(`Could not load ${state} precinct results`);
    const topology = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
    const geometries = topology.objects[state]?.geometries || [];
    return geometries.map(geometry => {
      const props = geometry.properties;
      const [path, bounds] = votePath(geometry, topology.arcs, topology.transform, state);
      return [props.GEOID, props.votes_dem, props.votes_rep, props.votes_total, props.pct_dem_lead,
        props.official_boundary, path, bounds];
    }).filter(row => row[6]);
  }
  function loadVoteState(state) {
    if (!voteStateCache.has(state)) {
      voteStateCache.set(state, fetchVoteState(state).then(rows => { voteStateRows.set(state, rows); return rows; }).catch(error => { voteStateCache.delete(state); throw error; }));
    }
    return voteStateCache.get(state);
  }
  function matchFacilitiesToVotePrecincts(state, rows) {
    if (voteFacilityBins.has(state)) return;
    const matches = new Map();
    const context = document.createElement("canvas").getContext("2d");
    const paths = new Map();
    for (const facility of facilities.filter(item => item.state === state)) {
      const [x, y] = projectVotePoint(facility.lon, facility.lat, state);
      let bin = null;
      for (let index = 0; index < rows.length; index++) {
        const [minX, minY, maxX, maxY] = rows[index][7];
        if (x < minX - .01 || x > maxX + .01 || y < minY - .01 || y > maxY + .01) continue;
        if (!paths.has(index)) paths.set(index, new Path2D(rows[index][6]));
        if (context.isPointInPath(paths.get(index), x, y, "evenodd")) {
          bin = Number.isFinite(rows[index][4]) ? voteBin(rows[index][4]) : null;
          break;
        }
      }
      matches.set(facility.id, bin);
    }
    voteFacilityBins.set(state, matches);
  }
  function voteFacilitySummary(state) {
    const matches = voteDisplayState === state ? voteFacilityBins.get(state) : null;
    if (!matches) return null;
    const counts = voteCategories.map(() => 0);
    let unmatched = 0;
    for (const facility of filtered) {
      const bin = matches.get(facility.id);
      if (bin === null || bin === undefined) unmatched++;
      else counts[bin]++;
    }
    return { counts, unmatched, matched: counts.reduce((sum, count) => sum + count, 0) };
  }
  function showVoteStateDetails(state) {
    if (districtActive()) {
      if (!districtData) return;
      const summary = districtFacilitySummary();
      const { counts, unmatched, matched } = summary;
      els.detailPanel.innerHTML = `<div class="detail-content">
        <div class="detail-top"><div><span class="eyebrow">2024 congressional district vote · ${escapeHtml(state.abbr)}</span><h2>${escapeHtml(state.name)}</h2><p class="detail-location">${fmt.format(matched)} of ${fmt.format(filtered.length)} selected data centers matched to a district</p></div><button class="close-detail" type="button" aria-label="Close state vote details">×</button></div>
        <section class="detail-section"><h3>Data centers by district vote share</h3><div class="vote-breakdown">${voteCategories.map(([label, color], index) => `<div><span><i style="background:${color}"></i>${escapeHtml(label)}</span><strong>${fmt.format(counts[index])}</strong></div>`).join("")}<div><span><i style="background:#64748b"></i>Outside mapped district</span><strong>${fmt.format(unmatched)}</strong></div></div></section>
        <p class="policy-note">Counts reflect current facility filters. Each facility point is assigned to a 119th congressional district; points outside mapped boundaries are listed separately. Voting does not measure views about data centers.</p>
        <p class="policy-note">Results: <a href="${districtConfig.sourceUrl}" target="_blank" rel="noopener">2024 Pres by CD</a> · Boundaries: <a href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html" target="_blank" rel="noopener">U.S. Census Bureau</a>.</p>
      </div>`;
      els.detailPanel.classList.add("open");
      els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
      return;
    }
    const summary = voteFacilitySummary(state.abbr);
    if (!summary) {
      if (!voteManifest || voteManifest.states[state.abbr]) return;
      els.detailPanel.innerHTML = `<div class="detail-content"><div class="detail-top"><div><span class="eyebrow">2024 presidential vote · ${escapeHtml(state.abbr)}</span><h2>${escapeHtml(state.name)}</h2></div><button class="close-detail" type="button" aria-label="Close state vote details">×</button></div><p class="policy-note">The New York Times source has no mapped precinct results for this state, so its ${fmt.format(filtered.length)} selected data centers cannot be assigned to vote-share categories.</p></div>`;
      els.detailPanel.classList.add("open");
      els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
      return;
    }
    const { counts, unmatched, matched } = summary;
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">2024 presidential vote · ${escapeHtml(state.abbr)}</span><h2>${escapeHtml(state.name)}</h2><p class="detail-location">${fmt.format(matched)} of ${fmt.format(filtered.length)} selected data centers matched to a precinct</p></div><button class="close-detail" type="button" aria-label="Close state vote details">×</button></div>
      <section class="detail-section"><h3>Data centers by vote share</h3><div class="vote-breakdown">${voteCategories.map(([label, color], index) => `<div><span><i style="background:${color}"></i>${escapeHtml(label)}</span><strong>${fmt.format(counts[index])}</strong></div>`).join("")}<div><span><i style="background:#64748b"></i>No mapped precinct</span><strong>${fmt.format(unmatched)}</strong></div></div></section>
      <p class="policy-note">Counts reflect the current facility filters. Each facility point is assigned to one mapped precinct; unmatched points are listed separately. The categories show the Harris–Trump vote margin as a share of all presidential votes, not views about data centers.</p>
      <p class="policy-note">Source: <a href="${voteConfig.sourceUrl}" target="_blank" rel="noopener">The New York Times 2024 precinct map</a>.</p>
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
  }
  function zoomToVoteState(state) {
    const bounds = voteManifest?.states?.[state]?.bounds;
    if (!bounds) return;
    const width = Math.max(bounds[2] - bounds[0], 1);
    const height = Math.max(bounds[3] - bounds[1], 1);
    const scale = Math.max(1, Math.min(20, 900 / width, 510 / height));
    transform = { scale, x: 500 - scale * (bounds[0] + bounds[2]) / 2, y: 300 - scale * (bounds[1] + bounds[3]) / 2 };
    updateTransform();
  }
  async function renderVoteLayer() {
    const version = ++voteRenderVersion;
    if (!votesActive()) { voteDisplayState = ""; els.voteLayer.replaceChildren(); els.voteStatus.textContent = ""; return; }
    if (districtActive()) { voteDisplayState = ""; return renderDistrictLayer(version); }
    els.voteStatus.textContent = "Loading precinct votes…";
    els.voteLayer.replaceChildren();
    try {
      await loadVoteData();
      const state = els.stateFilter.value;
      const unavailable = state && !voteManifest.states[state];
      const rows = state && !unavailable ? await loadVoteState(state) : null;
      if (version !== voteRenderVersion || !precinctActive()) return;
      const previousState = voteDisplayState;
      voteDisplayState = rows ? state : "";
      els.voteLayer.replaceChildren();
      if (rows) {
        els.voteLayer.innerHTML = rows.map((row, index) =>
          `<path class="vote-precinct${selectedPrecinct?.state === state && selectedPrecinct.index === index ? " selected" : ""}" data-index="${index}" d="${row[6]}" fill="${voteColor(row[4])}" fill-rule="evenodd"></path>`
        ).join("");
        matchFacilitiesToVotePrecincts(state, rows);
        els.voteStatus.textContent = `${fmt.format(rows.length)} mapped precincts in ${state}`;
        if (previousState !== state) { zoomToVoteState(state); renderFacilities(); }
      } else if (unavailable) {
        els.voteStatus.textContent = `No mapped NYT precinct results for ${state}`;
        resetView();
      } else {
        els.voteStatus.textContent = "Choose a state to load precinct results from The New York Times";
        if (previousState) resetView();
      }
      renderLegend();
      renderSummary();
      if (selectedStateAbbr === state && stateByAbbr.has(state)) showVoteStateDetails(stateByAbbr.get(state));
    } catch (_) {
      if (version !== voteRenderVersion) return;
      els.voteLayer.replaceChildren();
      els.voteStatus.textContent = "Precinct data unavailable";
      els.coverageLine.textContent = "The precinct voting data could not be loaded. Refresh the page and try again.";
    }
  }
  async function selectPrecinct(state, index) {
    let rows;
    try { rows = await loadVoteState(state); }
    catch (_) { els.voteStatus.textContent = "Precinct detail unavailable"; return; }
    const row = rows[index];
    if (!row || !precinctActive()) return;
    selectedId = selectedPlantId = selectedStateAbbr = null;
    selectedPrecinct = { state, index };
    const [geoid, dem, rep, total, margin, official] = row;
    const lead = margin >= 0 ? "Harris" : "Trump";
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">2024 presidential precinct · ${escapeHtml(state)}</span><h2>${escapeHtml(geoid)}</h2><p class="detail-location">The New York Times precinct results</p></div><button class="close-detail" type="button" aria-label="Close precinct details">×</button></div>
      <span class="phase-pill">${lead} +${(Math.abs(margin) * 100).toFixed(1)} points</span>
      ${detailSection("Presidential votes", [detailItem("Kamala Harris", dem), detailItem("Donald Trump", rep), detailItem("All candidates", total), detailItem("Boundary", official ? "Official" : "Estimated")])}
      <section class="detail-section"><h3>How to use this layer</h3><p class="policy-note">The margin divides the Harris–Trump vote difference by votes for all candidates. Vote results are community context, not evidence of a position on data centers. Boundaries and results have coverage limits.</p><p class="policy-note"><a href="https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html" target="_blank" rel="noopener">The New York Times 2024 precinct map</a> · <a href="https://github.com/nytimes/presidential-precinct-map-2024/blob/main/LICENSE" target="_blank" rel="noopener">Data terms</a></p></section>
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    els.voteLayer.querySelector(".vote-precinct.selected")?.classList.remove("selected");
    if (voteDisplayState === state) els.voteLayer.querySelector(`.vote-precinct[data-index="${index}"]`)?.classList.add("selected");
  }

  const statusLabels = { Active: "Active", Pass: "Passed", Fail: "Failed", Veto: "Vetoed" };
  els.policyTopic.innerHTML = `<option value="">All topics</option>${policyTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}`;
  const policyStatusChecks = () => Array.from(els.policyStatusGroup.querySelectorAll('input[type="checkbox"]'));

  function policyMeasure(state) {
    const bills = state.bills || [];
    return bills.filter(bill => {
      const matchesTopic = !policyTopic || (bill.types || []).includes(policyTopic);
      const matchesStatus = policyStatuses.has(bill.status);
      return matchesTopic && matchesStatus;
    }).length;
  }

  function policyMetricLabel() {
    const topicLabel = policyTopic || "All topics";
    const allStatuses = ["Active", "Pass", "Fail", "Veto"];
    const statusLabel = policyStatuses.size === allStatuses.length
      ? "all statuses"
      : allStatuses.filter(s => policyStatuses.has(s)).map(s => statusLabels[s]).join(" or ") || "no status selected";
    return `${topicLabel}, ${statusLabel}`;
  }

  function policyColor(count) {
    const index = policyBins.findIndex(bin => count >= bin.min && count <= bin.max);
    return policyColors[Math.max(0, index)];
  }

  function electricityPrice(state) { return state?.electricityPrice?.industrial; }
  function costColor(price) {
    if (!Number.isFinite(price)) return "#172938";
    const index = costBins.findIndex(bin => price >= bin.min && price <= bin.max);
    return costColors[Math.max(0, index)];
  }
  function activeHazard() { return hazardMeasures[currentHazardMeasure]; }
  function facilityHazard(f) { return f[activeHazard().field] || "Unknown"; }
  function stateIsInteractive() { return currentView === "policy" || currentView === "cost" || votesActive(); }

  const filterGroups = {};
  function initializeFilterGroups() {
    Object.entries(filterGroupDefs).forEach(([name, def]) => {
      const present = new Set(facilities.map(def.key));
      const categories = def.categories.filter(([label]) => present.has(label));
      [...present].filter(label => !categories.some(([known]) => known === label)).sort().forEach(label => categories.push([label, "#64748b"]));
      const container = els[`${name}Checks`];
      container.innerHTML = categories.map(([label, color], index) => {
        const id = `${name}Choice${index}`;
        return `<label class="choice-checkbox" for="${id}"><input id="${id}" type="checkbox" value="${escapeHtml(label)}" checked><span class="choice-dot" style="--choice-color:${color}"></span><span class="choice-label">${escapeHtml(label)}</span><span class="choice-count" data-choice-count="${escapeHtml(label)}">0</span></label>`;
      }).join("");
      filterGroups[name] = { ...def, categories, container, summary: els[`${name}Selection`] };
      container.querySelectorAll("input").forEach(input => input.addEventListener("change", applyFilters));
    });
  }

  function selectedValues(name) {
    return [...filterGroups[name].container.querySelectorAll("input:checked")].map(input => input.value);
  }

  function setGroupSelection(name, values) {
    const wanted = new Set(values);
    filterGroups[name].container.querySelectorAll("input").forEach(input => { input.checked = wanted.has(input.value); });
  }

  initializeFilterGroups();

  function stateFill(s) {
    if (currentView === "policy") return policyColor(policyMeasure(s));
    if (currentView === "cost") return costColor(electricityPrice(s));
    return "";
  }

  function renderStates() {
    els.stateLayer.innerHTML = states.map(s => `<path class="state${s.abbr === selectedStateAbbr || votesActive() && s.abbr === els.stateFilter.value ? " selected" : ""}" data-state="${s.abbr}" d="${s.path}" style="fill:${stateFill(s)}" ${stateIsInteractive() ? `role="button" tabindex="0" aria-label="${votesActive() ? "Show" : "Open"} ${escapeHtml(s.name)} ${precinctActive() ? "precinct vote share and data centers" : districtActive() ? "congressional district vote share and data centers" : currentView === "cost" ? "electricity-price details" : "legislation details"}"` : ""}><title>${escapeHtml(s.name)}</title></path>`).join("");
    els.stateLayer.querySelectorAll(".state").forEach(path => {
      const state = states.find(item => item.abbr === path.dataset.state);
      path.addEventListener("pointerenter", event => showStateTooltip(event, state));
      path.addEventListener("pointermove", positionTooltip);
      path.addEventListener("pointerleave", hideTooltip);
      path.addEventListener("click", event => {
        if (!stateIsInteractive()) return;
        event.stopPropagation();
        selectState(state.abbr);
      });
      path.addEventListener("keydown", event => {
        if (!stateIsInteractive() || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        selectState(state.abbr);
      });
    });
  }

  function colorFor(f) {
    if (votesActive()) return "#fef08a";
    if (currentView === "generation" || currentView === "cost") return "#e2e8f0";
    const cfg = config[currentView];
    const key = cfg.key(f);
    return cfg.categories.find(c => c[0] === key)?.[1] || "#64748b";
  }

  function radiusFor(f) {
    if (votesActive()) return 6 / transform.scale;
    if (!f.mw) return 2.7;
    return Math.max(3, Math.min(8.5, 2.6 + Math.log10(f.mw + 1) * 1.8));
  }

  function visiblePowerPlants() {
    const source = els.generationSource.value;
    const state = els.stateFilter.value;
    return powerPlants.filter(plant => (!source || plant.fuel === source) && (!state || plant.state === state));
  }

  function plantRadius(plant) {
    if (!plant.capacityMw) return 1.35;
    return Math.max(1.5, Math.min(5.6, 1.25 + Math.log10(plant.capacityMw + 1) * 1.25));
  }

  function plantColor(plant) {
    return config.generation.categories.find(([label]) => label === config.generation.key(plant))?.[1] || "#475569";
  }

  function renderTransmissionLines() {
    if (currentView !== "generation" || !els.transmissionToggle.checked || !transmissionData) {
      els.transmissionLayer.innerHTML = "";
      return;
    }
    els.transmissionLayer.innerHTML = transmissionData.paths.map(item => {
      const voltageClass = item.class.startsWith("Extra-high") ? "extra-high" : "high";
      return `<path class="transmission-line ${voltageClass}" d="${item.d}"><title>${escapeHtml(item.class)} · ${fmt.format(item.featureCount)} mapped features</title></path>`;
    }).join("");
  }

  function renderPlants() {
    hideTooltip();
    if (currentView !== "generation") {
      els.plantLayer.innerHTML = "";
      return;
    }
    els.plantLayer.innerHTML = visiblePowerPlants().map(plant => `<circle class="power-plant${plant.id === selectedPlantId ? " selected" : ""}" data-id="${escapeHtml(plant.id)}" cx="${plant.x}" cy="${plant.y}" r="${plantRadius(plant)}" fill="${plantColor(plant)}"><title>${escapeHtml(plant.name)}</title></circle>`).join("");
  }

  function renderFacilities() {
    const selected = selectedId;
    els.facilityLayer.innerHTML = filtered.map(f => `<circle class="facility${f.id === selected ? " selected" : ""}" data-id="${escapeHtml(f.id)}" cx="${f.x}" cy="${f.y}" r="${radiusFor(f)}" fill="${colorFor(f)}"><title>${escapeHtml(f.name)}</title></circle>`).join("");
    els.facilityLayer.querySelectorAll(".facility").forEach(circle => {
      circle.addEventListener("pointerenter", event => showTooltip(event, facilities.find(f => f.id === circle.dataset.id)));
      circle.addEventListener("pointermove", positionTooltip);
      circle.addEventListener("pointerleave", hideTooltip);
      circle.addEventListener("click", event => { event.stopPropagation(); selectFacility(circle.dataset.id); });
    });
  }

  function showPlantTooltip(event, plant) {
    els.tooltip.innerHTML = `<strong>${escapeHtml(plant.name)}</strong><span>${escapeHtml([plant.county, plant.state].filter(Boolean).join(", "))} · ${escapeHtml(plant.fuel || "Unknown source")} · ${escapeHtml(value(plant.capacityMw, " MW"))}</span>`;
    els.tooltip.hidden = false;
    positionTooltip(event);
  }

  function showTooltip(event, f) {
    const resourceContext = currentView === "water"
      ? ` · Water scarcity: ${value(f.waterClass)} · AWARE: ${value(f.waterFactor)}`
      : currentView === "hazard" ? ` · ${activeHazard().label}: ${facilityHazard(f)}` : "";
    els.tooltip.innerHTML = `<strong>${escapeHtml(f.name)}</strong><span>${escapeHtml([f.city, f.state].filter(Boolean).join(", "))} · ${escapeHtml(f.phase || "Unknown status")} · ${escapeHtml(value(f.mw, " MW"))}${escapeHtml(resourceContext)}</span>`;
    els.tooltip.hidden = false;
    positionTooltip(event);
  }
  function showStateTooltip(event, state) {
    if (!stateIsInteractive()) return;
    if (votesActive()) {
      els.tooltip.innerHTML = `<strong>${escapeHtml(state.name)}</strong><span>Click to view data centers by 2024 ${precinctActive() ? "precinct" : "congressional district"} vote share</span>`;
    } else if (currentView === "cost") {
      const price = state.electricityPrice;
      els.tooltip.innerHTML = `<strong>${escapeHtml(state.name)}</strong><span>${price ? `2024 industrial average: ${priceFmt.format(price.industrial)} ¢/kWh<br>Inflation-adjusted: ${priceFmt.format(price.industrialReal2020)} ¢/kWh in 2020 dollars` : "Electricity-price data unavailable"}</span>`;
    } else {
      els.tooltip.innerHTML = `<strong>${escapeHtml(state.name)}</strong><span>${escapeHtml(policyMetricLabel())}: ${fmt.format(policyMeasure(state))}<br>Total bills: ${fmt.format(state.billCount || 0)} · Active: ${fmt.format(state.billStatus?.Active || 0)} · Passed: ${fmt.format(state.billStatus?.Pass || 0)}</span>`;
    }
    els.tooltip.hidden = false;
    positionTooltip(event);
  }
  function positionTooltip(event) {
    const rect = els.mapShell.getBoundingClientRect();
    els.tooltip.style.left = `${Math.min(event.clientX - rect.left + 12, rect.width - 270)}px`;
    els.tooltip.style.top = `${Math.max(event.clientY - rect.top - 54, 8)}px`;
  }
  function hideTooltip() { els.tooltip.hidden = true; }

  function currentFilters() {
    return {
      query: els.searchInput.value.trim().toLowerCase(), state: els.stateFilter.value,
      statuses: selectedValues("status"), activities: selectedValues("activity"), capacities: selectedValues("capacity"),
      powerSources: selectedValues("power"), timelineBasis: timelineMode, throughYear: timelineYear
    };
  }

  function matchesFilters(f, q, omitGroup = null) {
    const haystack = [f.name, f.operator, f.city, f.county, f.state].filter(Boolean).join(" ").toLowerCase();
    if (q.query && !haystack.includes(q.query)) return false;
    if (q.state && f.state !== q.state) return false;
    if (!matchesTimeline(f)) return false;
    if (omitGroup !== "status" && !q.statuses.includes(filterGroupDefs.status.key(f))) return false;
    if (omitGroup !== "activity" && !q.activities.includes(filterGroupDefs.activity.key(f))) return false;
    if (omitGroup !== "capacity" && !q.capacities.includes(filterGroupDefs.capacity.key(f))) return false;
    if (omitGroup !== "power" && !q.powerSources.includes(filterGroupDefs.power.key(f))) return false;
    return true;
  }

  function updateCheckboxCounts(q) {
    Object.entries(filterGroups).forEach(([name, group]) => {
      const counts = new Map(group.categories.map(([label]) => [label, 0]));
      facilities.filter(f => matchesFilters(f, q, name)).forEach(f => {
        const label = group.key(f);
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      group.container.querySelectorAll("[data-choice-count]").forEach(span => { span.textContent = fmt.format(counts.get(span.dataset.choiceCount) || 0); });
      const selected = selectedValues(name).length;
      group.summary.textContent = `${selected} of ${group.categories.length}`;
    });
  }

  function applyFilters() {
    const q = currentFilters();
    filtered = facilities.filter(f => matchesFilters(f, q));
    if (selectedId && !filtered.some(f => f.id === selectedId)) clearSelection();
    if (selectedPlantId && !visiblePowerPlants().some(plant => plant.id === selectedPlantId)) clearSelection();
    renderPlants();
    renderFacilities();
    renderSummary();
    if (votesActive() && selectedStateAbbr && stateByAbbr.has(selectedStateAbbr)) showVoteStateDetails(stateByAbbr.get(selectedStateAbbr));
    if (districtActive() && selectedDistrict) showDistrictDetails(selectedDistrict);
    updateCheckboxCounts(q);
  }

  function renderSummary() {
    const count = filtered.length;
    const mwValues = filtered.map(f => f.mw).filter(Number.isFinite);
    const mwTotal = mwValues.reduce((a, b) => a + b, 0);
    const operating = filtered.filter(f => f.phase === "Operating").length;
    const opposition = filtered.filter(f => f.directOpposition === 1).length;
    els.selectionCount.textContent = `${fmt.format(count)} ${count === 1 ? "facility" : "facilities"}`;
    els.metricFacilities.textContent = fmt.format(count);
    els.metricShare.textContent = `${pct(count / facilities.length * 100)} of inventory`;
    els.metricMw.textContent = mwValues.length ? `${fmt.format(mwTotal)} MW` : "—";
    els.metricOperating.textContent = count ? pct(operating / count * 100) : "—";
    els.metricOpposition.textContent = count ? pct(opposition / count * 100) : "—";
    renderProfileChart();
    const knownMw = count ? pct(mwValues.length / count * 100) : "—";
    const utilityMatches = filtered.filter(f => f.utilityMatch && f.utilityMatch.includes("Unique")).length;
    if (districtActive()) {
      const summary = districtFacilitySummary();
      const where = els.stateFilter.value ? ` in ${els.stateFilter.value}` : " nationally";
      els.coverageLine.textContent = summary
        ? `${fmt.format(districtData.districts.length)} congressional districts use 2024 presidential results and 119th Congress boundaries. ${fmt.format(summary.matched)} of ${fmt.format(count)} selected facility points${where} match a district; ${fmt.format(summary.unmatched)} are outside the mapped boundary. Presidential voting does not measure data-center opposition.`
        : "Loading 2024 congressional district results…";
    } else if (votesActive()) {
      const state = els.stateFilter.value;
      const stat = state ? voteManifest?.states?.[state] : null;
      const mapped = state ? stat?.count : voteManifest?.count;
      els.coverageLine.textContent = mapped
        ? `${fmt.format(mapped)} mapped precincts${state ? ` in ${state}` : ` across ${Object.keys(voteManifest.states).length} jurisdictions`}. ${state ? "" : "Select a state to load the results directly from The New York Times. "}${stat ? fmt.format(stat.official) : fmt.format(Object.values(voteManifest.states).reduce((sum, item) => sum + item.official, 0))} use official boundaries. ${fmt.format(voteManifest.unmapped)} source ${voteManifest.unmapped === 1 ? "record lacks" : "records lack"} display geometry. Some counties or states have no usable results. Presidential voting does not measure data-center opposition.`
        : voteManifest ? `No mapped New York Times precinct results for ${state}. Presidential voting does not measure data-center opposition.` : "Loading New York Times 2024 precinct results…";
    } else if (currentView === "generation") {
      const plants = visiblePowerPlants();
      const capacity = plants.map(plant => plant.capacityMw).filter(Number.isFinite).reduce((sum, plantMw) => sum + plantMw, 0);
      const source = els.generationSource.value || "all generation sources";
      const transmissionNote = els.transmissionToggle.checked
        ? transmissionData ? ` ${fmt.format(transmissionData.featureCount)} mapped 200+ kV transmission features are overlaid.` : " The transmission overlay is loading."
        : " Turn on the transmission overlay to add mapped 200+ kV lines.";
      els.coverageLine.textContent = `${fmt.format(plants.length)} eGRID plants shown for ${source}${els.stateFilter.value ? ` in ${els.stateFilter.value}` : " nationally"}, representing ${fmt.format(capacity)} MW of reported nameplate capacity.${transmissionNote} Proximity does not establish a supply relationship.`;
    } else if (currentView === "cost") {
      const available = states.filter(state => Number.isFinite(electricityPrice(state)));
      const selectedState = stateByAbbr.get(els.stateFilter.value);
      const selectedNote = selectedState && Number.isFinite(electricityPrice(selectedState)) ? ` ${selectedState.name}: ${priceFmt.format(electricityPrice(selectedState))} ¢/kWh.` : "";
      els.coverageLine.textContent = `${fmt.format(available.length)} contiguous states have 2024 industrial-price values.${selectedNote} Alaska and Hawaii are unavailable in this source. State averages do not represent facility-specific tariffs or contracts.`;
    } else if (currentView === "water") {
      const available = filtered.filter(f => Number.isFinite(f.waterFactor)).length;
      els.coverageLine.textContent = `${fmt.format(available)} of ${fmt.format(count)} selected facilities have a county AWARE factor. This is relative scarcity screening, not facility water use or available supply.`;
    } else if (currentView === "hazard") {
      const rated = filtered.filter(f => !["Unknown", "No Rating", "Insufficient Data"].includes(facilityHazard(f))).length;
      els.coverageLine.textContent = `${fmt.format(rated)} of ${fmt.format(count)} selected facilities have a rated ${activeHazard().label.toLowerCase()} category in the FEMA National Risk Index. Ratings are county context, not parcel-level exposure.`;
    } else if (currentView === "policy") {
      const stateCount = states.filter(state => (state.billCount || 0) > 0).length;
      els.coverageLine.textContent = `${fmt.format(stateCount)} states have tracked bills. Topic counts are non-exclusive because one bill may address several policy types; counts measure legislative attention, not stringency.`;
    } else {
      els.coverageLine.textContent = `Reported capacity coverage: ${knownMw}. Unique candidate-utility match: ${count ? pct(utilityMatches / count * 100) : "—"}.`;
    }
  }

  function renderProfileChart() {
    els.statusChart.classList.toggle("votes-chart", votesActive());
    if (districtActive()) {
      const summary = districtFacilitySummary();
      const { counts, unmatched, matched } = summary || { counts: voteCategories.map(() => 0), unmatched: 0, matched: 0 };
      const max = Math.max(...counts, unmatched, 1);
      els.profileEyebrow.textContent = els.stateFilter.value ? `${els.stateFilter.value} facility profile` : "National facility profile";
      els.profileTitle.textContent = "Data centers by district vote share";
      els.chartTotal.textContent = summary ? `${fmt.format(matched)} of ${fmt.format(filtered.length)} matched` : "Loading…";
      els.statusChart.innerHTML = summary
        ? voteCategories.map(([label, color], index) => `<div class="bar-row"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${counts[index] / max * 100}%;background:${color}"></div></div><strong>${fmt.format(counts[index])}</strong></div>`).join("")
          + `<div class="bar-row"><span title="Outside mapped district">Outside district</span><div class="bar-track"><div class="bar-fill" style="width:${unmatched / max * 100}%;background:#64748b"></div></div><strong>${fmt.format(unmatched)}</strong></div>`
          + `<p class="chart-note">Selected facility points are assigned to Census 119th congressional districts. Categories show the Harris–Trump margin as a share of all presidential votes.</p>`
        : `<p class="chart-empty">Loading congressional district results…</p>`;
      return;
    }
    if (votesActive()) {
      const state = els.stateFilter.value;
      const summary = state ? voteFacilitySummary(state) : null;
      const { counts, unmatched, matched } = summary || { counts: voteCategories.map(() => 0), unmatched: 0, matched: 0 };
      const max = Math.max(...counts, unmatched, 1);
      els.profileEyebrow.textContent = state ? `${state} facility profile` : "Presidential vote profile";
      els.profileTitle.textContent = "Data centers by 2024 vote share";
      els.chartTotal.textContent = summary ? `${fmt.format(matched)} of ${fmt.format(filtered.length)} matched` : state ? voteManifest && !voteManifest.states[state] ? "No mapped results" : "Loading…" : "Choose a state";
      els.statusChart.innerHTML = summary
        ? voteCategories.map(([label, color], index) => `<div class="bar-row"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${counts[index] / max * 100}%;background:${color}"></div></div><strong>${fmt.format(counts[index])}</strong></div>`).join("")
          + `<div class="bar-row"><span title="No mapped precinct">No mapped precinct</span><div class="bar-track"><div class="bar-fill" style="width:${unmatched / max * 100}%;background:#64748b"></div></div><strong>${fmt.format(unmatched)}</strong></div>`
          + `<p class="chart-note">Selected facilities are assigned by point location to a mapped precinct. Categories show the Harris–Trump margin as a share of all presidential votes. Unmatched facilities are kept separate.</p>`
        : `<p class="chart-empty">${state && voteManifest && !voteManifest.states[state] ? "No mapped precinct results for this state." : "Click a state or choose one in the State filter to compare its data centers."}</p>`;
      return;
    }
    if (currentView === "generation") {
      const counts = {};
      visiblePowerPlants().forEach(plant => counts[plant.fuel || "Unknown"] = (counts[plant.fuel || "Unknown"] || 0) + 1);
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const max = Math.max(...rows.map(row => row[1]), 1);
      els.profileEyebrow.textContent = "Power infrastructure profile";
      els.profileTitle.textContent = "Plants by generation source";
      els.chartTotal.textContent = `${fmt.format(visiblePowerPlants().length)} plants`;
      els.statusChart.innerHTML = rows.length ? rows.map(([label, count]) => `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${count/max*100}%;background:${plantColor({ fuel: label })}"></div></div><strong>${fmt.format(count)}</strong></div>`).join("") : `<p class="detail-location">No power plants match this source and state.</p>`;
      return;
    }
    if (currentView === "cost") {
      const rows = states.filter(state => Number.isFinite(electricityPrice(state))).sort((a, b) => electricityPrice(b) - electricityPrice(a)).slice(0, 8);
      const max = Math.max(...rows.map(electricityPrice), 1);
      els.profileEyebrow.textContent = "State price comparison";
      els.profileTitle.textContent = "Highest 2024 industrial averages";
      els.chartTotal.textContent = `${fmt.format(meta.electricityPriceStates || rows.length)} states`;
      els.statusChart.innerHTML = rows.map(state => `<div class="bar-row"><span title="${escapeHtml(state.name)}">${escapeHtml(state.abbr)}</span><div class="bar-track"><div class="bar-fill cost" style="width:${electricityPrice(state)/max*100}%"></div></div><strong>${priceFmt.format(electricityPrice(state))}¢</strong></div>`).join("");
      return;
    }
    if (currentView === "policy") {
      const counts = {};
      states.forEach(state => Object.entries(state.billTypes || {}).forEach(([type, count]) => { counts[type] = (counts[type] || 0) + count; }));
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const max = Math.max(...rows.map(row => row[1]), 1);
      els.profileEyebrow.textContent = "National legislation profile";
      els.profileTitle.textContent = "Most common bill types";
      els.chartTotal.textContent = `${fmt.format(states.reduce((sum, state) => sum + (state.billCount || 0), 0))} bills`;
      els.statusChart.innerHTML = rows.map(([label, count]) => `<div class="bar-row"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill policy" style="width:${count/max*100}%"></div></div><strong>${fmt.format(count)}</strong></div>`).join("");
      return;
    }
    if (currentView === "water" || currentView === "hazard") {
      const cfg = config[currentView];
      const counts = {};
      filtered.forEach(f => { const label = cfg.key(f); counts[label] = (counts[label] || 0) + 1; });
      const rows = cfg.categories.map(([label, color]) => [label, counts[label] || 0, color]).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
      const max = Math.max(...rows.map(([, count]) => count), 1);
      els.profileEyebrow.textContent = currentView === "water" ? "Water profile" : "Hazard profile";
      els.profileTitle.textContent = currentView === "water" ? "Water-scarcity distribution" : `${activeHazard().label} distribution`;
      els.chartTotal.textContent = `${fmt.format(filtered.length)} records`;
      els.statusChart.innerHTML = rows.length ? rows.map(([label, count, color]) => `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${count/max*100}%;background:${color}"></div></div><strong>${fmt.format(count)}</strong></div>`).join("") : `<p class="detail-location">No facilities match these filters.</p>`;
      return;
    }
    const counts = {};
    filtered.forEach(f => counts[f.phase || "Unknown"] = (counts[f.phase || "Unknown"] || 0) + 1);
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(...rows.map(r => r[1]), 1);
    els.profileEyebrow.textContent = "Selection profile";
    els.profileTitle.textContent = "Status distribution";
    els.chartTotal.textContent = `${fmt.format(filtered.length)} records`;
    els.statusChart.innerHTML = rows.length ? rows.map(([label, count]) => `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${count/max*100}%"></div></div><strong>${fmt.format(count)}</strong></div>`).join("") : `<p class="detail-location">No facilities match these filters.</p>`;
  }

  function renderLegend() {
    const cfg = activeConfig();
    if (votesActive() && els.legend.parentElement === els.mapShell) els.mapShell.insertAdjacentElement("afterend", els.legend);
    if (!votesActive() && els.legend.parentElement !== els.mapShell) els.mapShell.append(els.legend);
    els.legend.classList.toggle("vote-legend", votesActive());
    els.viewTitle.textContent = cfg.title;
    els.insightTitle.textContent = cfg.insight[0];
    els.insightText.textContent = cfg.insight[1];
    if (!cfg.source) {
      els.insightSource.textContent = "";
    } else if (cfg.sourceUrl) {
      els.insightSource.innerHTML = `Data source: <a href="${escapeHtml(cfg.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(cfg.source)}</a>`;
    } else {
      els.insightSource.textContent = `Data source: ${cfg.source}`;
    }
    if (districtActive()) els.insightSource.innerHTML = `Results: <a href="${districtConfig.sourceUrl}" target="_blank" rel="noopener">2024 Pres by CD, curated by Drew Savicki</a> · Boundaries: <a href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html" target="_blank" rel="noopener">U.S. Census Bureau, 119th Congress</a>.`;
    if (votesActive()) {
      els.legend.innerHTML = voteCategories.map(([label, color]) => `<div class="legend-item"><span class="legend-swatch state-swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span></div>`).join("") + `<div class="legend-note">Harris minus Trump as a share of all votes. ${districtActive() ? "Choose a state for its facility counts or click a district for vote totals." : "Click a state for its facility counts or a precinct for vote totals."}<br><span class="vote-facility-key"></span> Data centers</div>`;
    } else if (currentView === "cost") {
      els.legend.innerHTML = costBins.map((bin, index) => `<div class="legend-item"><span class="legend-swatch state-swatch" style="background:${costColors[index]}"></span><span>${escapeHtml(bin.label)}</span></div>`).join("") + `<div class="legend-item"><span class="legend-swatch state-swatch" style="background:#172938"></span><span>Unavailable</span></div><div class="legend-note">2024 state industrial average.<br>Facilities are pale context points.</div>`;
    } else if (currentView === "policy") {
      els.viewTitle.textContent = policyMetricLabel();
      els.legend.innerHTML = policyBins.map((bin, index) => `<div class="legend-item"><span class="legend-swatch" style="background:${policyColors[index]}"></span><span>${escapeHtml(bin.label)}</span></div>`).join("") + `<div class="legend-note">${escapeHtml(policyMetricLabel())}<br>Click a state for bill types and records.</div>`;
    } else if (currentView === "generation") {
      const source = els.generationSource.value;
      els.viewTitle.textContent = source ? `${source} power plants` : cfg.title;
      const lineKeys = els.transmissionToggle.checked && transmissionData
        ? `<div class="transmission-key"><span class="line-key high"></span> 200–499 kV</div><div class="transmission-key"><span class="line-key extra-high"></span> 500+ kV</div>`
        : "";
      els.legend.innerHTML = cfg.categories.map(([label, color]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span></div>`).join("") + `<div class="legend-note">${lineKeys}<span class="facility-key"></span> Data centers shown as pale context points.<br>Circle size reflects nameplate capacity.</div>`;
    } else if (currentView === "hazard") {
      els.viewTitle.textContent = `${activeHazard().label} rating`;
      els.legend.innerHTML = cfg.categories.map(([label, color]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span></div>`).join("") + `<div class="legend-note">FEMA National Risk Index county rating.<br>Select another hazard measure above.</div>`;
    } else {
      els.legend.innerHTML = cfg.categories.map(([label, color]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span></div>`).join("");
    }
  }

  function detailItem(label, val) { return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value(val))}</strong></div>`; }
  function detailSection(title, items) { return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.join("")}</div></section>`; }

  function selectCostState(state) {
    selectedStateAbbr = state.abbr;
    selectedId = null;
    selectedPlantId = null;
    const price = state.electricityPrice;
    const history = price?.history || [];
    const first = history[0];
    const change = first && price ? (price.industrial / first.industrial - 1) * 100 : NaN;
    const historyRows = history.filter(item => item.year === history[0]?.year || item.year === price?.year || item.year % 3 === 0);
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">${escapeHtml(state.abbr)} electricity cost</span><h2>${escapeHtml(state.name)}</h2><p class="detail-location">EIA-861 state average revenue per kilowatt-hour</p></div><button class="close-detail" type="button" aria-label="Close state details">×</button></div>
      ${price ? `<div class="policy-summary">
        <article><span>2024 industrial</span><strong>${priceFmt.format(price.industrial)} ¢/kWh</strong></article>
        <article><span>All sectors</span><strong>${priceFmt.format(price.total)} ¢/kWh</strong></article>
        <article><span>Industrial, 2020 dollars</span><strong>${priceFmt.format(price.industrialReal2020)} ¢/kWh</strong></article>
        <article><span>${first.year}–${price.year} change</span><strong>${Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${fmt.format(change)}%` : "Unknown"}</strong></article>
      </div>
      <section class="detail-section"><h3>Industrial price history</h3><div class="cost-history">${historyRows.map(item => `<div><span>${item.year}</span><strong>${priceFmt.format(item.industrial)} ¢/kWh</strong><small>${priceFmt.format(item.industrialReal2020)} ¢ in 2020 dollars</small></div>`).join("")}</div></section>
      ${detailSection("Dataset context", [detailItem("Latest year", String(price.year)), detailItem("Historical variance", fmt.format(price.industrialVariance)), detailItem("Coverage", "Contiguous 48 states"), detailItem("Measure", "State industrial average")])}` : `<section class="detail-section"><p class="detail-location">This source does not provide an electricity-price value for ${escapeHtml(state.name)}.</p></section>`}
      <p class="policy-note">This state average is broad market context. It is not a utility tariff, demand charge, negotiated data-center contract, or estimate of a facility’s electricity bill.</p>
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    renderStates();
    renderFacilities();
  }

  function selectState(abbr) {
    const state = states.find(item => item.abbr === abbr);
    if (!state) return;
    if (votesActive()) {
      setVoteState(abbr);
      return;
    }
    if (currentView === "cost") { selectCostState(state); return; }
    selectedStateAbbr = abbr;
    selectedId = null;
    selectedPlantId = null;
    const typeRows = Object.entries(state.billTypes || {}).sort((a, b) => b[1] - a[1]);
    const maxType = Math.max(...typeRows.map(([, count]) => count), 1);
    const bills = state.bills || [];
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">${escapeHtml(state.abbr)} legislation</span><h2>${escapeHtml(state.name)}</h2><p class="detail-location">${fmt.format(state.billCount || 0)} tracked state bills · 2024–2026 snapshot</p></div><button class="close-detail" type="button" aria-label="Close state details">×</button></div>
      <div class="policy-summary">
        <article><span>Active</span><strong>${fmt.format(state.billStatus?.Active || 0)}</strong></article>
        <article><span>Passed</span><strong>${fmt.format(state.billStatus?.Pass || 0)}</strong></article>
        <article><span>Failed</span><strong>${fmt.format(state.billStatus?.Fail || 0)}</strong></article>
        <article><span>Vetoed</span><strong>${fmt.format(state.billStatus?.Veto || 0)}</strong></article>
      </div>
      <section class="detail-section"><h3>Bill types</h3><div class="policy-type-list">${typeRows.length ? typeRows.map(([type, count]) => `<div class="policy-type-row"><span title="${escapeHtml(type)}">${escapeHtml(type)}</span><strong>${fmt.format(count)}</strong><div class="policy-type-track"><i style="width:${count/maxType*100}%"></i></div></div>`).join("") : `<p class="detail-location">No tracked bill types.</p>`}</div><p class="policy-note">Types are non-exclusive. A multi-topic bill is counted once in each applicable category.</p></section>
      <section class="detail-section"><h3>Tracked bills</h3><div class="bill-list">${bills.length ? bills.slice(0, 10).map(bill => `<article class="bill-card"><div class="bill-card-top">${bill.sourceUrl ? `<a href="${escapeHtml(bill.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(bill.bill)} · ${escapeHtml(bill.year)}</a>` : `<strong>${escapeHtml(bill.bill)} · ${escapeHtml(bill.year)}</strong>`}<span class="bill-status">${escapeHtml(bill.status)}</span></div><p>${escapeHtml(bill.title)}</p><div class="bill-types">${escapeHtml((bill.types || []).join(" · ") || "No type recorded")}${bill.lastActionDate ? ` · Last action ${escapeHtml(bill.lastActionDate)}` : ""}</div></article>`).join("") : `<p class="detail-location">No tracked bills for this state.</p>`}</div>${bills.length > 10 ? `<p class="policy-note">Showing 10 of ${fmt.format(bills.length)} bills. Export the state file for the full list.</p>` : ""}<button id="exportStateBills" class="secondary-button state-export" type="button" ${bills.length ? "" : "disabled"}>Export ${escapeHtml(state.abbr)} bills CSV</button></section>
      ${detailSection("Other policy context", [detailItem("Dedicated incentive", state.incentive ? "Yes" : "No"), detailItem("Electricity-tax incentive", state.electricityTax ? "Yes" : "No"), detailItem("Moratorium tracker entries", state.moratoriumCount)])}
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    els.detailPanel.querySelector("#exportStateBills")?.addEventListener("click", () => exportStateBills(state));
    renderStates();
    renderFacilities();
  }
  function setVoteState(abbr) {
    if (abbr && ![...els.stateFilter.options].some(option => option.value === abbr)) els.stateFilter.add(new Option(abbr, abbr));
    els.stateFilter.value = abbr;
    clearSelection();
    selectedStateAbbr = abbr || null;
    applyFilters();
    renderStates();
    renderVoteLayer();
  }

  function exportStateBills(state) {
    const headers = ["state", "bill", "year", "status", "bill_types", "summary_title", "last_action_date", "source_url"];
    const rows = (state.bills || []).map(bill => [state.abbr, bill.bill, bill.year, bill.status, (bill.types || []).join("; "), bill.title, bill.lastActionDate, bill.sourceUrl]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${state.abbr.toLowerCase()}_data_center_bills.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  function selectFacility(id) {
    selectedId = id;
    selectedPlantId = null;
    selectedStateAbbr = null;
    selectedDistrict = null;
    els.voteLayer.querySelector(".vote-district.selected")?.classList.remove("selected");
    const f = facilities.find(item => item.id === id);
    if (!f) return;
    const statePrice = stateByAbbr.get(f.state)?.electricityPrice;
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">${escapeHtml(f.id)}</span><h2>${escapeHtml(f.name)}</h2><p class="detail-location">${escapeHtml([f.city, f.county, f.state].filter(Boolean).join(" · "))}</p></div><button class="close-detail" type="button" aria-label="Close facility details">×</button></div>
      <span class="phase-pill">${escapeHtml(f.phase || "Unknown status")}</span>
      ${detailSection("Facility", [detailItem("Operator", f.operator), detailItem("Purpose", f.purpose), detailItem("Capacity", f.mw == null ? "Unknown" : `${fmt.format(f.mw)} MW`), detailItem("Capacity class", f.capacity), detailItem("Power source", f.power), detailItem("Reported acreage", f.acres == null ? f.acreageClass : `${fmt.format(f.acres)} acres`), detailItem("Added to inventory", f.dateCreated), detailItem("Last updated in inventory", f.dateUpdated), detailItem("Reported/expected online", f.onlineYear == null ? null : String(f.onlineYear))])}
      ${detailSection("Power and grid", [detailItem("Candidate utility", f.utility), detailItem("Utility match", f.utilityMatch), detailItem("eGRID subregion", f.subregion), detailItem("State industrial price", statePrice ? `${priceFmt.format(statePrice.industrial)} ¢/kWh (${statePrice.year})` : "Unknown"), detailItem("200+ kV line", f.txKm == null ? "Unknown" : `${fmt.format(f.txKm)} km`), detailItem("Nearest substation", f.substationKm == null ? "Unknown" : `${fmt.format(f.substationKm)} km`), detailItem("Active queue MW", f.queueActiveMw == null ? "Unknown" : `${fmt.format(f.queueActiveMw)} MW`)])}
      ${detailSection("Water", [detailItem("Water scarcity", f.waterClass), detailItem("AWARE factor", f.waterFactor)])}
      ${detailSection("Hazards", [detailItem("Overall hazard", f.risk), detailItem("Drought", f.drought), detailItem("Riverine flood", f.flood), detailItem("Heat wave", f.heat), detailItem("Wildfire", f.wildfire)])}
      ${detailSection("Policy and opposition", [detailItem("Dedicated incentive", f.incentive ? "Yes" : "No"), detailItem("Tracked state bills", f.billCount), detailItem("Moratorium entries", f.moratoriumCount), detailItem("Opposition evidence", f.oppositionClass), detailItem("County events", f.countyEvents), detailItem("Local actions", f.localActions)])}
      ${detailSection("Evidence", [detailItem("Location confidence", f.locationConfidence), detailItem("Inventory source", f.source)])}
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    renderFacilities();
    renderPlants();
  }

  function selectPowerPlant(id) {
    const plant = plantById.get(id);
    if (!plant) return;
    selectedPlantId = id;
    selectedId = null;
    selectedStateAbbr = null;
    const capacityFactor = Number.isFinite(plant.capacityFactor) ? `${fmt.format(plant.capacityFactor * 100)}%` : "Unknown";
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">eGRID plant ${escapeHtml(plant.id)}</span><h2>${escapeHtml(plant.name)}</h2><p class="detail-location">${escapeHtml([plant.county, plant.state].filter(Boolean).join(" · "))}</p></div><button class="close-detail" type="button" aria-label="Close power plant details">×</button></div>
      <span class="phase-pill plant-source-pill">${escapeHtml(plant.fuel || "Unknown source")}</span>
      ${detailSection("Generation", [detailItem("Primary source", plant.fuel), detailItem("Nameplate capacity", plant.capacityMw == null ? "Unknown" : `${fmt.format(plant.capacityMw)} MW`), detailItem("Annual net generation", plant.generationMwh == null ? "Unknown" : `${fmt.format(plant.generationMwh)} MWh`), detailItem("Capacity factor", capacityFactor), detailItem("Generating units", plant.units), detailItem("Generators", plant.generators)])}
      ${detailSection("Ownership and grid", [detailItem("Operator", plant.operator), detailItem("Utility service", plant.utility), detailItem("Sector", plant.sector), detailItem("eGRID subregion", plant.subregion), detailItem("Generator status codes", plant.statusCodes)])}
      ${detailSection("Evidence", [detailItem("Data year", meta.powerPlantYear || 2024), detailItem("Dataset status", window.POWER_PLANT_DATA?.datasetStatus), detailItem("Latitude", plant.lat), detailItem("Longitude", plant.lon)])}
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    renderFacilities();
    renderPlants();
  }

  function clearSelection() {
    const hadPrecinct = !!selectedPrecinct;
    const hadDistrict = !!selectedDistrict;
    selectedId = null;
    selectedPlantId = null;
    selectedStateAbbr = null;
    selectedPrecinct = null;
    selectedDistrict = null;
    if (hadPrecinct) els.voteLayer.querySelector(".vote-precinct.selected")?.classList.remove("selected");
    if (hadDistrict) els.voteLayer.querySelector(".vote-district.selected")?.classList.remove("selected");
    els.detailPanel.classList.remove("open");
    els.detailPanel.innerHTML = districtActive()
      ? `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a district</h2><p>Choose a colored congressional district to review presidential vote counts and selected data centers.</p></div>`
      : votesActive()
      ? `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a precinct</h2><p>Choose a colored precinct on the map to review presidential vote counts and boundary status.</p></div>`
      : currentView === "policy"
      ? `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a state</h2><p>Choose a state to review bill counts, statuses, policy types, and bill-level records.</p></div>`
      : currentView === "cost"
        ? `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a state</h2><p>Choose a state to review its 2024 industrial electricity price and historical context.</p></div>`
      : currentView === "generation"
        ? `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a power plant</h2><p>Choose a colored plant marker to review its generation source, capacity, operator, and grid context.</p></div>`
        : `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a facility</h2><p>Choose a point on the map to review evidence from every layer.</p></div>`;
    renderStates();
    renderTransmissionLines();
    renderFacilities();
    renderPlants();
  }

  async function setView(view) {
    if (!config[view]) return;
    const leavingVotes = votesActive() && view !== "opposition";
    currentView = view;
    if (leavingVotes) resetView();
    document.querySelectorAll(".view-button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    els.policyControls.hidden = view !== "policy";
    els.generationControls.hidden = view !== "generation";
    els.hazardControls.hidden = view !== "hazard";
    els.oppositionControls.hidden = view !== "opposition";
    els.mapShell.classList.toggle("policy-mode", view === "policy");
    els.mapShell.classList.toggle("cost-mode", view === "cost");
    els.mapShell.classList.toggle("generation-mode", view === "generation");
    els.mapShell.classList.toggle("votes-mode", votesActive());
    clearSelection();
    renderLegend(); renderSummary();
    renderVoteLayer();
    if (view === "generation") {
      els.viewTitle.textContent = "Loading power plants…";
      els.coverageLine.textContent = "Loading the eGRID plant layer…";
      try {
        await loadPowerPlants();
        if (currentView !== "generation") return;
        renderPlants();
        renderLegend();
        renderSummary();
        if (els.transmissionToggle.checked) {
          try {
            await loadTransmissionLines();
            if (currentView !== "generation" || !els.transmissionToggle.checked) return;
            renderTransmissionLines();
            renderLegend();
            renderSummary();
          } catch (_) {
            els.transmissionStatus.textContent = "Unavailable";
          }
        }
      } catch (_) {
        els.viewTitle.textContent = "Power-plant layer unavailable";
        els.coverageLine.textContent = "The power-plant data file could not be loaded. Refresh the page and try again.";
      }
    }
  }

  function updateTransform() {
    document.getElementById("mapViewport").setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.scale})`);
  }
  function zoom(factor, cx = 500, cy = 300) {
    const old = transform.scale;
    const next = Math.max(1, Math.min(votesActive() ? 30 : 6, old * factor));
    transform.x = cx - (cx - transform.x) * next / old;
    transform.y = cy - (cy - transform.y) * next / old;
    transform.scale = next; updateTransform();
    if (votesActive()) renderFacilities();
  }
  function resetView() { transform = { x: 0, y: 0, scale: 1 }; updateTransform(); if (votesActive()) renderFacilities(); }

  function exportCsv() {
    const headers = ["facility_id", "facility_name", "city", "state", "county", "project_phase", "date_added_to_inventory", "date_last_updated_in_inventory", "reported_expected_online_year", "mw_mid", "capacity_class", "power_source", "state_industrial_price_2024_cents_kwh", "water_scarcity", "aware_factor", "overall_hazard", "drought_hazard", "riverine_flood_hazard", "heat_wave_hazard", "wildfire_hazard", "state_incentive", "moratorium_tracker_count", "opposition_evidence", "latitude", "longitude"];
    const rows = filtered.map(f => [f.id, f.name, f.city, f.state, f.county, f.phase, f.dateCreated, f.dateUpdated, f.onlineYear, f.mw, f.capacity, f.power, stateByAbbr.get(f.state)?.electricityPrice?.industrial, f.waterClass, f.waterFactor, f.risk, f.drought, f.flood, f.heat, f.wildfire, f.incentive, f.moratoriumCount, f.oppositionClass, f.lat, f.lon]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "us_data_centers_filtered.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  els.searchInput.addEventListener("input", applyFilters);
  els.stateFilter.addEventListener("change", () => { if (votesActive()) setVoteState(els.stateFilter.value); else applyFilters(); });
  els.oppositionMeasure.addEventListener("change", () => {
    const leavingVotes = votesActive() && els.oppositionMeasure.value !== oppositionMeasure;
    oppositionMeasure = els.oppositionMeasure.value;
    if (leavingVotes) resetView();
    els.mapShell.classList.toggle("votes-mode", votesActive());
    clearSelection();
    renderLegend();
    renderSummary();
    renderVoteLayer();
  });
  els.timelineBasis.addEventListener("change", () => { stopTimeline(); timelineMode = els.timelineBasis.value; configureTimeline(true); applyFilters(); });
  els.timelineRange.addEventListener("input", () => { stopTimeline(); timelineYear = Number(els.timelineRange.value); renderTimelineCoverage(); applyFilters(); });
  els.timelinePlay.addEventListener("click", playTimeline);
  document.querySelectorAll("[data-filter-action]").forEach(button => button.addEventListener("click", () => {
    const group = filterGroups[button.dataset.filterGroup];
    group.container.querySelectorAll("input").forEach(input => { input.checked = button.dataset.filterAction === "all"; });
    applyFilters();
  }));
  els.resetFilters.addEventListener("click", () => {
    stopTimeline();
    [els.searchInput, els.stateFilter].forEach(el => el.value = "");
    Object.keys(filterGroups).forEach(name => setGroupSelection(name, filterGroups[name].categories.map(([label]) => label)));
    timelineMode = "inventory";
    els.timelineBasis.value = timelineMode;
    configureTimeline(true);
    if (votesActive()) resetView();
    applyFilters();
    if (votesActive()) renderVoteLayer();
  });
  els.exportButton.addEventListener("click", exportCsv);
  els.policyTopic.addEventListener("change", () => {
    policyTopic = els.policyTopic.value;
    renderStates();
    renderLegend();
  });
  policyStatusChecks().forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      policyStatuses = new Set(policyStatusChecks().filter(c => c.checked).map(c => c.value));
      renderStates();
      renderLegend();
    });
  });
  els.generationSource.addEventListener("change", () => {
    if (selectedPlantId && !visiblePowerPlants().some(plant => plant.id === selectedPlantId)) clearSelection();
    renderPlants();
    renderLegend();
    renderSummary();
  });
  els.hazardMeasure.addEventListener("change", () => {
    currentHazardMeasure = els.hazardMeasure.value;
    clearSelection();
    renderLegend();
    renderSummary();
  });
  els.transmissionToggle.addEventListener("change", async () => {
    if (!els.transmissionToggle.checked) {
      els.transmissionStatus.textContent = "";
      renderTransmissionLines();
      renderLegend();
      renderSummary();
      return;
    }
    try {
      await loadTransmissionLines();
      if (currentView !== "generation" || !els.transmissionToggle.checked) return;
      els.transmissionStatus.textContent = `${fmt.format(transmissionData.featureCount)} mapped features`;
      renderTransmissionLines();
      renderLegend();
      renderSummary();
    } catch (_) {
      els.transmissionToggle.checked = false;
      els.transmissionStatus.textContent = "Unavailable";
      renderTransmissionLines();
      renderLegend();
      renderSummary();
    }
  });
  els.plantLayer.addEventListener("pointerover", event => {
    const marker = event.target.closest?.(".power-plant");
    if (marker) showPlantTooltip(event, plantById.get(marker.dataset.id));
  });
  els.plantLayer.addEventListener("pointermove", event => {
    if (event.target.closest?.(".power-plant")) positionTooltip(event);
  });
  els.plantLayer.addEventListener("pointerout", event => {
    if (event.target.closest?.(".power-plant")) hideTooltip();
  });
  els.plantLayer.addEventListener("click", event => {
    const marker = event.target.closest?.(".power-plant");
    if (!marker) return;
    event.stopPropagation();
    selectPowerPlant(marker.dataset.id);
  });
  document.querySelectorAll(".view-button").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  els.zoomIn.addEventListener("click", () => zoom(1.35)); els.zoomOut.addEventListener("click", () => zoom(1/1.35)); els.zoomReset.addEventListener("click", resetView);
  els.map.addEventListener("wheel", event => { event.preventDefault(); const rect = els.map.getBoundingClientRect(); zoom(event.deltaY < 0 ? 1.18 : 1/1.18, (event.clientX-rect.left)/rect.width*1000, (event.clientY-rect.top)/rect.height*600); }, { passive: false });
  els.map.addEventListener("pointerdown", event => {
    if (event.target.classList.contains("facility") || event.target.classList.contains("power-plant") || (stateIsInteractive() && event.target.classList.contains("state"))) return;
    dragging = true;
    dragMoved = false;
    dragStart = { x:event.clientX, y:event.clientY, tx:transform.x, ty:transform.y };
    els.map.classList.add("dragging");
    (event.target.classList.contains("vote-precinct") || event.target.classList.contains("vote-district") ? event.target : els.map).setPointerCapture(event.pointerId);
  });
  els.map.addEventListener("pointermove", event => {
    if (dragging) {
      const dx = event.clientX - dragStart.x, dy = event.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 3) dragMoved = true;
      if (dragMoved) {
        const rect = els.map.getBoundingClientRect();
        transform.x = dragStart.tx + dx / rect.width * 1000;
        transform.y = dragStart.ty + dy / rect.height * 600;
        updateTransform();
      }
      return;
    }
    if (!votesActive() || event.target.classList.contains("facility")) return;
    if (districtActive()) {
      const district = event.target.closest?.(".vote-district");
      if (!district) { hideTooltip(); return; }
      const row = districtData?.districts.find(item => item[0] === district.dataset.district);
      if (!row) return;
      const margin = (row[1] - row[2]) / row[3];
      const count = filtered.filter(facility => districtData.facilities[facility.id] === row[0]).length;
      els.tooltip.innerHTML = `<strong>${row[0]}</strong><span>${margin >= 0 ? "Harris" : "Trump"} +${(Math.abs(margin) * 100).toFixed(1)} points · ${fmt.format(count)} selected data ${count === 1 ? "center" : "centers"}<br>Click for district details</span>`;
      els.tooltip.hidden = false;
      positionTooltip(event);
      return;
    }
    const precinct = event.target.closest?.(".vote-precinct");
    if (!precinct) { hideTooltip(); return; }
    const state = voteDisplayState;
    const index = Number(precinct.dataset.index);
    const row = voteStateRows.get(state)?.[index];
    const margin = row?.[4];
    if (!Number.isFinite(margin)) return;
    els.tooltip.innerHTML = `<strong>${escapeHtml(row?.[0] || `${state} precinct`)}</strong><span>${margin >= 0 ? "Harris" : "Trump"} +${(Math.abs(margin) * 100).toFixed(1)} points${row ? ` · ${fmt.format(row[3])} total votes` : ""}<br>Click for precinct details</span>`;
    els.tooltip.hidden = false;
    positionTooltip(event);
  });
  els.map.addEventListener("pointerup", () => { dragging = false; els.map.classList.remove("dragging"); });
  els.map.addEventListener("pointerleave", hideTooltip);
  els.map.addEventListener("click", event => {
    if (dragMoved) { dragMoved = false; return; }
    if (votesActive()) {
      if (districtActive()) {
        const district = event.target.closest?.(".vote-district");
        if (district) showDistrictDetails(district.dataset.district);
        else if (event.target === els.map) clearSelection();
        return;
      }
      const precinct = event.target.closest?.(".vote-precinct");
      if (precinct && voteDisplayState) selectPrecinct(voteDisplayState, Number(precinct.dataset.index));
      else clearSelection();
      return;
    }
    if (event.target === els.map || (!stateIsInteractive() && event.target.classList.contains("state"))) clearSelection();
  });
  els.voteLayer.addEventListener("keydown", event => {
    if (!districtActive() || !["Enter", " "].includes(event.key)) return;
    const district = event.target.closest?.(".vote-district");
    if (!district) return;
    event.preventDefault();
    showDistrictDetails(district.dataset.district);
  });

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const register = tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {} };
    register({ name: "filter_facilities", title: "Filter facilities", description: "Apply visible dashboard filters, including the cumulative facility timeline.", inputSchema: { type: "object", properties: { state: { type: "string" }, phase: { type: "string" }, query: { type: "string" }, timelineBasis: { type: "string", enum: ["inventory", "online"] }, throughYear: { type: "integer" }, statuses: { type: "array", items: { type: "string" } }, activities: { type: "array", items: { type: "string" } }, capacities: { type: "array", items: { type: "string" } }, powerSources: { type: "array", items: { type: "string" } } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Input must be an object");
      const allowed = new Set(["state", "phase", "query", "timelineBasis", "throughYear", "statuses", "activities", "capacities", "powerSources"]);
      if (Object.keys(input).some(key => !allowed.has(key))) throw new Error("Unsupported filter field");
      if (["state", "phase", "query"].some(key => input[key] !== undefined && typeof input[key] !== "string")) throw new Error("State, phase, and query must be strings");
      if (["statuses", "activities", "capacities", "powerSources"].some(key => input[key] !== undefined && (!Array.isArray(input[key]) || input[key].some(value => typeof value !== "string")))) throw new Error("Category filters must be arrays of strings");
      if (input.state !== undefined) els.stateFilter.value = input.state;
      if (input.query !== undefined) els.searchInput.value = input.query;
      if (input.timelineBasis !== undefined) { stopTimeline(); timelineMode = input.timelineBasis; els.timelineBasis.value = timelineMode; configureTimeline(true); }
      if (Number.isInteger(input.throughYear)) { const bounds = timelineBounds(); timelineYear = Math.max(bounds.min, Math.min(bounds.max, input.throughYear)); els.timelineRange.value = timelineYear; renderTimelineCoverage(); }
      if (input.phase !== undefined) setGroupSelection("status", input.phase ? [input.phase] : filterGroups.status.categories.map(([label]) => label));
      if (input.statuses !== undefined) setGroupSelection("status", input.statuses);
      if (input.activities !== undefined) setGroupSelection("activity", input.activities);
      if (input.capacities !== undefined) setGroupSelection("capacity", input.capacities);
      if (input.powerSources !== undefined) setGroupSelection("power", input.powerSources);
      applyFilters();
      return { facilities: filtered.length, filters: currentFilters() };
    } });
    register({ name: "select_facility", title: "Select facility", description: "Open the evidence panel for a facility by its facility ID.", inputSchema: { type: "object", properties: { facilityId: { type: "string" } }, required: ["facilityId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "facilityId") || typeof input.facilityId !== "string" || !input.facilityId) throw new Error("A valid facilityId is required");
      const found = facilities.find(f => f.id === input.facilityId);
      if (!found) throw new Error("Facility not found");
      selectFacility(found.id);
      return { facilityId: found.id, name: found.name };
    } });
    register({ name: "filter_power_plants", title: "Filter power plants", description: "Open the Generation view, filter eGRID plants by state or primary generation source, and optionally show 200+ kV transmission lines.", inputSchema: { type: "object", properties: { state: { type: "string" }, generationSource: { type: "string" }, transmissionLines: { type: "boolean" } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["state", "generationSource", "transmissionLines"].includes(key))) throw new Error("Input must contain only state, generationSource, or transmissionLines");
      if (["state", "generationSource"].some(key => input[key] !== undefined && typeof input[key] !== "string")) throw new Error("State and generationSource must be strings");
      if (input.transmissionLines !== undefined && typeof input.transmissionLines !== "boolean") throw new Error("transmissionLines must be a boolean");
      await setView("generation");
      if (input.state !== undefined) els.stateFilter.value = input.state;
      if (input.generationSource !== undefined) els.generationSource.value = input.generationSource;
      if (input.transmissionLines !== undefined) {
        els.transmissionToggle.checked = input.transmissionLines;
        if (input.transmissionLines) await loadTransmissionLines();
      }
      applyFilters();
      renderTransmissionLines();
      renderLegend();
      renderSummary();
      return { powerPlants: visiblePowerPlants().length, state: els.stateFilter.value, generationSource: els.generationSource.value || "All sources", transmissionLines: els.transmissionToggle.checked };
    } });
    register({ name: "select_power_plant", title: "Select power plant", description: "Open eGRID generation details for a power plant by its ORIS plant code.", inputSchema: { type: "object", properties: { plantId: { type: "string" } }, required: ["plantId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "plantId") || typeof input.plantId !== "string" || !input.plantId) throw new Error("A valid plantId is required");
      await setView("generation");
      const plant = plantById.get(input.plantId);
      if (!plant) throw new Error("Power plant not found");
      selectPowerPlant(plant.id);
      return { plantId: plant.id, name: plant.name, generationSource: plant.fuel };
    } });
    register({ name: "show_electricity_costs", title: "Show electricity costs", description: "Open the state industrial electricity-price view and optionally focus on one state.", inputSchema: { type: "object", properties: { state: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "state") || (input.state !== undefined && typeof input.state !== "string")) throw new Error("Input may contain only a state string");
      await setView("cost");
      if (input.state !== undefined) {
        els.stateFilter.value = input.state;
        applyFilters();
        if (input.state && stateByAbbr.has(input.state)) selectState(input.state);
      }
      const state = input.state ? stateByAbbr.get(input.state) : null;
      return { year: meta.electricityPriceYear, statesWithData: meta.electricityPriceStates, state: input.state || "All states", industrialCentsPerKwh: state?.electricityPrice?.industrial ?? null };
    } });
    register({ name: "read_dashboard_summary", title: "Read dashboard summary", description: "Return counts for the current filtered selection.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute() { return { selectedFacilities: filtered.length, totalFacilities: facilities.length, displayedPowerPlants: currentView === "generation" ? visiblePowerPlants().length : undefined, generationSource: currentView === "generation" ? els.generationSource.value || "All sources" : undefined, transmissionLines: currentView === "generation" ? els.transmissionToggle.checked : undefined, mapView: currentView, filters: currentFilters(), snapshot: meta.snapshot }; } });
  }

  renderStates(); renderLegend(); applyFilters(); registerWebMcp();
})();
