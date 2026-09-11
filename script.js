let LEAVES = [];
let DISTRICTS = [];
let translations = {};

let currentLang = "en";
let selectedLeafId = null;
let uploadedDataUrl = null;
let currentDistrictId = "pune";

/* ===================== INIT (FETCH JSON DATA) ===================== */
fetch('data.json')
  .then(response => response.json())
  .then(data => {
    LEAVES = data.LEAVES;
    DISTRICTS = data.DISTRICTS;
    translations = data.translations;
    
    renderLeafGrid();
    populateDistrictSelect();
    renderRisk();
    renderSteps();
  })
  .catch(error => console.error('Error fetching data.json:', error));

/* ===================== HELPERS ===================== */
function t(lang){ return translations[lang]; }
function severityColor(sev){
  return sev==="high" ? "var(--alert-high)" : sev==="medium" ? "var(--alert-med)" : "var(--alert-low)";
}
function riskGaugeColor(score){
  return score>=65 ? "var(--alert-high)" : score>=35 ? "var(--alert-med)" : "var(--alert-low)";
}

function leafSvg(leaf){
  const c = leaf.color;
  let spotsMarkup = "";
  const positions = [[24,20],[40,16],[16,34],[34,36],[22,44],[42,42],[30,26],[18,22]];
  for(let i=0;i<leaf.spots;i++){
    const p = positions[i % positions.length];
    spotsMarkup += `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#7a3b2b" opacity="0.6"/>`;
  }
  return `<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    <path d="M28 50C28 50 8 40 8 24C8 14 16 8 28 8C40 8 48 14 48 24C48 40 28 50 28 50Z" fill="${c}"/>
    <path d="M28 50V16" stroke="#2f2517" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>
    ${spotsMarkup}
  </svg>`;
}

