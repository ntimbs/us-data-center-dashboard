(() => {
  "use strict";
  const { cells, variables, meta, facilityHex = [] } = window.HEX_DASHBOARD_DATA;
  const base = window.DASHBOARD_DATA;
  cells.forEach(c => { c.neighbors = Array.isArray(c.neighbors) ? c.neighbors : (typeof c.neighbors === "string" && c.neighbors ? [c.neighbors] : []); });
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const priceFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const byId = new Map(cells.map(c => [c.id, c]));
  const varByKey = new Map(variables.map(v => [v.key, v]));
  const palette = ["#102333", "#15505b", "#188d8a", "#2dd4bf", "#a7f3d0"];
  const bivar = { LL:"#304b5c", LH:"#6f62a6", HL:"#cf8f42", HH:"#16a393", missing:"#172938" };
  const outcomeKeys = new Set(["facilityCount", "reportedMw", "operatingCount", "pipelineCount"]);
  const fixedFacilityCountKeys = new Set(["facilityCount", "operatingCount", "pipelineCount", "directOppositionCount"]);
  const facilityHexById = new Map(facilityHex.map(row => [row.id, row.hexId]));
  const allFacilities = base.facilities.map(f => ({ ...f, hexId:facilityHexById.get(f.id) })).filter(f => f.hexId && byId.has(f.hexId));
  const filterGroupDefs = {
    status: { key:f=>f.phase||"Unknown", categories:[["Operating","#2dd4bf"],["Development","#60a5fa"],["Expanding","#a78bfa"],["Proposed","#f5b942"],["Pre-proposal","#eab676"],["Suspended","#fb7185"],["Cancelled","#e11d48"],["Unknown","#718096"]] },
    activity: { key:f=>f.activity||"Unknown", categories:[["Existing","#2dd4bf"],["Existing / expansion","#a78bfa"],["Active pipeline","#60a5fa"],["Paused / cancelled","#fb7185"],["Unknown","#718096"]] },
    capacity: { key:f=>f.capacity||"Unknown", categories:[["Mega campus (1,000+ MW)","#7c3aed"],["Hyperscale (100-999 MW)","#2563eb"],["Large (51-99 MW)","#0891b2"],["Medium (11-50 MW)","#14b8a6"],["Small (0-10 MW)","#84cc16"],["Unknown","#64748b"]] },
    power: { key:f=>f.power||"Unknown", categories:[["Grid","#60a5fa"],["Natural gas","#f59e0b"],["Renewable","#22c55e"],["Nuclear","#a78bfa"],["Mixed","#f97316"],["Other fossil","#ef4444"],["Storage or fuel cell","#06b6d4"],["Other","#94a3b8"],["Unknown","#475569"]] }
  };
  const els = Object.fromEntries([
    "outcomeSelect","compareSelect","stateFilter","landFilter","pointToggle","sampleCount","coverageText","exportButton",
    "metricHexes","metricOccupied","metricMoran","metricSpatial","mapTitle","mapShell","map","mapViewport","stateLayer",
    "hexLayer","facilityLayer","outlineLayer","tooltip","legend","zoomOut","zoomReset","zoomIn","summaryTitle","plainSummary",
    "interpretTitle","interpretText","cellArea","pairCount","detailPanel","resetButton","outcomeHelp","compareHelp",
    "guideButton","guideModal","guideClose","guideNav","guideContent","statusChecks","activityChecks","capacityChecks","powerChecks",
    "statusSelection","activitySelection","capacitySelection","powerSelection"
  ].map(id => [id, document.getElementById(id)]));
  let outcome = "facilityCount";
  let comparison = "hvLineKm";
  let display = "outcome";
  let filtered = cells;
  let selectedFacilities = allFacilities;
  let selectedId = null;
  let transform = { x:0, y:0, scale:1 };
  let dragging = false;
  let dragStart = null;
  let stats = {};

  function escapeHtml(input) { return String(input ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
  function number(value, unit="") { return Number.isFinite(value) ? `${unit==="¢/kWh"?priceFmt.format(value):fmt.format(value)}${unit ? ` ${unit}` : ""}` : "Unknown"; }
  function optionGroups(items, select) {
    const groups = {};
    items.forEach(v => (groups[v.group] ||= []).push(v));
    select.innerHTML = Object.entries(groups).map(([group, vs]) => `<optgroup label="${escapeHtml(group)}">${vs.map(v => `<option value="${v.key}">${escapeHtml(v.label)}</option>`).join("")}</optgroup>`).join("");
  }
  optionGroups(variables.filter(v => outcomeKeys.has(v.key)), els.outcomeSelect);
  optionGroups(variables.filter(v => !outcomeKeys.has(v.key)), els.compareSelect);
  els.outcomeSelect.value = outcome;
  els.compareSelect.value = comparison;
  [...new Set(cells.map(c => c.state).filter(Boolean))].sort().forEach(s => els.stateFilter.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));
  els.cellArea.textContent = `${fmt.format(meta.cellAreaSqKm)} km²`;

  const filterGroups = {};
  function initializeFilterGroups() {
    Object.entries(filterGroupDefs).forEach(([name, def]) => {
      const present = new Set(allFacilities.map(def.key));
      const categories = def.categories.filter(([label]) => present.has(label));
      [...present].filter(label => !categories.some(([known]) => known === label)).sort().forEach(label => categories.push([label,"#64748b"]));
      const container = els[`${name}Checks`];
      container.innerHTML = categories.map(([label,color], index) => {
        const id=`hex${name}Choice${index}`;
        return `<label class="choice-checkbox" for="${id}"><input id="${id}" type="checkbox" value="${escapeHtml(label)}" checked><span class="choice-dot" style="--choice-color:${color}"></span><span class="choice-label">${escapeHtml(label)}</span><span class="choice-count" data-choice-count="${escapeHtml(label)}">0</span></label>`;
      }).join("");
      filterGroups[name]={...def,categories,container,summary:els[`${name}Selection`]};
      container.querySelectorAll("input").forEach(input=>input.addEventListener("change",()=>update({reaggregate:true})));
    });
  }
  function selectedValues(name) { return [...filterGroups[name].container.querySelectorAll("input:checked")].map(input=>input.value); }
  function setGroupSelection(name, values) {
    const wanted=new Set(values);
    filterGroups[name].container.querySelectorAll("input").forEach(input=>{input.checked=wanted.has(input.value);});
  }
  function currentFacilityFilters() {
    return { statuses:selectedValues("status"), activities:selectedValues("activity"), capacities:selectedValues("capacity"), powerSources:selectedValues("power") };
  }
  function matchesFacilityFilters(f,q,omitGroup=null) {
    if (omitGroup!=="status"&&!q.statuses.includes(filterGroupDefs.status.key(f))) return false;
    if (omitGroup!=="activity"&&!q.activities.includes(filterGroupDefs.activity.key(f))) return false;
    if (omitGroup!=="capacity"&&!q.capacities.includes(filterGroupDefs.capacity.key(f))) return false;
    if (omitGroup!=="power"&&!q.powerSources.includes(filterGroupDefs.power.key(f))) return false;
    return true;
  }
  function reaggregateFacilities() {
    const q=currentFacilityFilters();
    selectedFacilities=allFacilities.filter(f=>matchesFacilityFilters(f,q));
    cells.forEach(c=>{c.facilityCount=0;c.reportedMw=0;c.knownMwCount=0;c.operatingCount=0;c.pipelineCount=0;c.directOppositionCount=0;});
    selectedFacilities.forEach(f=>{
      const c=byId.get(f.hexId); if(!c)return;
      c.facilityCount+=1;
      if(Number.isFinite(f.mw)){c.reportedMw+=f.mw;c.knownMwCount+=1;}
      if(f.phase==="Operating")c.operatingCount+=1;
      if(f.activity==="Active pipeline")c.pipelineCount+=1;
      if(f.directOpposition===1)c.directOppositionCount+=1;
    });
  }
  function updateCheckboxCounts() {
    const q=currentFacilityFilters(), visibleIds=new Set(filtered.map(c=>c.id));
    Object.entries(filterGroups).forEach(([name,group])=>{
      const counts=new Map(group.categories.map(([label])=>[label,0]));
      allFacilities.filter(f=>visibleIds.has(f.hexId)&&matchesFacilityFilters(f,q,name)).forEach(f=>{
        const label=group.key(f);counts.set(label,(counts.get(label)||0)+1);
      });
      group.container.querySelectorAll("[data-choice-count]").forEach(span=>{span.textContent=fmt.format(counts.get(span.dataset.choiceCount)||0);});
      group.summary.textContent=`${selectedValues(name).length} of ${group.categories.length}`;
    });
  }
  initializeFilterGroups();

  function groupId(group) { return `guide-${group.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`; }
  function renderGuide() {
    const groups = {};
    variables.forEach(v => (groups[v.group] ||= []).push(v));
    els.guideNav.innerHTML = Object.keys(groups).map(group => `<a href="#${groupId(group)}">${escapeHtml(group)}</a>`).join("");
    els.guideContent.innerHTML = Object.entries(groups).map(([group, items]) => `
      <section id="${groupId(group)}" class="guide-group">
        <div class="guide-group-heading"><h2>${escapeHtml(group)}</h2><span>${items.length} ${items.length===1?"measure":"measures"}</span></div>
        <div class="measure-grid">${items.map(v => `
          <article class="measure-card">
            <header><h3>${escapeHtml(v.label)}</h3><span class="unit-pill">${escapeHtml(v.unit)}</span></header>
            <p class="measure-definition">${escapeHtml(v.definition)}</p>
            <dl class="measure-meta">
              <div><dt>Underlying data</dt><dd>${escapeHtml(v.source)}</dd></div>
              <div><dt>Cell calculation</dt><dd>${escapeHtml(v.calculation)}</dd></div>
              <div><dt>Missing values and zeros</dt><dd>${escapeHtml(v.missing)}</dd></div>
              <div class="caution"><dt>Interpretation limit</dt><dd>${escapeHtml(v.caution)}</dd></div>
            </dl>
          </article>`).join("")}</div>
      </section>`).join("");
  }
  function renderVariableHelp() {
    const ov = varByKey.get(outcome), cv = varByKey.get(comparison);
    els.outcomeHelp.textContent = `${ov.definition} Unit: ${ov.unit}.`;
    els.compareHelp.textContent = `${cv.definition} Unit: ${cv.unit}.`;
  }
  function openGuide() {
    els.guideModal.hidden=false;
    els.guideModal.classList.add("open");
    document.body.classList.add("guide-open");
    els.guideClose.focus();
  }
  function closeGuide() {
    els.guideModal.classList.remove("open");
    els.guideModal.hidden=true;
    document.body.classList.remove("guide-open");
    els.guideButton.focus();
  }
  renderGuide();

  function currentCells() {
    const state = els.stateFilter.value;
    const minLand = Number(els.landFilter.value);
    return cells.filter(c => (!state || c.state === state) && c.landFraction >= minLand);
  }
  function mean(xs) { return xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : NaN; }
  function pearson(xs, ys) {
    if (xs.length < 3 || xs.length !== ys.length) return NaN;
    const mx = mean(xs), my = mean(ys);
    let num=0, dx=0, dy=0;
    for (let i=0;i<xs.length;i++){ const a=xs[i]-mx,b=ys[i]-my; num+=a*b; dx+=a*a; dy+=b*b; }
    return dx && dy ? num/Math.sqrt(dx*dy) : NaN;
  }
  function computeStats() {
    const valid = filtered.filter(c => Number.isFinite(c[outcome]) && Number.isFinite(c[comparison]));
    const active = new Set(valid.map(c => c.id));
    const xs = valid.map(c => c[comparison]);
    const ys = valid.map(c => c[outcome]);
    const my = mean(ys);
    const denom = ys.reduce((sum,y) => sum + (y-my)**2, 0);
    let moranNum = 0;
    const lagX = [], lagY = [], outcomeForLag = [];
    valid.forEach(c => {
      const ns = c.neighbors.map(id => byId.get(id)).filter(n => n && active.has(n.id));
      if (!ns.length) return;
      moranNum += (c[outcome]-my) * mean(ns.map(n => n[outcome]-my));
      lagX.push(mean(ns.map(n => n[comparison])));
      outcomeForLag.push(c[outcome]);
    });
    const moran = denom ? moranNum/denom : NaN;
    return { valid, pearson:pearson(xs,ys), moran, spatial:pearson(outcomeForLag,lagX), pairs:valid.length };
  }
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const i=(sorted.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
    return sorted[lo] + (sorted[hi]-sorted[lo])*(i-lo);
  }
  function breaksFor(key) {
    if (fixedFacilityCountKeys.has(key)) return [0,1,4,14,Infinity];
    const values = filtered.map(c => c[key]).filter(Number.isFinite).sort((a,b)=>a-b);
    const positives = values.filter(v => v > 0);
    if (values.length && positives.length && values.filter(v => v === 0).length / values.length > .15) {
      return [...new Set([0, .25, .5, .75, 1].map((p, i) => i === 0 ? 0 : quantile(positives, p)))].sort((a,b)=>a-b);
    }
    return [...new Set([.2,.4,.6,.8,1].map(p => quantile(values,p)))].sort((a,b)=>a-b);
  }
  function rampFor(length) { return Array.from({length}, (_,i) => palette[Math.round(i*(palette.length-1)/Math.max(1,length-1))]); }
  function binColor(value, breaks) {
    if (!Number.isFinite(value)) return "#172938";
    const i = breaks.findIndex(limit => value <= limit);
    const ramp = rampFor(breaks.length);
    return ramp[i < 0 ? ramp.length - 1 : i];
  }
  function renderStates() {
    els.stateLayer.innerHTML = base.states.map(s => `<path class="state" d="${s.path}"><title>${escapeHtml(s.name)}</title></path>`).join("");
    els.outlineLayer.innerHTML = base.states.map(s => `<path class="state-outline" d="${s.path}"></path>`).join("");
  }
  function renderMap() {
    const selectedSet = new Set(filtered.map(c => c.id));
    const key = display === "comparison" ? comparison : outcome;
    const breaks = breaksFor(key);
    const outVals = filtered.map(c=>c[outcome]).filter(Number.isFinite), compVals=filtered.map(c=>c[comparison]).filter(Number.isFinite);
    const outMean=mean(outVals), compMean=mean(compVals);
    els.hexLayer.innerHTML = cells.map(c => {
      const visible = selectedSet.has(c.id);
      let fill = "#0a1925";
      if (visible && display === "bivariate") {
        if (Number.isFinite(c[outcome]) && Number.isFinite(c[comparison])) fill=bivar[`${c[outcome]>=outMean?"H":"L"}${c[comparison]>=compMean?"H":"L"}`]; else fill=bivar.missing;
      } else if (visible) fill=binColor(c[key],breaks);
      return `<path class="hex-cell${c.id===selectedId?" selected":""}" data-id="${c.id}" d="${c.path}" fill="${fill}" opacity="${visible?.9:.08}"></path>`;
    }).join("");
    els.hexLayer.querySelectorAll(".hex-cell").forEach(path => {
      path.addEventListener("pointerenter", e => showTooltip(e, byId.get(path.dataset.id)));
      path.addEventListener("pointermove", positionTooltip);
      path.addEventListener("pointerleave", () => els.tooltip.hidden=true);
      path.addEventListener("click", e => { e.stopPropagation(); selectCell(path.dataset.id); });
    });
    els.facilityLayer.innerHTML = els.pointToggle.checked ? selectedFacilities.filter(f=>selectedSet.has(f.hexId)).map(f => `<circle class="facility-point" cx="${f.x}" cy="${f.y}" r="1.6"><title>${escapeHtml(f.name)}</title></circle>`).join("") : "";
    renderLegend(key, breaks);
  }
  function renderLegend(key, breaks) {
    if (display === "bivariate") {
      els.legend.innerHTML = `<div class="legend-title">Outcome / comparison</div>${[["HH","High / high"],["HL","High / low"],["LH","Low / high"],["LL","Low / low"]].map(([k,l])=>`<div class="legend-item"><span class="legend-swatch" style="background:${bivar[k]}"></span>${l}</div>`).join("")}`;
      return;
    }
    const v=varByKey.get(key);
    const labels=fixedFacilityCountKeys.has(key)?["0 facilities","1 facility","2–4 facilities","5–14 facilities","15+ facilities"]:breaks.map(limit=>limit===0?`0 ${v.unit}`:`≤ ${number(limit,v.unit)}`);
    els.legend.innerHTML = `<div class="legend-title">${escapeHtml(v.label)}</div>${rampFor(breaks.length).map((color,i)=>`<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${escapeHtml(labels[i])}</div>`).join("")}<div class="legend-item"><span class="legend-swatch" style="background:#172938"></span>Missing</div>`;
  }
  function showTooltip(event,c) {
    if (!c) return;
    const ov=varByKey.get(outcome), cv=varByKey.get(comparison);
    els.tooltip.innerHTML=`<strong>${escapeHtml(c.id)}</strong><span>${escapeHtml(c.countyName||"County unavailable")}, ${escapeHtml(c.state||"")}</span><br>${escapeHtml(ov.label)}: ${escapeHtml(number(c[outcome],ov.unit))}<br>${escapeHtml(cv.label)}: ${escapeHtml(number(c[comparison],cv.unit))}`;
    els.tooltip.hidden=false; positionTooltip(event);
  }
  function positionTooltip(event) { const r=els.mapShell.getBoundingClientRect(); els.tooltip.style.left=`${Math.min(event.clientX-r.left+13,r.width-290)}px`; els.tooltip.style.top=`${Math.max(8,event.clientY-r.top-72)}px`; }
  function renderSummary() {
    stats=computeStats();
    const occupiedCells=filtered.filter(c=>c.facilityCount>0);
    const occupied=occupiedCells.length;
    const visibleIds=new Set(filtered.map(c=>c.id));
    const visibleFacilities=selectedFacilities.filter(f=>visibleIds.has(f.hexId)).length;
    els.sampleCount.textContent=`${fmt.format(filtered.length)} hexagons`;
    els.coverageText.textContent=`${fmt.format(visibleFacilities)} selected facilities · ${fmt.format(occupied)} occupied · ${fmt.format(stats.pairs)} areas with both measures`;
    els.metricHexes.textContent=fmt.format(filtered.length);
    els.metricOccupied.textContent=fmt.format(occupied);
    els.metricMoran.textContent=Number.isFinite(stats.moran)?stats.moran.toFixed(3):"—";
    els.metricSpatial.textContent=Number.isFinite(stats.spatial)?stats.spatial.toFixed(3):"—";
    els.pairCount.textContent=fmt.format(stats.pairs);
    const ov=varByKey.get(outcome),cv=varByKey.get(comparison);
    els.mapTitle.textContent=display==="outcome"?ov.label:display==="comparison"?cv.label:`${ov.label} × ${cv.label}`;
    els.summaryTitle.textContent=`What stands out across ${fmt.format(filtered.length)} areas`;
    els.interpretTitle.textContent=cv.label;
    els.interpretText.textContent=`${cv.definition} The summary compares simple averages across the current map selection. It is useful for spotting broad patterns, but it does not show that one factor caused another.`;
    renderPlainSummary(occupiedCells,visibleFacilities,cv);
    renderVariableHelp();
  }
  function renderPlainSummary(occupiedCells,visibleFacilities,cv) {
    const occupiedShare=filtered.length?occupiedCells.length/filtered.length*100:0;
    const withValues=occupiedCells.map(c=>c[comparison]).filter(Number.isFinite);
    const withoutValues=filtered.filter(c=>c.facilityCount===0).map(c=>c[comparison]).filter(Number.isFinite);
    const avgWith=mean(withValues),avgWithout=mean(withoutValues);
    const busiest=occupiedCells.reduce((best,c)=>!best||c.facilityCount>best.facilityCount?c:best,null);
    const comparisonValue=Number.isFinite(avgWith)&&Number.isFinite(avgWithout)?`${number(avgWith,cv.unit)} vs ${number(avgWithout,cv.unit)}`:"Not enough data";
    const comparisonDetail=Number.isFinite(avgWith)&&Number.isFinite(avgWithout)?`Average ${cv.label.toLowerCase()} in areas with selected facilities, compared with other visible areas.`:`The current selection does not have enough values to compare areas with and without facilities.`;
    const busiestLocation=busiest?[busiest.countyName,busiest.state].filter(Boolean).join(", "):"No occupied area in the current selection.";
    els.plainSummary.innerHTML=`
      <article class="summary-item"><span>Data-center footprint</span><strong>${fmt.format(occupiedCells.length)} of ${fmt.format(filtered.length)} areas</strong><p>${fmt.format(visibleFacilities)} selected facilities appear across ${fmt.format(occupiedShare)}% of the visible grid.</p></article>
      <article class="summary-item"><span>With facilities vs. without</span><strong>${escapeHtml(comparisonValue)}</strong><p>${escapeHtml(comparisonDetail)}</p></article>
      <article class="summary-item"><span>Busiest visible area</span><strong>${busiest?`${fmt.format(busiest.facilityCount)} ${busiest.facilityCount===1?"facility":"facilities"}`:"No facilities"}</strong><p>${escapeHtml(busiestLocation)}</p></article>`;
  }
  function item(label,val){return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(val)}</strong></div>`;}
  function section(title,items){return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.join("")}</div></section>`;}
  function selectCell(id) {
    selectedId=id; const c=byId.get(id); if(!c)return;
    const ov=varByKey.get(outcome),cv=varByKey.get(comparison);
    els.detailPanel.innerHTML=`<div class="detail-content"><span class="eyebrow">Analysis cell</span><h2>${escapeHtml(c.id)}</h2><p class="detail-location">${escapeHtml(c.countyName||"County unavailable")}, ${escapeHtml(c.stateName||c.state||"")}</p><span class="detail-badge">${number(c.landFraction*100,"% land")}</span>${section("Selected analysis",[item(ov.label,number(c[outcome],ov.unit)),item(cv.label,number(c[comparison],cv.unit)),item("Neighbor cells",fmt.format(c.neighbors.length)),item("Centroid",`${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`)])}${section("Data centers",[item("Facilities",number(c.facilityCount)),item("Reported MW",number(c.reportedMw,"MW")),item("Operating",number(c.operatingCount)),item("Active pipeline",number(c.pipelineCount)),item("Known MW records",`${c.knownMwCount} of ${c.facilityCount}`),item("Direct opposition",number(c.directOppositionCount))])}${section("Power",[item("Operating generation",number(c.plantOperatingMw,"MW")),item("Power plants",number(c.plantCount)),item("≥200 kV lines",number(c.hvLineKm,"km")),item("Active queue",number(c.queueActiveMw,"MW")),item("Industrial price",number(c.industrialPrice2024,"¢/kWh"))])}${section("Resources & policy",[item("Water scarcity",number(c.waterFactor)),item("Drought risk",number(c.droughtScore)),item("State bills",number(c.policyBills)),item("Dedicated incentive",c.incentive===1?"Yes":c.incentive===0?"No":"Unknown"),item("Moratorium records",number(c.moratoriums)),item("Local actions",number(c.localActionCount))])}</div>`;
    els.detailPanel.classList.add("open"); renderMap();
  }
  function update(options={}) {
    if(options.reaggregate)reaggregateFacilities();
    filtered=currentCells();
    updateCheckboxCounts();
    renderSummary();renderMap();
    if(selectedId)selectCell(selectedId);
  }
  function updateTransform(){els.mapViewport.setAttribute("transform",`translate(${transform.x} ${transform.y}) scale(${transform.scale})`);}
  function zoom(factor,cx=500,cy=300){const old=transform.scale,next=Math.max(1,Math.min(6,old*factor));transform.x=cx-(cx-transform.x)*(next/old);transform.y=cy-(cy-transform.y)*(next/old);transform.scale=next;updateTransform();}
  function resetView(){transform={x:0,y:0,scale:1};updateTransform();}
  function exportCsv(){
    const keys=["id","region","state","countyFips","countyName","xAea","yAea","lon","lat","landFraction","facilityCount","reportedMw","knownMwCount","operatingCount","pipelineCount","directOppositionCount","plantCount","plantOperatingMw","plantNameplateMw","hvLineKm","queueActiveMw","industrialPrice2024","industrialPriceReal2020","industrialPriceVariance","waterFactor","waterClass","waterWithdrawalMgd","riskScore","droughtScore","wildfireScore","floodScore","heatScore","cbpEstablishments","incentive","electricityTax","moratoriums","policyBills","policyPassed","localActionCount","neighbors"];
    const rows=[keys,...filtered.map(c=>keys.map(k=>Array.isArray(c[k])?c[k].join(";"):c[k]))];
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`us_hex_grid_${meta.cellWidthKm}km_filtered.csv`;a.click();URL.revokeObjectURL(a.href);
  }
  els.outcomeSelect.addEventListener("change",()=>{outcome=els.outcomeSelect.value;update();});
  els.compareSelect.addEventListener("change",()=>{comparison=els.compareSelect.value;update();});
  els.stateFilter.addEventListener("change",update); els.landFilter.addEventListener("change",update); els.pointToggle.addEventListener("change",renderMap);
  document.querySelectorAll("[data-filter-action]").forEach(button=>button.addEventListener("click",()=>{
    const group=filterGroups[button.dataset.filterGroup];
    setGroupSelection(button.dataset.filterGroup,button.dataset.filterAction==="all"?group.categories.map(([label])=>label):[]);
    update({reaggregate:true});
  }));
  document.querySelectorAll(".display-button").forEach(b=>b.addEventListener("click",()=>{display=b.dataset.display;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x===b));update();}));
  els.resetButton.addEventListener("click",()=>{outcome="facilityCount";comparison="hvLineKm";display="outcome";els.outcomeSelect.value=outcome;els.compareSelect.value=comparison;els.stateFilter.value="";els.landFilter.value="0";els.pointToggle.checked=false;Object.entries(filterGroups).forEach(([name,group])=>setGroupSelection(name,group.categories.map(([label])=>label)));document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x.dataset.display==="outcome"));selectedId=null;els.detailPanel.classList.remove("open");els.detailPanel.innerHTML='<div class="detail-empty"><span class="detail-hex"></span><h2>Select a hexagon</h2><p>Choose a cell to inspect its outcome, context measures, source geography, and neighbors.</p></div>';resetView();update({reaggregate:true});});
  els.exportButton.addEventListener("click",exportCsv); els.zoomIn.addEventListener("click",()=>zoom(1.35));els.zoomOut.addEventListener("click",()=>zoom(1/1.35));els.zoomReset.addEventListener("click",resetView);
  els.guideButton.addEventListener("click",openGuide); els.guideClose.addEventListener("click",closeGuide);
  els.guideModal.addEventListener("click",event=>{if(event.target===els.guideModal)closeGuide();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!els.guideModal.hidden)closeGuide();});
  els.map.addEventListener("wheel",e=>{e.preventDefault();const r=els.map.getBoundingClientRect();zoom(e.deltaY<0?1.18:1/1.18,(e.clientX-r.left)/r.width*1000,(e.clientY-r.top)/r.height*600);},{passive:false});
  els.map.addEventListener("pointerdown",e=>{if(e.target.classList.contains("hex-cell"))return;dragging=true;dragStart={x:e.clientX,y:e.clientY,tx:transform.x,ty:transform.y};els.map.classList.add("dragging");els.map.setPointerCapture(e.pointerId);});
  els.map.addEventListener("pointermove",e=>{if(!dragging)return;const r=els.map.getBoundingClientRect();transform.x=dragStart.tx+(e.clientX-dragStart.x)/r.width*1000;transform.y=dragStart.ty+(e.clientY-dragStart.y)/r.height*600;updateTransform();});
  els.map.addEventListener("pointerup",()=>{dragging=false;els.map.classList.remove("dragging");});

  function registerWebMcp(){
    const context=document.modelContext;if(!context?.registerTool)return;
    const register=t=>{try{Promise.resolve(context.registerTool(t)).catch(()=>{});}catch(_){}};
    register({name:"set_hex_analysis",title:"Set hex-grid analysis",description:"Choose variables, geography, display, and facility categories; the selected facilities are re-aggregated into the grid.",inputSchema:{type:"object",properties:{outcome:{type:"string",enum:[...outcomeKeys]},comparison:{type:"string",enum:variables.filter(v=>!outcomeKeys.has(v.key)).map(v=>v.key)},state:{type:"string"},display:{type:"string",enum:["outcome","comparison","bivariate"]},statuses:{type:"array",items:{type:"string",enum:filterGroups.status.categories.map(x=>x[0])}},activities:{type:"array",items:{type:"string",enum:filterGroups.activity.categories.map(x=>x[0])}},capacities:{type:"array",items:{type:"string",enum:filterGroups.capacity.categories.map(x=>x[0])}},powerSources:{type:"array",items:{type:"string",enum:filterGroups.power.categories.map(x=>x[0])}}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){const allowed=new Set(["outcome","comparison","state","display","statuses","activities","capacities","powerSources"]);if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!allowed.has(k)))throw new Error("Invalid analysis inputs.");if(input.outcome){outcome=input.outcome;els.outcomeSelect.value=outcome}if(input.comparison){comparison=input.comparison;els.compareSelect.value=comparison}if(input.state!==undefined){els.stateFilter.value=input.state}if(input.display){display=input.display;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x.dataset.display===display))}if(input.statuses)setGroupSelection("status",input.statuses);if(input.activities)setGroupSelection("activity",input.activities);if(input.capacities)setGroupSelection("capacity",input.capacities);if(input.powerSources)setGroupSelection("power",input.powerSources);const changed=["statuses","activities","capacities","powerSources"].some(k=>Object.prototype.hasOwnProperty.call(input,k));update({reaggregate:changed});return{hexagons:filtered.length,selectedFacilities:selectedFacilities.filter(f=>new Set(filtered.map(c=>c.id)).has(f.hexId)).length,outcome,comparison,display,pearson:stats.pearson,moransI:stats.moran,spatialLagR:stats.spatial};}});
    register({name:"select_hexagon",title:"Select hexagon",description:"Open details for one exact analysis-cell ID.",inputSchema:{type:"object",properties:{hexId:{type:"string"}},required:["hexId"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length!==1||typeof input.hexId!=="string"||!byId.has(input.hexId))throw new Error("Unknown hexagon ID.");selectCell(input.hexId);return{selected:input.hexId};}});
    register({name:"read_spatial_summary",title:"Read spatial summary",description:"Return the current grid selection, facility filters, and descriptive spatial statistics.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error("This tool takes no inputs.");const visibleIds=new Set(filtered.map(c=>c.id));return{hexagons:filtered.length,occupied:filtered.filter(c=>c.facilityCount>0).length,selectedFacilities:selectedFacilities.filter(f=>visibleIds.has(f.hexId)).length,facilityFilters:currentFacilityFilters(),outcome,comparison,pearson:stats.pearson,moransI:stats.moran,spatialLagR:stats.spatial,snapshot:meta.snapshot};}});
  }
  renderStates();update({reaggregate:true});registerWebMcp();
})();
