(() => {
  "use strict";
  const { cells, variables, meta } = window.HEX_DASHBOARD_DATA;
  const base = window.DASHBOARD_DATA;
  cells.forEach(c => { c.neighbors = Array.isArray(c.neighbors) ? c.neighbors : (typeof c.neighbors === "string" && c.neighbors ? [c.neighbors] : []); });
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const byId = new Map(cells.map(c => [c.id, c]));
  const varByKey = new Map(variables.map(v => [v.key, v]));
  const palette = ["#102333", "#15505b", "#188d8a", "#2dd4bf", "#a7f3d0"];
  const bivar = { LL:"#304b5c", LH:"#6f62a6", HL:"#cf8f42", HH:"#16a393", missing:"#172938" };
  const outcomeKeys = new Set(["facilityCount", "reportedMw", "operatingCount", "pipelineCount"]);
  const els = Object.fromEntries([
    "outcomeSelect","compareSelect","stateFilter","landFilter","pointToggle","sampleCount","coverageText","exportButton",
    "metricHexes","metricOccupied","metricMoran","metricSpatial","mapTitle","mapShell","map","mapViewport","stateLayer",
    "hexLayer","facilityLayer","outlineLayer","tooltip","legend","zoomOut","zoomReset","zoomIn","scatterplot","scatterTitle",
    "pearsonStat","interpretTitle","interpretText","cellArea","pairCount","detailPanel","resetButton","outcomeHelp","compareHelp",
    "guideButton","guideModal","guideClose","guideNav","guideContent"
  ].map(id => [id, document.getElementById(id)]));
  let outcome = "facilityCount";
  let comparison = "hvLineKm";
  let display = "outcome";
  let filtered = cells;
  let selectedId = null;
  let transform = { x:0, y:0, scale:1 };
  let dragging = false;
  let dragStart = null;
  let stats = {};

  function escapeHtml(input) { return String(input ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
  function number(value, unit="") { return Number.isFinite(value) ? `${fmt.format(value)}${unit ? ` ${unit}` : ""}` : "Unknown"; }
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
    els.facilityLayer.innerHTML = els.pointToggle.checked ? base.facilities.filter(f => !els.stateFilter.value || f.state===els.stateFilter.value).map(f => `<circle class="facility-point" cx="${f.x}" cy="${f.y}" r="1.6"><title>${escapeHtml(f.name)}</title></circle>`).join("") : "";
    renderLegend(key, breaks);
  }
  function renderLegend(key, breaks) {
    if (display === "bivariate") {
      els.legend.innerHTML = `<div class="legend-title">Outcome / comparison</div>${[["HH","High / high"],["HL","High / low"],["LH","Low / high"],["LL","Low / low"]].map(([k,l])=>`<div class="legend-item"><span class="legend-swatch" style="background:${bivar[k]}"></span>${l}</div>`).join("")}`;
      return;
    }
    const v=varByKey.get(key);
    els.legend.innerHTML = `<div class="legend-title">${escapeHtml(v.label)}</div>${rampFor(breaks.length).map((color,i)=>`<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${breaks[i]===0?`0 ${escapeHtml(v.unit)}`:`≤ ${escapeHtml(number(breaks[i],v.unit))}`}</div>`).join("")}<div class="legend-item"><span class="legend-swatch" style="background:#172938"></span>Missing</div>`;
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
    const occupied=filtered.filter(c=>c.facilityCount>0).length;
    els.sampleCount.textContent=`${fmt.format(filtered.length)} hexagons`;
    els.coverageText.textContent=`${fmt.format(occupied)} occupied · ${fmt.format(stats.pairs)} complete pairs`;
    els.metricHexes.textContent=fmt.format(filtered.length);
    els.metricOccupied.textContent=fmt.format(occupied);
    els.metricMoran.textContent=Number.isFinite(stats.moran)?stats.moran.toFixed(3):"—";
    els.metricSpatial.textContent=Number.isFinite(stats.spatial)?stats.spatial.toFixed(3):"—";
    els.pearsonStat.textContent=Number.isFinite(stats.pearson)?`r = ${stats.pearson.toFixed(3)}`:"r = —";
    els.pairCount.textContent=fmt.format(stats.pairs);
    const ov=varByKey.get(outcome),cv=varByKey.get(comparison);
    els.mapTitle.textContent=display==="outcome"?ov.label:display==="comparison"?cv.label:`${ov.label} × ${cv.label}`;
    els.scatterTitle.textContent=`${ov.label} vs. ${cv.label}`;
    els.interpretTitle.textContent=`${cv.group} context at a common scale`;
    els.interpretText.textContent=`${cv.definition} ${cv.calculation} Pearson’s r compares values in the same cells. Spatial-lag r compares ${ov.label.toLowerCase()} in each cell with the average ${cv.label.toLowerCase()} among adjacent cells.`;
    renderVariableHelp();
  }
  function renderScatter() {
    const data=stats.valid;
    const xs=data.map(c=>c[comparison]), ys=data.map(c=>c[outcome]);
    if (data.length<2){els.scatterplot.innerHTML="";return;}
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const sx=x=>48+(x-minX)/(maxX-minX||1)*490, sy=y=>178-(y-minY)/(maxY-minY||1)*145;
    const mx=mean(xs),my=mean(ys); let num=0,den=0; xs.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)**2}); const slope=den?num/den:0,intercept=my-slope*mx;
    const lines=[0,.25,.5,.75,1].map(p=>`<line class="gridline" x1="48" x2="538" y1="${33+145*p}" y2="${33+145*p}"></line>`).join("");
    const dots=data.map(c=>`<circle class="scatter-dot" cx="${sx(c[comparison])}" cy="${sy(c[outcome])}" r="2.5"><title>${escapeHtml(c.id)}</title></circle>`).join("");
    els.scatterplot.innerHTML=`${lines}<line class="axis" x1="48" y1="178" x2="538" y2="178"></line><line class="axis" x1="48" y1="33" x2="48" y2="178"></line>${dots}<line class="trend" x1="${sx(minX)}" y1="${sy(intercept+slope*minX)}" x2="${sx(maxX)}" y2="${sy(intercept+slope*maxX)}"></line><text class="axis-label" x="48" y="198">${escapeHtml(varByKey.get(comparison).label)}</text><text class="axis-label" transform="translate(14 174) rotate(-90)">${escapeHtml(varByKey.get(outcome).label)}</text>`;
  }
  function item(label,val){return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(val)}</strong></div>`;}
  function section(title,items){return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.join("")}</div></section>`;}
  function selectCell(id) {
    selectedId=id; const c=byId.get(id); if(!c)return;
    const ov=varByKey.get(outcome),cv=varByKey.get(comparison);
    els.detailPanel.innerHTML=`<div class="detail-content"><span class="eyebrow">Analysis cell</span><h2>${escapeHtml(c.id)}</h2><p class="detail-location">${escapeHtml(c.countyName||"County unavailable")}, ${escapeHtml(c.stateName||c.state||"")}</p><span class="detail-badge">${number(c.landFraction*100,"% land")}</span>${section("Selected analysis",[item(ov.label,number(c[outcome],ov.unit)),item(cv.label,number(c[comparison],cv.unit)),item("Neighbor cells",fmt.format(c.neighbors.length)),item("Centroid",`${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`)])}${section("Data centers",[item("Facilities",number(c.facilityCount)),item("Reported MW",number(c.reportedMw,"MW")),item("Operating",number(c.operatingCount)),item("Active pipeline",number(c.pipelineCount)),item("Known MW records",`${c.knownMwCount} of ${c.facilityCount}`),item("Direct opposition",number(c.directOppositionCount))])}${section("Power",[item("Operating generation",number(c.plantOperatingMw,"MW")),item("Power plants",number(c.plantCount)),item("≥200 kV lines",number(c.hvLineKm,"km")),item("Active queue",number(c.queueActiveMw,"MW"))])}${section("Resources & policy",[item("Water scarcity",number(c.waterFactor)),item("Drought risk",number(c.droughtScore)),item("State bills",number(c.policyBills)),item("Dedicated incentive",c.incentive===1?"Yes":c.incentive===0?"No":"Unknown"),item("Moratorium records",number(c.moratoriums)),item("Local actions",number(c.localActionCount))])}</div>`;
    els.detailPanel.classList.add("open"); renderMap();
  }
  function update() { filtered=currentCells(); renderSummary(); renderMap(); renderScatter(); }
  function updateTransform(){els.mapViewport.setAttribute("transform",`translate(${transform.x} ${transform.y}) scale(${transform.scale})`);}
  function zoom(factor,cx=500,cy=300){const old=transform.scale,next=Math.max(1,Math.min(6,old*factor));transform.x=cx-(cx-transform.x)*(next/old);transform.y=cy-(cy-transform.y)*(next/old);transform.scale=next;updateTransform();}
  function resetView(){transform={x:0,y:0,scale:1};updateTransform();}
  function exportCsv(){
    const keys=["id","region","state","countyFips","countyName","xAea","yAea","lon","lat","landFraction","facilityCount","reportedMw","knownMwCount","operatingCount","pipelineCount","directOppositionCount","plantCount","plantOperatingMw","plantNameplateMw","hvLineKm","queueActiveMw","waterFactor","waterClass","waterWithdrawalMgd","riskScore","droughtScore","wildfireScore","floodScore","heatScore","cbpEstablishments","incentive","electricityTax","moratoriums","policyBills","policyPassed","localActionCount","neighbors"];
    const rows=[keys,...filtered.map(c=>keys.map(k=>Array.isArray(c[k])?c[k].join(";"):c[k]))];
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`us_hex_grid_${meta.cellWidthKm}km_filtered.csv`;a.click();URL.revokeObjectURL(a.href);
  }
  els.outcomeSelect.addEventListener("change",()=>{outcome=els.outcomeSelect.value;update();});
  els.compareSelect.addEventListener("change",()=>{comparison=els.compareSelect.value;update();});
  els.stateFilter.addEventListener("change",update); els.landFilter.addEventListener("change",update); els.pointToggle.addEventListener("change",renderMap);
  document.querySelectorAll(".display-button").forEach(b=>b.addEventListener("click",()=>{display=b.dataset.display;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x===b));update();}));
  els.resetButton.addEventListener("click",()=>{outcome="facilityCount";comparison="hvLineKm";display="outcome";els.outcomeSelect.value=outcome;els.compareSelect.value=comparison;els.stateFilter.value="";els.landFilter.value="0";els.pointToggle.checked=false;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x.dataset.display==="outcome"));selectedId=null;els.detailPanel.classList.remove("open");els.detailPanel.innerHTML='<div class="detail-empty"><span class="detail-hex"></span><h2>Select a hexagon</h2><p>Choose a cell to inspect its outcome, context measures, source geography, and neighbors.</p></div>';resetView();update();});
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
    register({name:"set_hex_analysis",title:"Set hex-grid analysis",description:"Choose the visible outcome, comparison variable, optional state, and map display.",inputSchema:{type:"object",properties:{outcome:{type:"string",enum:[...outcomeKeys]},comparison:{type:"string",enum:variables.filter(v=>!outcomeKeys.has(v.key)).map(v=>v.key)},state:{type:"string"},display:{type:"string",enum:["outcome","comparison","bivariate"]}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){const allowed=new Set(["outcome","comparison","state","display"]);if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!allowed.has(k)))throw new Error("Invalid analysis inputs.");if(input.outcome){outcome=input.outcome;els.outcomeSelect.value=outcome}if(input.comparison){comparison=input.comparison;els.compareSelect.value=comparison}if(input.state!==undefined){els.stateFilter.value=input.state}if(input.display){display=input.display;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x.dataset.display===display))}update();return{hexagons:filtered.length,outcome,comparison,display,pearson:stats.pearson,moransI:stats.moran,spatialLagR:stats.spatial};}});
    register({name:"select_hexagon",title:"Select hexagon",description:"Open details for one exact analysis-cell ID.",inputSchema:{type:"object",properties:{hexId:{type:"string"}},required:["hexId"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length!==1||typeof input.hexId!=="string"||!byId.has(input.hexId))throw new Error("Unknown hexagon ID.");selectCell(input.hexId);return{selected:input.hexId};}});
    register({name:"read_spatial_summary",title:"Read spatial summary",description:"Return the current grid selection and descriptive spatial statistics.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error("This tool takes no inputs.");return{hexagons:filtered.length,occupied:filtered.filter(c=>c.facilityCount>0).length,outcome,comparison,pearson:stats.pearson,moransI:stats.moran,spatialLagR:stats.spatial,snapshot:meta.snapshot};}});
  }
  renderStates();update();registerWebMcp();
})();