/* ===================== RENDER: LEAF GRID ===================== */
function renderLeafGrid(){
  const grid = document.getElementById("leafGrid");
  grid.innerHTML = "";
  LEAVES.forEach(leaf=>{
    const card = document.createElement("button");
    card.className = "leaf-card";
    card.setAttribute("role","listitem");
    card.dataset.id = leaf.id;
    if(leaf.id === selectedLeafId) card.classList.add("selected");
    card.innerHTML = `<div class="thumb">${leafSvg(leaf)}</div><div class="label">${t(currentLang).results[leaf.id].name}</div>`;
    card.addEventListener("click", ()=>selectLeaf(leaf.id));
    grid.appendChild(card);
  });
  const upCard = document.createElement("button");
  upCard.className = "upload-card";
  upCard.id = "uploadCard";
  upCard.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke-linecap="round"/></svg><span id="uploadLabel">${t(currentLang).demo.upload}</span>`;
  upCard.addEventListener("click", ()=>document.getElementById("fileInput").click());
  grid.appendChild(upCard);
}

function selectLeaf(id){
  selectedLeafId = id;
  uploadedDataUrl = null;
  document.querySelectorAll(".leaf-card").forEach(c=>c.classList.toggle("selected", c.dataset.id===id));
  document.getElementById("resultCard").style.display = "none";
  document.getElementById("scanPanel").style.display = "none";
  enableScan();
}

function enableScan(){
  const btn = document.getElementById("scanBtn");
  btn.disabled = false;
  btn.classList.remove("btn-disabled");
}

/* handle custom upload: replace grid preview + pick a plausible mock result */
document.getElementById("fileInput").addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    uploadedDataUrl = reader.result;
    const nonHealthy = LEAVES.filter(l=>l.id!=="healthy");
    const pick = nonHealthy[Math.floor(Math.random()*nonHealthy.length)];
    selectedLeafId = pick.id;
    const upCard = document.getElementById("uploadCard");
    upCard.innerHTML = `<div class="thumb"><img src="${uploadedDataUrl}" alt=""></div><div class="label">${t(currentLang).demo.uploaded}</div>`;
    document.querySelectorAll(".leaf-card").forEach(c=>c.classList.remove("selected"));
    document.getElementById("resultCard").style.display = "none";
    document.getElementById("scanPanel").style.display = "none";
    enableScan();
  };
  reader.readAsDataURL(file);
});

/* ===================== SCAN ANIMATION ===================== */
document.getElementById("scanBtn").addEventListener("click", runScan);
function runScan(){
  if(!selectedLeafId) return;
  const panel = document.getElementById("scanPanel");
  const fill = document.getElementById("scanFill");
  const resultCard = document.getElementById("resultCard");
  resultCard.style.display = "none";
  document.getElementById("stamp").classList.remove("show");
  panel.style.display = "block";
  fill.style.width = "0%";
  let pct = 0;
  const interval = setInterval(()=>{
    pct += 4 + Math.random()*6;
    if(pct >= 100){
      pct = 100;
      clearInterval(interval);
      setTimeout(()=>{
        panel.style.display = "none";
        renderResult(selectedLeafId);
      }, 220);
    }
    fill.style.width = pct + "%";
  }, 90);
}

function renderResult(id){
  const leaf = LEAVES.find(l=>l.id===id);
  const data = t(currentLang).results[id];
  const demo = t(currentLang).demo;
  const card = document.getElementById("resultCard");
  document.getElementById("resultName").textContent = data.name;
  const badge = document.getElementById("severityBadge");
  badge.textContent = demo.severityLabels[leaf.severity];
  badge.className = "severity-badge severity-" + leaf.severity;
  document.getElementById("confidenceValue").textContent = leaf.confidence + "%";
  document.getElementById("advisoryText").textContent = data.advisory;
  card.style.display = "block";
  const fill = document.getElementById("confidenceFill");
  fill.style.width = "0%";
  requestAnimationFrame(()=>{ setTimeout(()=>{ fill.style.width = leaf.confidence + "%"; }, 30); });
  const stampCircles = document.querySelectorAll("#stamp circle, #stamp path:not(#stampPath)");
  stampCircles.forEach(el=>el.setAttribute("stroke", severityColor(leaf.severity)));
  const stampText = document.getElementById("stampText");
  const stampTextParent = stampText.closest("text");
  if(stampTextParent) stampTextParent.setAttribute("fill", severityColor(leaf.severity));
  setTimeout(()=>document.getElementById("stamp").classList.add("show"), 260);
}

/* ===================== RISK SECTION ===================== */
function populateDistrictSelect(){
  const select = document.getElementById("districtSelect");
  select.innerHTML = "";
  DISTRICTS.forEach(d=>{
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = t(currentLang).districts[d.id].name;
    if(d.id === currentDistrictId) opt.selected = true;
    select.appendChild(opt);
  });
}
document.getElementById("districtSelect").addEventListener("change", (e)=>{
  currentDistrictId = e.target.value;
  renderRisk();
});

function renderRisk(){
  const d = DISTRICTS.find(x=>x.id===currentDistrictId);
  const info = t(currentLang).districts[d.id];
  const demo = t(currentLang).demo;
  document.getElementById("gaugeFill").style.width = d.score + "%";
  document.getElementById("gaugeFill").style.background = riskGaugeColor(d.score);
  document.getElementById("gaugeScore").textContent = d.score + "%";
  document.getElementById("riskReasoning").textContent = info.reasoning;
  const chip = document.getElementById("riskChip");
  chip.textContent = demo.severityLabels[d.risk];
  chip.style.background = d.risk==="high" ? "var(--alert-high-bg)" : d.risk==="medium" ? "var(--alert-med-bg)" : "var(--alert-low-bg)";
  chip.style.color = severityColor(d.risk);

  const barChart = document.getElementById("barChart");
  barChart.innerHTML = "";
  d.values.forEach((v,i)=>{
    const col = document.createElement("div");
    col.className = "bar-col";
    col.innerHTML = `<div class="bar" style="height:${v}%; background:${riskGaugeColor(v)}"></div><div class="bar-day">${i+1}</div>`;
    barChart.appendChild(col);
  });
}

/* ===================== HOW IT WORKS ===================== */
function renderSteps(){
  const grid = document.getElementById("stepsGrid");
  grid.innerHTML = "";
  t(currentLang).how.steps.forEach((s,i)=>{
    const card = document.createElement("div");
    card.className = "step";
    card.innerHTML = `<div class="num">0${i+1}</div><h3>${s.title}</h3><p>${s.body}</p>`;
    grid.appendChild(card);
  });
}

/* ===================== STATIC TEXT + LANGUAGE SWITCH ===================== */
function applyStaticText(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const path = el.getAttribute("data-i18n").split(".");
    let val = t(currentLang);
    for(const p of path){ val = val && val[p]; }
    if(typeof val === "string"){
      el.textContent = val;
    }
  });
}

function switchLang(lang){
  currentLang = lang;
  document.documentElement.setAttribute("lang", lang);
  document.body.className = "lang-" + lang;
  document.querySelectorAll(".lang-btn").forEach(b=>b.classList.toggle("active", b.dataset.lang===lang));
  applyStaticText();
  renderLeafGrid();
  if(uploadedDataUrl){
    const upCard = document.getElementById("uploadCard");
    upCard.innerHTML = `<div class="thumb"><img src="${uploadedDataUrl}" alt=""></div><div class="label">${t(currentLang).demo.uploaded}</div>`;
  }
  if(selectedLeafId){
    document.querySelectorAll(".leaf-card").forEach(c=>c.classList.toggle("selected", c.dataset.id===selectedLeafId));
  }
  if(document.getElementById("resultCard").style.display === "block"){
    renderResult(selectedLeafId);
  }
  populateDistrictSelect();
  renderRisk();
  renderSteps();
}

document.querySelectorAll(".lang-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>switchLang(btn.dataset.lang));
});

document.getElementById("heroCta").addEventListener("click", ()=>{
  document.getElementById("demo").scrollIntoView({behavior:"smooth"});
});
document.getElementById("heroCta2").addEventListener("click", ()=>{
  document.getElementById("how").scrollIntoView({behavior:"smooth"});
});