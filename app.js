(() => {
  const { facilities, states, meta } = window.DASHBOARD_DATA;
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const pct = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
  const value = (v, suffix = "") => v === null || v === undefined || v === "" ? "Unknown" : `${typeof v === "number" ? fmt.format(v) : v}${suffix}`;

  const config = {
    status: {
      title: "Operating status",
      insight: ["Project status is the outcome anchor", "Use proposed, development, operating, suspended, and cancelled records to define comparison groups. Preserve the snapshot date before modeling transitions."],
      categories: [
        ["Operating", "#2dd4bf"], ["Development", "#60a5fa"], ["Expanding", "#a78bfa"],
        ["Proposed", "#f5b942"], ["Pre-proposal", "#eab676"], ["Suspended", "#fb7185"], ["Cancelled", "#e11d48"], ["Unknown", "#718096"]
      ],
      key: f => f.phase || "Unknown"
    },
    capacity: {
      title: "Reported MW capacity",
      insight: ["Capacity coverage is incomplete", "Point size and color use reported MW or the midpoint of a reported range. Unknown values remain visible and are never converted to zero."],
      categories: [["Mega campus (1,000+ MW)", "#7c3aed"], ["Hyperscale (100-999 MW)", "#2563eb"], ["Large (51-99 MW)", "#0891b2"], ["Medium (11-50 MW)", "#14b8a6"], ["Small (0-10 MW)", "#84cc16"], ["Unknown", "#64748b"]],
      key: f => f.capacity || "Unknown"
    },
    power: {
      title: "Reported power source",
      insight: ["Reported sourcing is sparse", "Power categories describe source text and announced arrangements. They do not identify the hourly delivered mix or prove a physical grid connection."],
      categories: [["Grid", "#60a5fa"], ["Natural gas", "#f59e0b"], ["Renewable", "#22c55e"], ["Nuclear", "#a78bfa"], ["Mixed", "#f97316"], ["Other fossil", "#ef4444"], ["Storage or fuel cell", "#06b6d4"], ["Other", "#94a3b8"], ["Unknown", "#475569"]],
      key: f => f.power || "Unknown"
    },
    water: {
      title: "County water-scarcity screening",
      insight: ["Water context belongs at several scales", "The AWARE factor, historical withdrawals, hazard ratings, and cooling technology remain separate. County measures do not establish water rights or site-level availability."],
      categories: [["Under 0.5", "#2dd4bf"], ["0.5–0.99", "#84cc16"], ["1–4.99", "#f5b942"], ["5 or more", "#fb7185"], ["Unknown", "#64748b"]],
      key: f => f.waterClass || "Unknown"
    },
    policy: {
      title: "State policy context",
      insight: ["Policy concepts stay separate", "Incentive availability does not prove receipt. Moratorium-tracker entries are not necessarily enacted restrictions, and bill counts measure attention rather than stringency."],
      categories: [["Dedicated incentive", "#2dd4bf"], ["Moratorium tracker entry", "#fb7185"], ["Other state context", "#60a5fa"]],
      key: f => f.incentive ? "Dedicated incentive" : f.moratoriumCount > 0 ? "Moratorium tracker entry" : "Other state context"
    },
    opposition: {
      title: "Opposition evidence hierarchy",
      insight: ["Evidence strength varies", "Direct facility records are project-level evidence. County and state tracker matches describe the surrounding environment, while absence from a tracker remains unknown."],
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
    "searchInput", "stateFilter", "waterFilter", "incentiveFilter", "oppositionFilter", "moratoriumFilter",
    "statusChecks", "activityChecks", "capacityChecks", "powerChecks", "statusSelection", "activitySelection", "capacitySelection", "powerSelection",
    "resetFilters", "selectionCount", "exportButton", "metricFacilities", "metricShare", "metricMw", "metricOperating", "metricOpposition",
    "stateLayer", "facilityLayer", "map", "mapShell", "tooltip", "legend", "viewTitle", "statusChart", "chartTotal", "insightTitle", "insightText",
    "coverageLine", "detailPanel", "zoomIn", "zoomOut", "zoomReset"
  ].map(id => [id, document.getElementById(id)]));

  let currentView = "status";
  let filtered = facilities;
  let selectedId = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let dragging = false;
  let dragStart = null;

  const unique = (key) => [...new Set(facilities.map(f => f[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  const populate = (select, values) => values.forEach(v => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
  populate(els.stateFilter, unique("state"));
  populate(els.waterFilter, unique("waterClass"));

  function escapeHtml(input) {
    return String(input ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

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
    if (currentView !== "policy") return "";
    if (s.moratoriumCount > 0) return "#3a2631";
    if (s.incentive) return "#123a3a";
    return "#152a3d";
  }

  function renderStates() {
    els.stateLayer.innerHTML = states.map(s => `<path class="state" data-state="${s.abbr}" d="${s.path}" style="fill:${stateFill(s)}"><title>${escapeHtml(s.name)}</title></path>`).join("");
  }

  function colorFor(f) {
    const cfg = config[currentView];
    const key = cfg.key(f);
    return cfg.categories.find(c => c[0] === key)?.[1] || "#64748b";
  }

  function radiusFor(f) {
    if (!f.mw) return 2.7;
    return Math.max(3, Math.min(8.5, 2.6 + Math.log10(f.mw + 1) * 1.8));
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

  function showTooltip(event, f) {
    els.tooltip.innerHTML = `<strong>${escapeHtml(f.name)}</strong><span>${escapeHtml([f.city, f.state].filter(Boolean).join(", "))} · ${escapeHtml(f.phase || "Unknown status")} · ${escapeHtml(value(f.mw, " MW"))}</span>`;
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
      query: els.searchInput.value.trim().toLowerCase(), state: els.stateFilter.value, water: els.waterFilter.value,
      incentive: els.incentiveFilter.checked, opposition: els.oppositionFilter.checked, moratorium: els.moratoriumFilter.checked,
      statuses: selectedValues("status"), activities: selectedValues("activity"), capacities: selectedValues("capacity"),
      powerSources: selectedValues("power")
    };
  }

  function matchesFilters(f, q, omitGroup = null) {
    const haystack = [f.name, f.operator, f.city, f.county, f.state].filter(Boolean).join(" ").toLowerCase();
    if (q.query && !haystack.includes(q.query)) return false;
    if (q.state && f.state !== q.state) return false;
    if (q.water && f.waterClass !== q.water) return false;
    if (q.incentive && f.incentive !== 1) return false;
    if (q.opposition && f.directOpposition !== 1) return false;
    if (q.moratorium && !(f.moratoriumCount > 0)) return false;
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
    renderFacilities();
    renderSummary();
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
    els.chartTotal.textContent = `${fmt.format(count)} records`;
    renderStatusChart();
    const knownMw = count ? pct(mwValues.length / count * 100) : "—";
    const utilityMatches = filtered.filter(f => f.utilityMatch && f.utilityMatch.includes("Unique")).length;
    els.coverageLine.textContent = `Reported capacity coverage: ${knownMw}. Unique candidate-utility match: ${count ? pct(utilityMatches / count * 100) : "—"}.`;
  }

  function renderStatusChart() {
    const counts = {};
    filtered.forEach(f => counts[f.phase || "Unknown"] = (counts[f.phase || "Unknown"] || 0) + 1);
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(...rows.map(r => r[1]), 1);
    els.statusChart.innerHTML = rows.length ? rows.map(([label, count]) => `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${count/max*100}%"></div></div><strong>${fmt.format(count)}</strong></div>`).join("") : `<p class="detail-location">No facilities match these filters.</p>`;
  }

  function renderLegend() {
    const cfg = config[currentView];
    els.viewTitle.textContent = cfg.title;
    els.insightTitle.textContent = cfg.insight[0];
    els.insightText.textContent = cfg.insight[1];
    els.legend.innerHTML = cfg.categories.map(([label, color]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span></div>`).join("");
  }

  function detailItem(label, val) { return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value(val))}</strong></div>`; }
  function detailSection(title, items) { return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.join("")}</div></section>`; }

  function selectFacility(id) {
    selectedId = id;
    const f = facilities.find(item => item.id === id);
    if (!f) return;
    els.detailPanel.innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="eyebrow">${escapeHtml(f.id)}</span><h2>${escapeHtml(f.name)}</h2><p class="detail-location">${escapeHtml([f.city, f.county, f.state].filter(Boolean).join(" · "))}</p></div><button class="close-detail" type="button" aria-label="Close facility details">×</button></div>
      <span class="phase-pill">${escapeHtml(f.phase || "Unknown status")}</span>
      ${detailSection("Facility", [detailItem("Operator", f.operator), detailItem("Purpose", f.purpose), detailItem("Capacity", f.mw == null ? "Unknown" : `${fmt.format(f.mw)} MW`), detailItem("Capacity class", f.capacity), detailItem("Power source", f.power), detailItem("Reported acreage", f.acres == null ? f.acreageClass : `${fmt.format(f.acres)} acres`)])}
      ${detailSection("Power and grid", [detailItem("Candidate utility", f.utility), detailItem("Utility match", f.utilityMatch), detailItem("eGRID subregion", f.subregion), detailItem("200+ kV line", f.txKm == null ? "Unknown" : `${fmt.format(f.txKm)} km`), detailItem("Nearest substation", f.substationKm == null ? "Unknown" : `${fmt.format(f.substationKm)} km`), detailItem("Active queue MW", f.queueActiveMw == null ? "Unknown" : `${fmt.format(f.queueActiveMw)} MW`)])}
      ${detailSection("Resources", [detailItem("Water scarcity", f.waterClass), detailItem("AWARE factor", f.waterFactor), detailItem("Overall hazard", f.risk), detailItem("Drought", f.drought), detailItem("Flood", f.flood), detailItem("Heat", f.heat)])}
      ${detailSection("Policy and opposition", [detailItem("Dedicated incentive", f.incentive ? "Yes" : "No"), detailItem("Tracked state bills", f.billCount), detailItem("Moratorium entries", f.moratoriumCount), detailItem("Opposition evidence", f.oppositionClass), detailItem("County events", f.countyEvents), detailItem("Local actions", f.localActions)])}
      ${detailSection("Evidence", [detailItem("Location confidence", f.locationConfidence), detailItem("Inventory source", f.source)])}
    </div>`;
    els.detailPanel.classList.add("open");
    els.detailPanel.querySelector(".close-detail")?.addEventListener("click", clearSelection);
    renderFacilities();
  }

  function clearSelection() {
    selectedId = null;
    els.detailPanel.classList.remove("open");
    els.detailPanel.innerHTML = `<div class="detail-empty"><span class="detail-marker"></span><h2>Select a facility</h2><p>Choose a point on the map to review evidence from every layer.</p></div>`;
    renderFacilities();
  }

  function setView(view) {
    if (!config[view]) return;
    currentView = view;
    document.querySelectorAll(".view-button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    renderStates(); renderLegend(); renderFacilities();
  }

  function updateTransform() {
    document.getElementById("mapViewport").setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.scale})`);
  }
  function zoom(factor, cx = 500, cy = 300) {
    const old = transform.scale;
    const next = Math.max(1, Math.min(6, old * factor));
    transform.x = cx - (cx - transform.x) * next / old;
    transform.y = cy - (cy - transform.y) * next / old;
    transform.scale = next; updateTransform();
  }
  function resetView() { transform = { x: 0, y: 0, scale: 1 }; updateTransform(); }

  function exportCsv() {
    const headers = ["facility_id", "facility_name", "city", "state", "county", "project_phase", "mw_mid", "capacity_class", "power_source", "water_scarcity", "state_incentive", "moratorium_tracker_count", "opposition_evidence", "latitude", "longitude"];
    const rows = filtered.map(f => [f.id, f.name, f.city, f.state, f.county, f.phase, f.mw, f.capacity, f.power, f.waterClass, f.incentive, f.moratoriumCount, f.oppositionClass, f.lat, f.lon]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "us_data_centers_filtered.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  [els.searchInput, els.stateFilter, els.waterFilter, els.incentiveFilter, els.oppositionFilter, els.moratoriumFilter].forEach(el => el.addEventListener(el.tagName === "INPUT" && el.type === "search" ? "input" : "change", applyFilters));
  document.querySelectorAll("[data-filter-action]").forEach(button => button.addEventListener("click", () => {
    const group = filterGroups[button.dataset.filterGroup];
    group.container.querySelectorAll("input").forEach(input => { input.checked = button.dataset.filterAction === "all"; });
    applyFilters();
  }));
  els.resetFilters.addEventListener("click", () => {
    [els.searchInput, els.stateFilter, els.waterFilter].forEach(el => el.value = "");
    [els.incentiveFilter, els.oppositionFilter, els.moratoriumFilter].forEach(el => el.checked = false);
    Object.keys(filterGroups).forEach(name => setGroupSelection(name, filterGroups[name].categories.map(([label]) => label)));
    applyFilters();
  });
  els.exportButton.addEventListener("click", exportCsv);
  document.querySelectorAll(".view-button").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  els.zoomIn.addEventListener("click", () => zoom(1.35)); els.zoomOut.addEventListener("click", () => zoom(1/1.35)); els.zoomReset.addEventListener("click", resetView);
  els.map.addEventListener("wheel", event => { event.preventDefault(); const rect = els.map.getBoundingClientRect(); zoom(event.deltaY < 0 ? 1.18 : 1/1.18, (event.clientX-rect.left)/rect.width*1000, (event.clientY-rect.top)/rect.height*600); }, { passive: false });
  els.map.addEventListener("pointerdown", event => { if (event.target.classList.contains("facility")) return; dragging = true; dragStart = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y }; els.map.classList.add("dragging"); els.map.setPointerCapture(event.pointerId); });
  els.map.addEventListener("pointermove", event => { if (!dragging) return; const rect = els.map.getBoundingClientRect(); transform.x = dragStart.tx + (event.clientX-dragStart.x)/rect.width*1000; transform.y = dragStart.ty + (event.clientY-dragStart.y)/rect.height*600; updateTransform(); });
  els.map.addEventListener("pointerup", () => { dragging = false; els.map.classList.remove("dragging"); });
  els.map.addEventListener("click", event => { if (event.target === els.map || event.target.classList.contains("state")) clearSelection(); });

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const register = tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {} };
    register({ name: "filter_facilities", title: "Filter facilities", description: "Apply visible dashboard filters for state, project status, activity group, capacity class, power source, or search text.", inputSchema: { type: "object", properties: { state: { type: "string" }, phase: { type: "string" }, query: { type: "string" }, statuses: { type: "array", items: { type: "string" } }, activities: { type: "array", items: { type: "string" } }, capacities: { type: "array", items: { type: "string" } }, powerSources: { type: "array", items: { type: "string" } } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Input must be an object");
      const allowed = new Set(["state", "phase", "query", "statuses", "activities", "capacities", "powerSources"]);
      if (Object.keys(input).some(key => !allowed.has(key))) throw new Error("Unsupported filter field");
      if (["state", "phase", "query"].some(key => input[key] !== undefined && typeof input[key] !== "string")) throw new Error("State, phase, and query must be strings");
      if (["statuses", "activities", "capacities", "powerSources"].some(key => input[key] !== undefined && (!Array.isArray(input[key]) || input[key].some(value => typeof value !== "string")))) throw new Error("Category filters must be arrays of strings");
      if (input.state !== undefined) els.stateFilter.value = input.state;
      if (input.query !== undefined) els.searchInput.value = input.query;
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
    register({ name: "read_dashboard_summary", title: "Read dashboard summary", description: "Return counts for the current filtered selection.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute() { return { selectedFacilities: filtered.length, totalFacilities: facilities.length, mapView: currentView, filters: currentFilters(), snapshot: meta.snapshot }; } });
  }

  renderStates(); renderLegend(); applyFilters(); registerWebMcp();
})();
