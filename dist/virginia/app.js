(() => {
  "use strict";
  const { cells, facilities, variables, meta } = window.VA_COUNTY_DATA;
  cells.forEach(c => { c.neighbors = Array.isArray(c.neighbors) ? c.neighbors : []; });
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const byId = new Map(cells.map(c => [c.id, c]));
  const varByKey = new Map(variables.map(v => [v.key, v]));
  const palette = ["#102333", "#15505b", "#188d8a", "#2dd4bf", "#a7f3d0"];
  const bivar = { LL:"#304b5c", LH:"#6f62a6", HL:"#cf8f42", HH:"#16a393", missing:"#172938" };
  const outcomeKeys = new Set(["facilityCount", "reportedMw", "operatingCount", "pipelineCount"]);
  const els = Object.fromEntries([
    "outcomeSelect","compareSelect","countySelect","pointToggle","sampleCount","coverageText","exportButton","metricHexes",
    "metricOccupied","metricMoran","metricSpatial","mapTitle","mapShell","map","mapViewport","countyLayer",
    "facilityLayer","tooltip","legend","zoomOut","zoomReset","zoomIn","scatterplot","scatterTitle","pearsonStat",
    "interpretTitle","interpretText","cellArea","pairCount","detailPanel","resetButton","outcomeHelp","compareHelp",
    "guideButton","guideModal","guideClose","guideNav","guideContent","policySummary","timelineBasis","timelineRange",
    "timelineYearLabel","timelineMin","timelineMax","timelineCoverage","timelinePlay"
  ].map(id => [id, document.getElementById(id)]));

  let outcome = "facilityCount";
  let comparison = "hvLineKm";
  let display = "outcome";
  let selectedId = null;
  let transform = { x:0, y:0, scale:1 };
  let dragging = false;
  let dragStart = null;
  let stats = {};
  let visibleFacilities = facilities;
  let timelineMode = "inventory";
  let timelineYear = 0;
  let timelineTimer = null;

  function inventoryAddedYear(f) {
    const match=String(f.dateCreated||"").match(/^(\d{4})/);
    return match?Number(match[1]):null;
  }
  function facilityTimelineYear(f, mode=timelineMode) {
    const addedYear=inventoryAddedYear(f);
    if(mode==="online"){
      const onlineYear=Number.isInteger(f.onlineYear)?f.onlineYear:null;
      const activeSnapshotYear=["Operating","Expanding"].includes(f.phase)?addedYear:null;
      if(Number.isInteger(onlineYear)&&Number.isInteger(activeSnapshotYear))return Math.min(onlineYear,activeSnapshotYear);
      return Number.isInteger(onlineYear)?onlineYear:activeSnapshotYear;
    }
    return addedYear;
  }
  function timelineBounds(mode=timelineMode) {
    const years=facilities.map(f=>facilityTimelineYear(f,mode)).filter(Number.isInteger);
    return {min:Math.min(...years),max:Math.max(...years),dated:years.length,undated:facilities.length-years.length};
  }
  function matchesTimeline(f) {
    const year=facilityTimelineYear(f);
    if(Number.isInteger(year))return year<=timelineYear;
    return timelineMode==="inventory"&&timelineYear===timelineBounds().max;
  }
  function stopTimeline(){if(timelineTimer)clearInterval(timelineTimer);timelineTimer=null;els.timelinePlay.textContent="Play";}
  function renderTimelineCoverage(){
    const bounds=timelineBounds(),shown=facilities.filter(matchesTimeline).length;
    els.timelineYearLabel.textContent=timelineYear;
    els.timelineRange.setAttribute("aria-valuetext",`Cumulative through ${timelineYear}`);
    els.timelineCoverage.textContent=timelineMode==="inventory"
      ? `${fmt.format(shown)} Virginia records shown. ${fmt.format(bounds.dated)} have an inventory-added year; status categories are the current snapshot.`
      : `${fmt.format(shown)} of ${fmt.format(bounds.dated)} timeline-eligible Virginia records are shown. This includes reported/expected online years plus current Operating or Expanding records no later than their inventory-added year. ${fmt.format(bounds.undated)} records have no eligible date; this is not a verified opening history.`;
  }
  function configureTimeline(resetToMax=false){
    const bounds=timelineBounds();
    if(resetToMax||timelineYear<bounds.min||timelineYear>bounds.max)timelineYear=bounds.max;
    els.timelineRange.min=bounds.min;els.timelineRange.max=bounds.max;els.timelineRange.value=timelineYear;
    els.timelineMin.textContent=bounds.min;els.timelineMax.textContent=bounds.max;renderTimelineCoverage();
  }
  function reaggregateFacilities(){
    visibleFacilities=facilities.filter(matchesTimeline);
    cells.forEach(c=>{c.facilityCount=0;c.reportedMw=0;c.knownMwCount=0;c.operatingCount=0;c.pipelineCount=0;c.directOppositionCount=0;});
    visibleFacilities.forEach(f=>{const c=byId.get(f.countyId);if(!c)return;c.facilityCount+=1;if(Number.isFinite(f.mw)){c.reportedMw+=f.mw;c.knownMwCount+=1;}if(f.phase==="Operating")c.operatingCount+=1;if(f.activity==="Active pipeline")c.pipelineCount+=1;if(f.directOpposition===1)c.directOppositionCount+=1;});
  }
  function playTimeline(){
    if(timelineTimer){stopTimeline();return;}
    const bounds=timelineBounds();
    if(timelineYear>=bounds.max)timelineYear=bounds.min;
    els.timelineRange.value=timelineYear;renderTimelineCoverage();update();els.timelinePlay.textContent="Pause";
    timelineTimer=setInterval(()=>{if(timelineYear>=bounds.max){stopTimeline();return;}timelineYear+=1;els.timelineRange.value=timelineYear;renderTimelineCoverage();update();},900);
  }

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
  cells.slice().sort((a,b)=>a.countyName.localeCompare(b.countyName)).forEach(c => els.countySelect.insertAdjacentHTML("beforeend", `<option value="${c.id}">${escapeHtml(c.countyName)}</option>`));
  els.cellArea.textContent = fmt.format(meta.countyCount);
  els.policySummary.textContent = `${fmt.format(meta.policy.totalBills)} tracked data-center bills, ${fmt.format(meta.policy.billsPassed)} passed bills, ${meta.policy.incentive === 1 ? "a dedicated incentive" : "no dedicated incentive"}, ${meta.policy.electricityTax === 1 ? "an electricity-tax incentive" : "no electricity-tax incentive"}, and ${fmt.format(meta.policy.moratoriumRecords)} moratorium-tracker record.`;
  configureTimeline(true);

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
              <div><dt>County calculation</dt><dd>${escapeHtml(v.calculation)}</dd></div>
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
  function openGuide() { els.guideModal.hidden=false; els.guideModal.classList.add("open"); document.body.classList.add("guide-open"); els.guideClose.focus(); }
  function closeGuide() { els.guideModal.classList.remove("open"); els.guideModal.hidden=true; document.body.classList.remove("guide-open"); els.guideButton.focus(); }
  renderGuide();

  function mean(xs) { return xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : NaN; }
  function pearson(xs, ys) {
    if (xs.length < 3 || xs.length !== ys.length) return NaN;
    const mx = mean(xs), my = mean(ys);
    let num=0, dx=0, dy=0;
    for (let i=0;i<xs.length;i++){ const a=xs[i]-mx,b=ys[i]-my; num+=a*b; dx+=a*a; dy+=b*b; }
    return dx && dy ? num/Math.sqrt(dx*dy) : NaN;
  }
  function computeStats() {
    const valid = cells.filter(c => Number.isFinite(c[outcome]) && Number.isFinite(c[comparison]));
    const active = new Set(valid.map(c => c.id));
    const xs = valid.map(c => c[comparison]);
    const ys = valid.map(c => c[outcome]);
    const my = mean(ys);
    const denom = ys.reduce((sum,y) => sum + (y-my)**2, 0);
    let moranNum = 0;
    const lagX = [], outcomeForLag = [];
    valid.forEach(c => {
      const ns = c.neighbors.map(id => byId.get(id)).filter(n => n && active.has(n.id));
      if (!ns.length) return;
      moranNum += (c[outcome]-my) * mean(ns.map(n => n[outcome]-my));
      lagX.push(mean(ns.map(n => n[comparison])));
      outcomeForLag.push(c[outcome]);
    });
    return { valid, pearson:pearson(xs,ys), moran:denom ? moranNum/denom : NaN, spatial:pearson(outcomeForLag,lagX), pairs:valid.length };
  }
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const i=(sorted.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
    return sorted[lo] + (sorted[hi]-sorted[lo])*(i-lo);
  }
  function breaksFor(key) {
    const values = cells.map(c => c[key]).filter(Number.isFinite).sort((a,b)=>a-b);
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
  function renderMap() {
    const key = display === "comparison" ? comparison : outcome;
    const breaks = breaksFor(key);
    const outVals = cells.map(c=>c[outcome]).filter(Number.isFinite), compVals=cells.map(c=>c[comparison]).filter(Number.isFinite);
    const outMean=mean(outVals), compMean=mean(compVals);
    els.countyLayer.innerHTML = cells.map(c => {
      let fill;
      if (display === "bivariate") {
        fill = Number.isFinite(c[outcome]) && Number.isFinite(c[comparison]) ? bivar[`${c[outcome]>=outMean?"H":"L"}${c[comparison]>=compMean?"H":"L"}`] : bivar.missing;
      } else fill=binColor(c[key],breaks);
      return `<path class="county-cell${c.id===selectedId?" selected":""}" data-id="${c.id}" d="${c.path}" fill="${fill}" tabindex="0" role="button" aria-label="Inspect ${escapeHtml(c.countyName)}"></path>`;
    }).join("");
    els.countyLayer.querySelectorAll(".county-cell").forEach(path => {
      path.addEventListener("pointerenter", e => showTooltip(e, byId.get(path.dataset.id)));
      path.addEventListener("pointermove", positionTooltip);
      path.addEventListener("pointerleave", () => els.tooltip.hidden=true);
      path.addEventListener("click", e => { e.stopPropagation(); selectCounty(path.dataset.id); });
      path.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){e.preventDefault();selectCounty(path.dataset.id);} });
    });
    els.facilityLayer.innerHTML = els.pointToggle.checked ? visibleFacilities.map(f => `<circle class="facility-point" cx="${f.x}" cy="${f.y}" r="2.2" data-county="${f.countyId}"><title>${escapeHtml(f.name)} · ${escapeHtml(f.phase || "Status unknown")}${Number.isFinite(f.mw) ? ` · ${number(f.mw,"MW")}` : ""}</title></circle>`).join("") : "";
    els.facilityLayer.querySelectorAll(".facility-point").forEach(point => point.addEventListener("click", e => { e.stopPropagation(); selectCounty(point.dataset.county); }));
    renderLegend(key, breaks);
  }
  function renderLegend(key, breaks) {
    if (display === "bivariate") {
      els.legend.innerHTML = `<div class="legend-title">Outcome / comparison</div>${[["HH","High / high"],["HL","High / low"],["LH","Low / high"],["LL","Low / low"]].map(([k,l])=>`<div class="legend-item"><span class="legend-swatch" style="background:${bivar[k]}"></span>${l}</div>`).join("")}`;
      return;
    }
    const v=varByKey.get(key);
    els.legend.innerHTML = `<div class="legend-title">${escapeHtml(v.label)}</div>${rampFor(breaks.length).map((color,i)=>`<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${breaks[i]===0?`0 ${escapeHtml(v.unit)}`:`≤ ${escapeHtml(number(breaks[i],v.unit))}`}</div>`).join("")}<div class="legend-item"><span class="legend-swatch" style="background:#172938"></span>Unknown</div>`;
  }
  function showTooltip(event,c) {
    if (!c) return;
    const ov=varByKey.get(outcome), cv=varByKey.get(comparison);
    els.tooltip.innerHTML=`<strong>${escapeHtml(c.countyName)}</strong><span>FIPS ${escapeHtml(c.id)}</span><br>${escapeHtml(ov.label)}: ${escapeHtml(number(c[outcome],ov.unit))}<br>${escapeHtml(cv.label)}: ${escapeHtml(number(c[comparison],cv.unit))}`;
    els.tooltip.hidden=false; positionTooltip(event);
  }
  function positionTooltip(event) { const r=els.mapShell.getBoundingClientRect(); els.tooltip.style.left=`${Math.min(event.clientX-r.left+13,r.width-290)}px`; els.tooltip.style.top=`${Math.max(8,event.clientY-r.top-72)}px`; }

  function renderSummary() {
    stats=computeStats();
    const occupied=cells.filter(c=>c.facilityCount>0).length;
    els.sampleCount.textContent=`${fmt.format(cells.length)} county equivalents`;
    els.coverageText.textContent=`${fmt.format(occupied)} occupied · ${fmt.format(stats.pairs)} complete pairs`;
    els.metricHexes.textContent=fmt.format(cells.length);
    els.metricOccupied.textContent=fmt.format(occupied);
    els.metricMoran.textContent=Number.isFinite(stats.moran)?stats.moran.toFixed(3):"—";
    els.metricSpatial.textContent=Number.isFinite(stats.spatial)?stats.spatial.toFixed(3):"—";
    els.pearsonStat.textContent=Number.isFinite(stats.pearson)?`r = ${stats.pearson.toFixed(3)}`:"r = —";
    els.pairCount.textContent=fmt.format(stats.pairs);
    const ov=varByKey.get(outcome),cv=varByKey.get(comparison);
    els.mapTitle.textContent=display==="outcome"?ov.label:display==="comparison"?cv.label:`${ov.label} × ${cv.label}`;
    els.scatterTitle.textContent=`${ov.label} vs. ${cv.label}`;
    els.interpretTitle.textContent=`${cv.group} context across Virginia`;
    els.interpretText.textContent=`${cv.definition} ${cv.calculation} Pearson’s r compares values in the same counties. Spatial-lag r compares ${ov.label.toLowerCase()} in each county with the average ${cv.label.toLowerCase()} among adjacent counties.`;
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
    const dots=data.map(c=>`<circle class="scatter-dot${c.id===selectedId?" selected":""}" data-id="${c.id}" cx="${sx(c[comparison])}" cy="${sy(c[outcome])}" r="3"><title>${escapeHtml(c.countyName)}</title></circle>`).join("");
    els.scatterplot.innerHTML=`${lines}<line class="axis" x1="48" y1="178" x2="538" y2="178"></line><line class="axis" x1="48" y1="33" x2="48" y2="178"></line>${dots}<line class="trend" x1="${sx(minX)}" y1="${sy(intercept+slope*minX)}" x2="${sx(maxX)}" y2="${sy(intercept+slope*maxX)}"></line><text class="axis-label" x="48" y="198">${escapeHtml(varByKey.get(comparison).label)}</text><text class="axis-label" transform="translate(14 174) rotate(-90)">${escapeHtml(varByKey.get(outcome).label)}</text>`;
    els.scatterplot.querySelectorAll(".scatter-dot").forEach(dot => dot.addEventListener("click",()=>selectCounty(dot.dataset.id)));
  }
  function item(label,val){return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(val)}</strong></div>`;}
  function section(title,items){return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.join("")}</div></section>`;}
  function selectCounty(id) {
    selectedId=id; const c=byId.get(id); if(!c)return;
    els.countySelect.value=id;
    const ov=varByKey.get(outcome),cv=varByKey.get(comparison);
    const neighborNames=c.neighbors.map(n=>byId.get(n)?.shortName).filter(Boolean).join(", ") || "None";
    els.detailPanel.innerHTML=`<div class="detail-content"><span class="eyebrow">Virginia county equivalent</span><h2>${escapeHtml(c.countyName)}</h2><p class="detail-location">FIPS ${escapeHtml(c.id)}</p><span class="detail-badge">${number(c.landAreaSqKm,"km²")}</span>${section("Selected analysis",[item(ov.label,number(c[outcome],ov.unit)),item(cv.label,number(c[comparison],cv.unit)),item("Adjacent geographies",fmt.format(c.neighbors.length))])}${section("Data centers",[item("Facilities",number(c.facilityCount)),item("Reported MW",number(c.reportedMw,"MW")),item("Known MW records",`${c.knownMwCount} of ${c.facilityCount}`),item("Operating",number(c.operatingCount)),item("Active pipeline",number(c.pipelineCount)),item("Direct opposition",number(c.directOppositionCount))])}${section("Power",[item("Operating generation",number(c.plantOperatingMw,"MW")),item("Power plants",number(c.plantCount)),item("≥200 kV lines",number(c.hvLineKm,"km")),item("Active queue",number(c.queueActiveMw,"MW"))])}${section("Resources and opposition",[item("Water scarcity",number(c.waterFactor)),item("Water withdrawal",number(c.waterWithdrawalMgd,"Mgal/day")),item("Drought risk",number(c.droughtScore)),item("Heat-wave risk",number(c.heatScore)),item("Data-processing establishments",number(c.cbpEstablishments)),item("Local actions",number(c.localActionCount))])}<section class="detail-section"><h3>Adjacent geographies</h3><p class="neighbor-list">${escapeHtml(neighborNames)}</p></section></div>`;
    els.detailPanel.classList.add("open"); renderMap(); renderScatter();
  }
  function update() { reaggregateFacilities(); renderSummary(); renderMap(); renderScatter(); if(selectedId)selectCounty(selectedId); }
  function updateTransform(){els.mapViewport.setAttribute("transform",`translate(${transform.x} ${transform.y}) scale(${transform.scale})`);}
  function zoom(factor,cx=500,cy=300){const old=transform.scale,next=Math.max(1,Math.min(8,old*factor));transform.x=cx-(cx-transform.x)*(next/old);transform.y=cy-(cy-transform.y)*(next/old);transform.scale=next;updateTransform();}
  function resetView(){transform={x:0,y:0,scale:1};updateTransform();}
  function exportCsv(){
    const keys=["id","countyName","shortName","lon","lat","landAreaSqKm","facilityCount","reportedMw","knownMwCount","operatingCount","pipelineCount","directOppositionCount","plantCount","plantOperatingMw","plantNameplateMw","hvLineKm","queueActiveMw","waterFactor","waterClass","waterWithdrawalMgd","riskScore","droughtScore","wildfireScore","floodScore","heatScore","cbpEstablishments","localActionCount","neighbors"];
    const rows=[keys,...cells.map(c=>keys.map(k=>Array.isArray(c[k])?c[k].join(";"):c[k]))];
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="virginia_county_dashboard_export.csv";a.click();URL.revokeObjectURL(a.href);
  }

  els.outcomeSelect.addEventListener("change",()=>{outcome=els.outcomeSelect.value;update();});
  els.compareSelect.addEventListener("change",()=>{comparison=els.compareSelect.value;update();});
  els.countySelect.addEventListener("change",()=>{if(els.countySelect.value)selectCounty(els.countySelect.value);});
  els.pointToggle.addEventListener("change",renderMap);
  els.timelineBasis.addEventListener("change",()=>{stopTimeline();timelineMode=els.timelineBasis.value;configureTimeline(true);update();});
  els.timelineRange.addEventListener("input",()=>{stopTimeline();timelineYear=Number(els.timelineRange.value);renderTimelineCoverage();update();});
  els.timelinePlay.addEventListener("click",playTimeline);
  document.querySelectorAll(".display-button").forEach(b=>b.addEventListener("click",()=>{display=b.dataset.display;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x===b));update();}));
  els.resetButton.addEventListener("click",()=>{stopTimeline();outcome="facilityCount";comparison="hvLineKm";display="outcome";els.outcomeSelect.value=outcome;els.compareSelect.value=comparison;els.countySelect.value="";els.pointToggle.checked=false;timelineMode="inventory";els.timelineBasis.value=timelineMode;configureTimeline(true);document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x.dataset.display==="outcome"));selectedId=null;els.detailPanel.classList.remove("open");els.detailPanel.innerHTML='<div class="detail-empty"><span class="detail-hex county-detail-mark"></span><h2>Select a county</h2><p>Choose a county or independent city to inspect its data centers, power context, resources, and neighboring geographies.</p></div>';resetView();update();});
  els.exportButton.addEventListener("click",exportCsv); els.zoomIn.addEventListener("click",()=>zoom(1.35));els.zoomOut.addEventListener("click",()=>zoom(1/1.35));els.zoomReset.addEventListener("click",resetView);
  els.guideButton.addEventListener("click",openGuide); els.guideClose.addEventListener("click",closeGuide);
  els.guideModal.addEventListener("click",event=>{if(event.target===els.guideModal)closeGuide();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!els.guideModal.hidden)closeGuide();});
  els.map.addEventListener("wheel",e=>{e.preventDefault();const r=els.map.getBoundingClientRect();zoom(e.deltaY<0?1.18:1/1.18,(e.clientX-r.left)/r.width*1000,(e.clientY-r.top)/r.height*600);},{passive:false});
  els.map.addEventListener("pointerdown",e=>{if(e.target.classList.contains("county-cell")||e.target.classList.contains("facility-point"))return;dragging=true;dragStart={x:e.clientX,y:e.clientY,tx:transform.x,ty:transform.y};els.map.classList.add("dragging");els.map.setPointerCapture(e.pointerId);});
  els.map.addEventListener("pointermove",e=>{if(!dragging)return;const r=els.map.getBoundingClientRect();transform.x=dragStart.tx+(e.clientX-dragStart.x)/r.width*1000;transform.y=dragStart.ty+(e.clientY-dragStart.y)/r.height*600;updateTransform();});
  els.map.addEventListener("pointerup",()=>{dragging=false;els.map.classList.remove("dragging");});

  function registerWebMcp(){
    const context=document.modelContext;if(!context?.registerTool)return;
    const register=t=>{try{Promise.resolve(context.registerTool(t)).catch(()=>{});}catch(_){}};
    register({name:"set_virginia_county_analysis",title:"Set Virginia county analysis",description:"Choose the Virginia county outcome, comparison variable, and map display.",inputSchema:{type:"object",properties:{outcome:{type:"string",enum:[...outcomeKeys]},comparison:{type:"string",enum:variables.filter(v=>!outcomeKeys.has(v.key)).map(v=>v.key)},display:{type:"string",enum:["outcome","comparison","bivariate"]}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(input.outcome){outcome=input.outcome;els.outcomeSelect.value=outcome}if(input.comparison){comparison=input.comparison;els.compareSelect.value=comparison}if(input.display){display=input.display;document.querySelectorAll(".display-button").forEach(x=>x.classList.toggle("active",x.dataset.display===display))}update();return{counties:cells.length,outcome,comparison,display,pearson:stats.pearson,moransI:stats.moran,spatialLagR:stats.spatial};}});
    register({name:"select_virginia_county",title:"Select Virginia county",description:"Open details for one Virginia county-equivalent FIPS code.",inputSchema:{type:"object",properties:{countyFips:{type:"string"}},required:["countyFips"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!byId.has(input.countyFips))throw new Error("Unknown Virginia county FIPS code.");selectCounty(input.countyFips);return{selected:input.countyFips,county:byId.get(input.countyFips).countyName};}});
    register({name:"read_virginia_county_summary",title:"Read Virginia county summary",description:"Return the current Virginia county selection and descriptive spatial statistics.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(){return{counties:cells.length,occupied:cells.filter(c=>c.facilityCount>0).length,outcome,comparison,pearson:stats.pearson,moransI:stats.moran,spatialLagR:stats.spatial,snapshot:meta.snapshot};}});
  }
  update(); registerWebMcp();
})();
