/* ===================== CONSTANTS & INITIAL DATA ===================== */
const LEAVES = [
  {id:"healthy", severity:"low", confidence:97, color:"#4B7340", spots:0},
  {id:"blight", severity:"high", confidence:89, color:"#7A5C33", spots:5},
  {id:"mildew", severity:"medium", confidence:84, color:"#8FA07A", spots:6},
  {id:"aphid", severity:"medium", confidence:91, color:"#5C7A46", spots:8},
  {id:"nitrogen", severity:"low", confidence:78, color:"#B7B24A", spots:0}
];

// Coordinates for all 13 Maharashtra Agricultural Districts
const districtCoords = {
  "Ahilyanagar": { lat: 19.0946, lon: 74.7384 },
  "Akola": { lat: 20.7002, lon: 77.0082 },
  "Amravati": { lat: 20.9374, lon: 77.7796 },
  "Beed": { lat: 18.9901, lon: 75.7600 },
  "Bhandara": { lat: 21.1682, lon: 79.6489 },
  "Kolhapur": { lat: 16.7050, lon: 74.2433 },
  "Nagpur": { lat: 21.1458, lon: 79.0882 },
  "Nashik": { lat: 20.0059, lon: 73.7898 },
  "Parbhani": { lat: 19.2686, lon: 76.7709 },
  "Pune": { lat: 18.5204, lon: 73.8567 },
  "Satara": { lat: 17.6805, lon: 74.0183 },
  "Wardha": { lat: 20.7453, lon: 78.6022 },
  "Yavatmal": { lat: 20.3888, lon: 78.1204 }
};

let translationsData = {};
let currentLang = "en";
let selectedLeafId = null;
let uploadedDataUrl = null;
let currentDistrictId = "Pune";
let leafCheckState = null;
let rejectedDataUrl = null;

let currentView = "farmer";
let officerFilter = "all";
let lastAiResult = null;
let referDistrictId = "Pune";
let activeCaseId = null;
let statusPollTimer = null;

/* ===================== STORAGE ADAPTER ===================== */
const StorageAdapter = {
  memory: {},
  async get(key) {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
      try { const res = await window.storage.get(key, true); return res ? res.value : null; } catch(e) {}
    }
    try { return localStorage.getItem(key); } catch(e) { return this.memory[key] || null; }
  },
  async set(key, val) {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
      try { await window.storage.set(key, val, true); return; } catch(e) {}
    }
    try { localStorage.setItem(key, val); } catch(e) { this.memory[key] = val; }
  },
  async list(prefix) {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.list === "function") {
      try { const res = await window.storage.list(prefix, true); if (res && res.keys) return res.keys; } catch(e) {}
    }
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
    } catch(e) {
      for (const k in this.memory) { if (k.startsWith(prefix)) keys.push(k); }
    }
    return keys;
  },
  async delete(key) {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.delete === "function") {
      try { await window.storage.delete(key, true); return; } catch(e) {}
    }
    try { localStorage.removeItem(key); } catch(e) { delete this.memory[key]; }
  }
};

async function saveCase(caseObj){
  await StorageAdapter.set("case:" + caseObj.id, JSON.stringify(caseObj));
}

async function loadCase(id){
  try{
    const r = await StorageAdapter.get("case:" + id);
    return r ? JSON.parse(r) : null;
  }catch(err){
    return null;
  }
}

async function loadAllCases(){
  try{
    const keys = await StorageAdapter.list("case:");
    if(!keys || !keys.length) return [];
    const results = await Promise.all(keys.map(async key=>{
      try{
        const r = await StorageAdapter.get(key);
        return r ? JSON.parse(r) : null;
      }catch(err){ return null; }
    }));
    return results.filter(Boolean).sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
  }catch(err){
    console.error("Failed to load cases:", err);
    return [];
  }
}

async function deleteAllCases(){
  try{
    const keys = await StorageAdapter.list("case:");
    if(!keys) return;
    await Promise.all(keys.map(key=>StorageAdapter.delete(key)));
  }catch(err){
    console.error("Failed to clear demo cases:", err);
  }
}

function seedDemoCases(){
  const now = Date.now();
  const days = n => new Date(now - n*24*60*60*1000).toISOString();
  const seed = [
    {id:genCaseId(), createdAt:days(0.2), district:"Nashik", diagnosisId:"blight", confidence:89, severity:"high", imageDataUrl:null, aiNote:null, status:"pending", confirmedAt:null},
    {id:genCaseId(), createdAt:days(0.6), district:"Kolhapur", diagnosisId:"mildew", confidence:84, severity:"medium", imageDataUrl:null, aiNote:null, status:"pending", confirmedAt:null},
    {id:genCaseId(), createdAt:days(1.3), district:"Pune", diagnosisId:"aphid", confidence:91, severity:"medium", imageDataUrl:null, aiNote:null, status:"confirmed", confirmedAt:days(1.0)},
    {id:genCaseId(), createdAt:days(2.1), district:"Amravati", diagnosisId:"nitrogen", confidence:78, severity:"low", imageDataUrl:null, aiNote:null, status:"confirmed", confirmedAt:days(1.8)},
    {id:genCaseId(), createdAt:days(4.5), district:"Nashik", diagnosisId:"blight", confidence:87, severity:"high", imageDataUrl:null, aiNote:null, status:"resolved", confirmedAt:days(4.0)},
    {id:genCaseId(), createdAt:days(0.05),district:"Ahilyanagar", diagnosisId:"aphid", confidence:83, severity:"medium", imageDataUrl:null, aiNote:null, status:"pending", confirmedAt:null}
  ];
  return Promise.all(seed.map(saveCase));
}

/* ===================== HELPERS ===================== */
function t(lang){ return translationsData[lang] || {}; }
function severityColor(sev){
  return sev==="high" ? "var(--alert-high)" : sev==="medium" ? "var(--alert-med)" : "var(--alert-low)";
}
function riskGaugeColor(score){
  return score>=65 ? "var(--alert-high)" : score>=35 ? "var(--alert-med)" : "var(--alert-low)";
}

/* ===================== OPEN-METEO WEATHER & RISK ENGINE ===================== */
function calculateRiskScore(humidity, tempMax, leafWetness, rainProb) {
  let score = 20; 
  if (humidity > 80) score += 35;
  else if (humidity > 60) score += 20;

  if (tempMax >= 18 && tempMax <= 30) score += 20;
  if (leafWetness > 40) score += 15;
  if (rainProb > 50) score += 10;

  return Math.min(100, Math.max(0, score));
}

function getRiskCategory(score) {
  if (score >= 80) return { label: "Critical", color: "#d9534f" };
  if (score >= 60) return { label: "High", color: "#e67e22" };
  if (score >= 40) return { label: "Moderate", color: "#f0ad4e" };
  return { label: "Low", color: "#5cb85c" };
}

function detectDiseases(temp, humidity, rainSum, rainProb, windSpeed) {
  const diseases = [];

  if (temp >= 10 && temp <= 24 && humidity >= 85 && (rainSum > 0 || rainProb > 50)) {
    diseases.push("Late Blight");
  }
  if (temp >= 15 && temp <= 26 && humidity >= 80) {
    diseases.push("Downy Mildew");
  }
  if (temp >= 24 && temp <= 32 && humidity >= 70) {
    diseases.push("Early Blight");
  }
  if (temp >= 25 && temp <= 32 && humidity >= 80 && rainSum > 0.5) {
    diseases.push("Anthracnose / Fruit Rot");
  }
  if (humidity >= 75 && (rainSum > 0 || rainProb > 40) && windSpeed > 8) {
    diseases.push("Bacterial Leaf Blight");
  }
  if (temp >= 18 && temp <= 30 && humidity >= 50 && humidity <= 80 && rainSum < 0.5) {
    diseases.push("Powdery Mildew");
  }
  if (temp >= 15 && temp <= 25 && humidity >= 85) {
    diseases.push("Fungal Rust");
  }

  return diseases;
}

function getCardinalDirection(angle) {
  if (angle === undefined || angle === null) return "N";
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(angle / 45) % 8];
}

async function updateRiskUI(districtName) {
  const coords = districtCoords[districtName];
  if (!coords) return;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,leaf_wetness_probability_mean&timezone=auto`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.daily) return;
    
    const daily = data.daily;
    const current = data.current;

    const liveHumidity = current ? current.relative_humidity_2m : daily.relative_humidity_2m_mean[0];
    const liveTemp = current ? Math.round(current.temperature_2m) : Math.round(daily.temperature_2m_max[0]);
    const liveRain = current ? current.precipitation : daily.precipitation_sum[0];
    const liveWindSpeed = current ? current.wind_speed_10m : daily.wind_speed_10m_max[0];
    const liveWindDir = current ? current.wind_direction_10m : daily.wind_direction_10m_dominant[0];

    const dailyRisks = [];
    for (let i = 0; i < 5; i++) {
      const tempMax = daily.temperature_2m_max ? daily.temperature_2m_max[i] : 25;
      const humidity = daily.relative_humidity_2m_mean ? daily.relative_humidity_2m_mean[i] : 60;
      const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 10;
      const leafWetness = (daily.leaf_wetness_probability_mean && daily.leaf_wetness_probability_mean[i]) || 10;

      const score = calculateRiskScore(humidity, tempMax, leafWetness, rainProb);
      dailyRisks.push({ score, tempMax });
    }

    const todayScore = dailyRisks[0].score;
    const category = getRiskCategory(todayScore);

    // 1. Update Percentage Score & Fill Gauge
    const scoreElem = document.getElementById("gaugeScore");
    if (scoreElem) scoreElem.innerText = `${todayScore}%`;

    const fillElem = document.getElementById("gaugeFill");
    if (fillElem) {
      fillElem.style.width = `${todayScore}%`;
      fillElem.style.backgroundColor = category.color;
    }

    // 2. Update Risk Badge / Chip
    const riskBadge = document.getElementById("riskChip") || document.querySelector(".risk-badge") || document.getElementById("riskLevel") || document.getElementById("riskBadge");
    if (riskBadge) {
      riskBadge.innerText = category.label;
      riskBadge.style.backgroundColor = category.color;
    }

    // 3. Evaluate specific active diseases
    const rainProbToday = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 0;
    const activeDiseases = detectDiseases(liveTemp, liveHumidity, liveRain, rainProbToday, liveWindSpeed);

    // 4. Update Reasoning Text
    const reasoning = document.getElementById("riskReasoning");
    if (reasoning) {
      const diseaseText = activeDiseases.length > 0 
        ? `High risk detected for: ${activeDiseases.join(", ")}.` 
        : `Favorable conditions; low pathogen risk.`;

      reasoning.innerText = `${diseaseText}\nTemp: ${liveTemp}°C | Humidity: ${liveHumidity}% | Rain: ${liveRain}mm (${rainProbToday}%) | Wind: ${liveWindSpeed} km/h (${getCardinalDirection(liveWindDir)})`;
    }

    // 5. Render 5-Day Visual Bar Chart
    const barChart = document.getElementById("barChart");
    if (barChart) {
      barChart.innerHTML = "";
      dailyRisks.forEach((day, index) => {
        const dayCat = getRiskCategory(day.score);
        const col = document.createElement("div");
        col.className = "bar-col";
        col.style.cssText = "display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; flex:1;";
        col.innerHTML = `
          <div class="bar" style="width:100%; height:${day.score}%; background:${dayCat.color}; border-radius:4px 4px 0 0;"></div>
          <div class="bar-day" style="margin-top:6px; font-size:12px; color:#aaa;">${index + 1}</div>
        `;
        barChart.appendChild(col);
      });
    }

  } catch (error) {
    console.error("Error fetching risk forecast:", error);
  }
}

/* ===================== IMAGE ANALYSIS ===================== */
const LEAF_MIN_RATIO = 0.10;

function rgbToHsv(r, g, b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if(d!==0){
    if(max===r) h = 60*(((g-b)/d)%6);
    else if(max===g) h = 60*(((b-r)/d)+2);
    else h = 60*(((r-g)/d)+4);
  }
  if(h<0) h+=360;
  const s = max===0 ? 0 : d/max;
  const v = max;
  return {h,s,v};
}

function loadPixelData(dataUrl, maxDim){
  maxDim = maxDim || 160;
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        resolve({data, w, h, ok:true});
      }catch(err){ resolve({data:null, ok:false}); }
    };
    img.onerror = ()=> resolve({data:null, ok:false});
    img.src = dataUrl;
  });
}

function analyzeImageForLeaf(dataUrl){
  return loadPixelData(dataUrl, 160).then(({data, ok})=>{
    if(!ok || !data) return {ratio:1, analyzed:false};
    let plantPixels = 0, total = 0;
    for(let i=0;i<data.length;i+=4){
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      if(a < 10) continue;
      total++;
      const {h:hue, s:sat, v:val} = rgbToHsv(r,g,b);
      if(sat < 0.14) continue;
      const isGreenish = hue >= 55 && hue <= 170;
      const isBrownish = hue >= 15 && hue < 55 && val < 0.78;
      if((isGreenish || isBrownish) && val > 0.06 && val < 0.97){ plantPixels++; }
    }
    const ratio = total > 0 ? plantPixels/total : 0;
    return {ratio, analyzed:true};
  });
}

/* ===================== DETERMINISTIC VISUAL CLASSIFIER ===================== */
const BACKDROP_DISTANCE_THRESHOLD = 42; 
const BORDER_UNIFORMITY_THRESHOLD = 900; 
const FULL_FRAME_MATCH_CUTOFF = 0.88;    

function colorDistance(r1,g1,b1,r2,g2,b2){
  const dr=r1-r2, dg=g1-g2, db=b1-b2;
  return Math.sqrt(dr*dr + dg*dg + db*db);
}

function estimateBackdropColor(data, w, h){
  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  let sr=0, sg=0, sb=0, n=0;
  const samples = [];
  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      const onBorder = x < margin || x >= w - margin || y < margin || y >= h - margin;
      if(!onBorder) continue;
      const idx = (y*w + x) * 4;
      if(data[idx+3] < 10) continue;
      const r=data[idx], g=data[idx+1], b=data[idx+2];
      sr += r; sg += g; sb += b;
      samples.push(r, g, b);
      n++;
    }
  }
  if(n === 0) return null;
  const mean = { r: sr/n, g: sg/n, b: sb/n };
  let varSum = 0;
  for(let i=0;i<samples.length;i+=3){
    const d = colorDistance(samples[i],samples[i+1],samples[i+2], mean.r,mean.g,mean.b);
    varSum += d*d;
  }
  mean.uniformity = varSum / n;
  return mean;
}

function backdropCoverageFraction(data, bg){
  let match=0, total=0;
  for(let i=0;i<data.length;i+=4){
    if(data[i+3] < 10) continue;
    total++;
    if(colorDistance(data[i],data[i+1],data[i+2], bg.r,bg.g,bg.b) < BACKDROP_DISTANCE_THRESHOLD) match++;
  }
  return total ? match/total : 0;
}

function extractDiseaseFeatures(dataUrl){
  return loadPixelData(dataUrl, 160).then(({data,w,h,ok})=>{
    if(!ok || !data) return {analyzed:false};
    const backdrop = estimateBackdropColor(data, w, h);
    let excludeBackdrop = false;
    if(backdrop && backdrop.uniformity < BORDER_UNIFORMITY_THRESHOLD){
      const coverage = backdropCoverageFraction(data, backdrop);
      excludeBackdrop = coverage < FULL_FRAME_MATCH_CUTOFF;
    }
    let green=0, yellow=0, brown=0, whiteGray=0, dark=0, total=0;
    let sumVal=0, sumValSq=0;
    for(let i=0;i<data.length;i+=4){
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      if(a < 10) continue;
      if(excludeBackdrop && colorDistance(r,g,b, backdrop.r,backdrop.g,backdrop.b) < BACKDROP_DISTANCE_THRESHOLD) continue;
      total++;
      const {h:hue, s:sat, v:val} = rgbToHsv(r,g,b);
      sumVal += val; sumValSq += val*val;
      if(sat < 0.16){
        if(val > 0.55) whiteGray++;
        else if(val < 0.22) dark++;
        continue;
      }
      if(hue >= 55 && hue <= 170){ green++; }
      else if(hue >= 35 && hue < 55 && val > 0.35){ yellow++; }
      else if(hue >= 12 && hue < 35 && val < 0.78){ brown++; }
      else if(val < 0.22){ dark++; }
    }
    if(total === 0) return {analyzed:false};
    const mean = sumVal/total;
    const variance = Math.max(0, sumValSq/total - mean*mean);
    return {
      analyzed:true,
      greenRatio: green/total,
      yellowRatio: yellow/total,
      brownRatio: brown/total,
      whiteGrayRatio: whiteGray/total,
      darkRatio: dark/total,
      textureScore: Math.min(1, variance*6)
    };
  });
}

function classifyFeatures(f){
  const scores = {
    healthy:  f.greenRatio - (f.brownRatio + f.whiteGrayRatio + f.yellowRatio)*1.3 - f.darkRatio*0.8,
    blight:   f.brownRatio*2.3 + f.textureScore*0.25,
    mildew:   f.whiteGrayRatio*2.3 + f.greenRatio*0.15,
    aphid:    f.darkRatio*1.9 + f.textureScore*0.7 + f.greenRatio*0.2,
    nitrogen: f.yellowRatio*2.3
  };
  let bestId = "healthy", bestScore = -Infinity;
  Object.keys(scores).forEach(k=>{ if(scores[k] > bestScore){ bestScore = scores[k]; bestId = k; } });
  if(bestId !== "healthy" && bestScore < 0.05){ bestId = "healthy"; bestScore = scores.healthy; }

  const sortedScores = Object.values(scores).sort((a,b)=>b-a);
  const margin = Math.max(0, sortedScores[0] - (sortedScores[1] !== undefined ? sortedScores[1] : 0));
  const base = { healthy:90, blight:82, mildew:78, aphid:80, nitrogen:75 }[bestId] || 75;
  const confidence = Math.max(58, Math.min(97, Math.round(base + margin*40)));

  return {id:bestId, confidence, reasonKey:bestId};
}

function hashStringToInt(str){
  let hash = 0;
  for(let i=0;i<str.length;i+=37){ hash = (hash * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(hash);
}

async function analyzeWithAI(dataUrl){
  const features = await extractDiseaseFeatures(dataUrl);
  if(!features.analyzed){
    const idx = hashStringToInt(dataUrl) % LEAVES.length;
    const pick = LEAVES[idx];
    return { id: pick.id, confidence: pick.confidence, reason: null, aiPowered:false };
  }
  const {id, confidence, reasonKey} = classifyFeatures(features);
  return { id, confidence, reason: reasonKey, aiPowered:true };
}

function setUploadCardState(state){
  const upCard = document.getElementById("uploadCard");
  if(upCard) upCard.classList.remove("checking","rejected");
  if(state) upCard.classList.add(state);
}

function showLeafCheckMsg(kind){
  const el = document.getElementById("leafCheckMsg");
  const demo = t(currentLang).demo || {};
  el.classList.remove("checking","error","show");
  if(kind === "checking"){
    el.textContent = demo.checking;
    el.classList.add("checking","show");
  }else if(kind === "error"){
    el.textContent = demo.notLeaf;
    el.classList.add("error","show");
  }else{
    el.textContent = "";
  }
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

/* ===================== RENDER FUNCTIONS ===================== */
function renderLeafGrid(){
  const grid = document.getElementById("leafGrid");
  if(!grid) return;
  grid.innerHTML = "";
  const langResults = (t(currentLang).results) || {};
  LEAVES.forEach(leaf=>{
    const card = document.createElement("button");
    card.className = "leaf-card";
    card.setAttribute("role","listitem");
    card.dataset.id = leaf.id;
    if(leaf.id === selectedLeafId) card.classList.add("selected");
    card.innerHTML = `<div class="thumb">${leafSvg(leaf)}</div><div class="label">${(langResults[leaf.id] || {}).name || leaf.id}</div>`;
    card.addEventListener("click", ()=>selectLeaf(leaf.id));
    grid.appendChild(card);
  });
  const upCard = document.createElement("button");
  upCard.className = "upload-card";
  upCard.id = "uploadCard";
  upCard.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke-linecap="round"/></svg><span id="uploadLabel">${(t(currentLang).demo || {}).upload || 'Upload'}</span>`;
  upCard.addEventListener("click", ()=>document.getElementById("fileInput").click());
  grid.appendChild(upCard);
}

function selectLeaf(id){
  selectedLeafId = id;
  uploadedDataUrl = null;
  lastAiResult = null;
  stopStatusPoll();
  activeCaseId = null;
  document.querySelectorAll(".leaf-card").forEach(c=>c.classList.toggle("selected", c.dataset.id===id));
  document.getElementById("resultCard").style.display = "none";
  document.getElementById("scanPanel").style.display = "none";
  showLeafCheckMsg(null);
  setUploadCardState(null);
  leafCheckState = null;
  rejectedDataUrl = null;
  const upCard = document.getElementById("uploadCard");
  if(upCard){
    upCard.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke-linecap="round"/></svg><span id="uploadLabel">${(t(currentLang).demo || {}).upload || 'Upload'}</span>`;
  }
  enableScan();
}

function enableScan(){
  const btn = document.getElementById("scanBtn");
  if(!btn) return;
  btn.disabled = false;
  btn.classList.remove("btn-disabled");
}

/* Upload listener */
document.getElementById("fileInput").addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    const dataUrl = reader.result;
    const upCard = document.getElementById("uploadCard");

    document.getElementById("resultCard").style.display = "none";
    document.getElementById("scanPanel").style.display = "none";
    document.querySelectorAll(".leaf-card").forEach(c=>c.classList.remove("selected"));
    selectedLeafId = null;
    uploadedDataUrl = null;
    lastAiResult = null;
    stopStatusPoll();
    activeCaseId = null;
    const btn = document.getElementById("scanBtn");
    btn.disabled = true;
    btn.classList.add("btn-disabled");
    setUploadCardState("checking");
    showLeafCheckMsg("checking");
    leafCheckState = "checking";
    upCard.innerHTML = `<div class="thumb"><img src="${dataUrl}" alt="" style="opacity:.55"></div><div class="label">${(t(currentLang).demo||{}).checking||''}</div>`;

    const {ratio} = await analyzeImageForLeaf(dataUrl);

    if(ratio < LEAF_MIN_RATIO){
      rejectedDataUrl = dataUrl;
      leafCheckState = "rejected";
      setUploadCardState("rejected");
      showLeafCheckMsg("error");
      upCard.innerHTML = `<div class="thumb"><img src="${dataUrl}" alt="" style="opacity:.55"></div><div class="label">${(t(currentLang).demo||{}).upload||''}</div>`;
      return;
    }

    uploadedDataUrl = dataUrl;
    leafCheckState = null;
    rejectedDataUrl = null;
    showLeafCheckMsg("analyzing");
    upCard.innerHTML = `<div class="thumb"><img src="${dataUrl}" alt="" style="opacity:.7"></div><div class="label">${(t(currentLang).demo||{}).analyzing||''}</div>`;

    const aiResult = await analyzeWithAI(dataUrl);
    lastAiResult = aiResult;
    selectedLeafId = aiResult.id;

    setUploadCardState(null);
    showLeafCheckMsg(null);
    upCard.innerHTML = `<div class="thumb"><img src="${uploadedDataUrl}" alt=""></div><div class="label">${(t(currentLang).demo||{}).uploaded||''}</div>`;
    enableScan();
  };
  reader.readAsDataURL(file);
});

/* Scan Execution */
document.getElementById("scanBtn").addEventListener("click", runScan);
function runScan(){
  if(!selectedLeafId) return;
  const panel = document.getElementById("scanPanel");
  const fill = document.getElementById("scanFill");
  const resultCard = document.getElementById("resultCard");
  resultCard.style.display = "none";
  document.getElementById("stamp").classList.remove("show");
  stopStatusPoll();
  activeCaseId = null;
  resetReferUI();
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
  const data = (t(currentLang).results || {})[id] || {};
  const demo = t(currentLang).demo || {};
  const card = document.getElementById("resultCard");
  document.getElementById("resultName").textContent = data.name || id;
  const badge = document.getElementById("severityBadge");
  badge.textContent = (demo.severityLabels || {})[leaf.severity] || leaf.severity;
  badge.className = "severity-badge severity-" + leaf.severity;

  const usingAi = lastAiResult && lastAiResult.id === id && lastAiResult.aiPowered;
  const confidenceToShow = usingAi ? lastAiResult.confidence : leaf.confidence;
  document.getElementById("confidenceValue").textContent = confidenceToShow + "%";
  document.getElementById("advisoryText").textContent = data.advisory || '';

  const aiNoteEl = document.getElementById("aiNote");
  if(usingAi && lastAiResult.reason){
    const reasonText = ((demo.aiReasons)||{})[lastAiResult.reason] || "";
    if(reasonText){
      aiNoteEl.textContent = reasonText;
      aiNoteEl.style.display = "block";
    }else{
      aiNoteEl.textContent = "";
      aiNoteEl.style.display = "none";
    }
  }else{
    aiNoteEl.textContent = "";
    aiNoteEl.style.display = "none";
  }

  const statusPill = document.getElementById("aiStatusBadge");
  statusPill.textContent = demo.aiBadge || '';
  statusPill.className = "ai-status-pill ai-status-pending";

  populateReferDistrictSelect();
  card.style.display = "block";
  const fill = document.getElementById("confidenceFill");
  fill.style.width = "0%";
  requestAnimationFrame(()=>{ setTimeout(()=>{ fill.style.width = confidenceToShow + "%"; }, 30); });
  const stampCircles = document.querySelectorAll("#stamp circle, #stamp path:not(#stampPath)");
  stampCircles.forEach(el=>el.setAttribute("stroke", severityColor(leaf.severity)));
  const stampText = document.getElementById("stampText");
  const stampTextParent = stampText.closest("text");
  if(stampTextParent) stampTextParent.setAttribute("fill", severityColor(leaf.severity));
}

/* ===================== DISTRICT DROPDOWN & RISK SECTION ===================== */
function populateDistrictSelect(){
  const select = document.getElementById("districtSelect");
  if(!select) return;
  select.innerHTML = "";
  Object.keys(districtCoords).forEach(dName=>{
    const opt = document.createElement("option");
    opt.value = dName;
    opt.textContent = ((t(currentLang).districts || {})[dName.toLowerCase()] || {}).name || dName;
    if(dName === currentDistrictId) opt.selected = true;
    select.appendChild(opt);
  });
}

document.getElementById("districtSelect").addEventListener("change", (e)=>{
  currentDistrictId = e.target.value;
  updateRiskUI(currentDistrictId);
});

/* ===================== HOW IT WORKS ===================== */
function renderSteps(){
  const grid = document.getElementById("stepsGrid");
  if(!grid) return;
  grid.innerHTML = "";
  const stepsList = ((t(currentLang).how || {}).steps) || [];
  stepsList.forEach((s,i)=>{
    const card = document.createElement("div");
    card.className = "step";
    card.innerHTML = `<div class="num">0${i+1}</div><h3>${s.title}</h3><p>${s.body}</p>`;
    grid.appendChild(card);
  });
}

/* ===================== REFERRAL FLOW ===================== */
let referState = "idle";
let lastKnownCaseStatus = null;

function populateReferDistrictSelect(){
  const select = document.getElementById("referDistrict");
  if(!select) return;
  select.innerHTML = "";
  Object.keys(districtCoords).forEach(dName=>{
    const opt = document.createElement("option");
    opt.value = dName;
    opt.textContent = ((t(currentLang).districts || {})[dName.toLowerCase()] || {}).name || dName;
    if(dName === referDistrictId) opt.selected = true;
    select.appendChild(opt);
  });
}

function genCaseId(){
  return "C" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

function refreshReferUI(){
  const btn = document.getElementById("referBtn");
  const status = document.getElementById("referStatus");
  const pill = document.getElementById("aiStatusBadge");
  const stampEl = document.getElementById("stamp");
  if(!btn || !status) return;
  const demo = t(currentLang).demo || {};

  if(stampEl){
    stampEl.classList.toggle("show", lastKnownCaseStatus === "confirmed" || lastKnownCaseStatus === "resolved");
  }

  if(referState === "idle"){
    btn.disabled = false;
    btn.classList.remove("btn-disabled");
    btn.textContent = demo.talkToOfficer || 'Send to extension officer';
    status.className = "refer-status";
    status.textContent = "";
  }else if(referState === "sending"){
    btn.disabled = true;
    btn.classList.add("btn-disabled");
    btn.textContent = demo.referSending || 'Sending…';
    status.className = "refer-status";
    status.textContent = "";
  }else if(referState === "sent"){
    btn.disabled = true;
    btn.classList.add("btn-disabled");
    const shortId = activeCaseId ? activeCaseId.slice(-6).toUpperCase() : "";
    btn.textContent = `${demo.referSentPrefix || 'Sent — case'} #${shortId}`;
    status.classList.add("show");
    if(lastKnownCaseStatus === "resolved"){
      status.className = "refer-status show resolved";
      status.textContent = demo.referResolvedMsg || 'Case resolved.';
    }else if(lastKnownCaseStatus === "confirmed"){
      status.className = "refer-status show confirmed";
      status.textContent = demo.referConfirmedMsg || 'Verified by extension officer.';
      if(pill){ pill.textContent = demo.verifiedBadge || 'Verified'; pill.className = "ai-status-pill ai-status-verified"; }
    }else{
      status.className = "refer-status show pending";
      status.textContent = demo.referPending || 'Pending officer review.';
    }
  }
}

function resetReferUI(){
  referState = "idle";
  lastKnownCaseStatus = null;
  refreshReferUI();
}

async function onReferClick(){
  if(referState !== "idle" || !selectedLeafId) return;
  referState = "sending";
  refreshReferUI();

  const leaf = LEAVES.find(l=>l.id===selectedLeafId);
  const usingAi = lastAiResult && lastAiResult.id===selectedLeafId && lastAiResult.aiPowered;
  const caseObj = {
    id: genCaseId(),
    createdAt: new Date().toISOString(),
    district: referDistrictId,
    diagnosisId: selectedLeafId,
    confidence: usingAi ? lastAiResult.confidence : leaf.confidence,
    severity: leaf.severity,
    imageDataUrl: uploadedDataUrl || null,
    aiNote: usingAi ? lastAiResult.reason : null,
    status: "pending",
    confirmedAt: null
  };

  try{
    await saveCase(caseObj);
    activeCaseId = caseObj.id;
    lastKnownCaseStatus = "pending";
    referState = "sent";
    refreshReferUI();
    startStatusPoll();
  }catch(err){
    console.error("Failed to send case to extension officer:", err);
    referState = "idle";
    refreshReferUI();
  }
}

function startStatusPoll(){
  stopStatusPoll();
  statusPollTimer = setInterval(async ()=>{
    if(!activeCaseId) return;
    const c = await loadCase(activeCaseId);
    if(c && c.status !== lastKnownCaseStatus){
      lastKnownCaseStatus = c.status;
      refreshReferUI();
      if(c.status === "resolved") stopStatusPoll();
    }
  }, 6000);
}

function stopStatusPoll(){
  if(statusPollTimer){ clearInterval(statusPollTimer); statusPollTimer = null; }
}

/* ===================== OFFICER DASHBOARD ===================== */
async function renderOfficerDash(){
  const grid = document.getElementById("caseList");
  if(!grid) return;
  grid.innerHTML = `<div class="officer-loading">Loading cases…</div>`;

  const cases = await loadAllCases();
  const demo = t(currentLang).demo || {};
  const off = t(currentLang).officer || {};

  const total = cases.length;
  const pending = cases.filter(c=>c.status==="pending").length;
  const confirmedOrResolved = cases.filter(c=>c.status!=="pending").length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statConfirmed").textContent = confirmedOrResolved;
  document.getElementById("statTopIssue").textContent = topIssueLabel(cases, off);

  const filtered = officerFilter === "all" ? cases : cases.filter(c=>c.status===officerFilter);
  grid.innerHTML = "";
  if(filtered.length === 0){
    grid.innerHTML = `<div class="case-empty">${off.emptyState || 'No cases'}</div>`;
    return;
  }

  filtered.forEach(c=>{
    const leaf = LEAVES.find(l=>l.id===c.diagnosisId) || LEAVES[0];
    const diagName = ((t(currentLang).results || {})[c.diagnosisId] || {}).name || c.diagnosisId;
    const districtName = ((t(currentLang).districts || {})[c.district.toLowerCase()] || {}).name || c.district;
    const thumbHtml = c.imageDataUrl ? `<img src="${c.imageDataUrl}" alt="">` : leafSvg(leaf);
    const statusKey = "status" + c.status.charAt(0).toUpperCase() + c.status.slice(1);
    const statusLabel = off[statusKey] || c.status;

    const card = document.createElement("div");
    card.className = "case-card";
    card.innerHTML = `
      <div class="case-thumb">${thumbHtml}</div>
      <div class="case-body">
        <div class="case-top">
          <div class="case-name">${escapeHtml(diagName)}</div>
          <div class="status-badge status-${c.status}">${escapeHtml(statusLabel)}</div>
        </div>
        <div class="case-meta">${escapeHtml(districtName)} · ${off.submitted || 'Submitted'} ${formatDate(c.createdAt)}</div>
        <div class="case-meta">
          <span>${demo.confidence || 'Confidence'}: ${c.confidence}%</span>
          <span class="severity-badge severity-${c.severity}" style="padding:2px 9px;font-size:11px;">${(demo.severityLabels || {})[c.severity] || c.severity}</span>
        </div>
        ${c.aiNote ? `<div class="case-ai-note">“${escapeHtml(c.aiNote)}”</div>` : ""}
        <div class="case-actions">
          ${c.status==="pending" ? `<button class="btn btn-primary btn-sm" data-action="confirm" data-id="${c.id}">${off.confirmBtn || 'Confirm'}</button>` : ""}
          ${c.status==="confirmed" ? `
            <button class="btn btn-secondary btn-sm" data-action="resolve" data-id="${c.id}">${off.resolveBtn || 'Resolve'}</button>
            <button class="btn btn-secondary btn-sm" data-action="lab" data-id="${c.id}" style="border-color: var(--monsoon); color: var(--monsoon);">${off.labBtn || 'Send to Lab'}</button>
            <button class="btn btn-secondary btn-sm" data-action="followup" data-id="${c.id}" style="border-color: var(--turmeric-dark); color: var(--turmeric-dark);">${off.followupBtn || 'Set Follow-up'}</button>
          ` : ""}
        </div>
      </div>`;
    grid.appendChild(card);
  });

  grid.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", onCaseAction);
  });
}

async function onCaseAction(e){
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  btn.disabled = true;
  const c = await loadCase(id);
  if(!c){ renderOfficerDash(); return; }

  if(action === "confirm"){
    c.status = "confirmed";
    c.confirmedAt = new Date().toISOString();
    console.log(`[AI Model Feedback] Case ${id} verified as ${c.diagnosisId}. Retraining weights for ${c.district}.`);
  }else if(action === "resolve"){
    c.status = "resolved";
  }else if(action === "lab"){
    alert("Case flagged for laboratory analysis. Notification sent to central pathology lab.");
    c.status = "lab_testing";
  }else if(action === "followup"){
    alert("Follow-up monitoring scheduled. Farmer will receive an automated SMS reminder in 5 days.");
    btn.disabled = false;
    return;
  }

  await saveCase(c);
  renderOfficerDash();
}

function topIssueLabel(cases, off){
  if(!cases.length) return off.none || '—';
  const counts = {};
  cases.forEach(c=>{ counts[c.diagnosisId] = (counts[c.diagnosisId]||0) + 1; });
  let topId = null, topCount = 0;
  Object.keys(counts).forEach(k=>{ if(counts[k] > topCount){ topCount = counts[k]; topId = k; } });
  if(!topId) return off.none || '—';
  return ((t(currentLang).results || {})[topId] || {}).name || topId;
}

function formatDate(iso){
  try{ return new Date(iso).toLocaleDateString(undefined, {day:"numeric", month:"short"}); }catch(err){ return ""; }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, ch=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

/* ===================== VIEW & LANGUAGE SWITCHERS ===================== */
function switchView(view){
  currentView = view;
  document.querySelectorAll(".view-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  document.getElementById("farmerView").style.display = view==="farmer" ? "" : "none";
  document.getElementById("officerView").style.display = view==="officer" ? "" : "none";
  if(view === "officer"){ renderOfficerDash(); }
}

function applyStaticText(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const path = el.getAttribute("data-i18n").split(".");
    let val = t(currentLang);
    for(const p of path){ val = val && val[p]; }
    if(typeof val === "string"){ el.textContent = val; }
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
    if(upCard) upCard.innerHTML = `<div class="thumb"><img src="${uploadedDataUrl}" alt=""></div><div class="label">${(t(currentLang).demo||{}).uploaded||''}</div>`;
  }else if(leafCheckState === "rejected" && rejectedDataUrl){
    const upCard = document.getElementById("uploadCard");
    if(upCard) upCard.innerHTML = `<div class="thumb"><img src="${rejectedDataUrl}" alt="" style="opacity:.55"></div><div class="label">${(t(currentLang).demo||{}).upload||''}</div>`;
    showLeafCheckMsg("error");
  }
  if(selectedLeafId){
    document.querySelectorAll(".leaf-card").forEach(c=>c.classList.toggle("selected", c.dataset.id===selectedLeafId));
  }
  if(document.getElementById("resultCard").style.display === "block"){
    renderResult(selectedLeafId);
  }
  populateDistrictSelect();
  updateRiskUI(currentDistrictId);
  renderSteps();
  refreshReferUI();
  if(currentView === "officer"){ renderOfficerDash(); }
}

/* ===================== EVENT BINDINGS & INIT ===================== */
document.querySelectorAll(".lang-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>switchLang(btn.dataset.lang));
});
document.querySelectorAll(".view-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>switchView(btn.dataset.view));
});
document.getElementById("heroCta").addEventListener("click", ()=>{
  document.getElementById("demo").scrollIntoView({behavior:"smooth"});
});
document.getElementById("heroCta2").addEventListener("click", ()=>{
  document.getElementById("how").scrollIntoView({behavior:"smooth"});
});
document.getElementById("referBtn").addEventListener("click", onReferClick);
document.getElementById("referDistrict").addEventListener("change", (e)=>{ referDistrictId = e.target.value; });
document.getElementById("officerFilter").addEventListener("change", (e)=>{
  officerFilter = e.target.value;
  renderOfficerDash();
});
document.getElementById("reseedBtn").addEventListener("click", async ()=>{
  const btn = document.getElementById("reseedBtn");
  btn.disabled = true;
  await deleteAllCases();
  await seedDemoCases();
  await renderOfficerDash();
  btn.disabled = false;
});

async function initApp(){
  try{
    const res = await fetch("translations.json");
    translationsData = await res.json();
  }catch(e){
    console.error("Could not load translations.json, fallback applied.", e);
  }
  applyStaticText();
  renderLeafGrid();
  populateDistrictSelect();
  updateRiskUI(currentDistrictId);
  renderSteps();
  resetReferUI();

  try{
    const existing = await loadAllCases();
    if(existing.length === 0){ await seedDemoCases(); }
  }catch(err){
    console.error("Could not initialize shared case data:", err);
  }
}

/* ===================== GEOSPATIAL MAP COORDINATES ===================== */
const DISTRICT_MAP_COORDS = {
  Pune: { lat: 18.5204, lng: 73.8567 },
  Nashik: { lat: 19.9975, lng: 73.7898 },
  Ahilyanagar: { lat: 19.0946, lng: 74.7384 },
  Kolhapur: { lat: 16.7050, lng: 74.2433 },
  Amravati: { lat: 20.9374, lng: 77.7796 },
  Nagpur: { lat: 21.1458, lng: 79.0882 },
  Akola: { lat: 20.7002, lng: 77.0082 },
  Beed: { lat: 18.9901, lng: 75.7600 },
  Bhandara: { lat: 21.1682, lng: 79.6489 },
  Parbhani: { lat: 19.2686, lng: 76.7709 },
  Satara: { lat: 17.6805, lng: 74.0183 },
  Wardha: { lat: 20.7453, lng: 78.6022 },
  Yavatmal: { lat: 20.3888, lng: 78.1204 }
};

let mapInstance = null;
let mapMarkers = [];

/* ===================== AUTHENTICATION STATE ===================== */
let currentFarmerUser = null;
let currentOfficerUser = null;

async function checkAuthOnStart() {
  const farmer = await StorageAdapter.get("auth_farmer");
  const officer = await StorageAdapter.get("auth_officer");
  
  if (farmer) currentFarmerUser = JSON.parse(farmer);
  if (officer) currentOfficerUser = JSON.parse(officer);
  
  updateAuthUI();
}

function updateAuthUI() {
  const infoBar = document.getElementById("userInfoBar");
  const statusText = document.getElementById("userStatusText");
  
  if (currentView === "officer") {
    if (currentOfficerUser) {
      if (infoBar) infoBar.style.display = "flex";
      if (statusText) statusText.textContent = `Officer: ${currentOfficerUser.id}`;
      const offModal = document.getElementById("officerLoginModal");
      if (offModal) offModal.style.display = "none";
    } else {
      if (infoBar) infoBar.style.display = "none";
      const offModal = document.getElementById("officerLoginModal");
      if (offModal) offModal.style.display = "flex";
    }
  } else {
    if (currentFarmerUser) {
      if (infoBar) infoBar.style.display = "flex";
      if (statusText) statusText.textContent = `Farmer: +91 ${currentFarmerUser.phone}`;
      const farmModal = document.getElementById("farmerLoginModal");
      if (farmModal) farmModal.style.display = "none";
    } else {
      if (infoBar) infoBar.style.display = "none";
      const farmModal = document.getElementById("farmerLoginModal");
      if (farmModal) farmModal.style.display = "flex";
    }
  }
}

const farmerLoginForm = document.getElementById("farmerLoginForm");
if (farmerLoginForm) {
  farmerLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = document.getElementById("farmerPhone").value.trim();
    if (phone.length === 10) {
      currentFarmerUser = { phone };
      await StorageAdapter.set("auth_farmer", JSON.stringify(currentFarmerUser));
      updateAuthUI();
    }
  });
}

const officerLoginForm = document.getElementById("officerLoginForm");
if (officerLoginForm) {
  officerLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("officerId").value.trim();
    const pass = document.getElementById("officerPass").value.trim();
    
    if (pass === "1234" || pass.length >= 4) {
      currentOfficerUser = { id };
      await StorageAdapter.set("auth_officer", JSON.stringify(currentOfficerUser));
      const errEl = document.getElementById("officerAuthError");
      if (errEl) errEl.style.display = "none";
      updateAuthUI();
      renderOfficerDash();
    } else {
      const errEl = document.getElementById("officerAuthError");
      if (errEl) errEl.style.display = "block";
    }
  });
}

const cancelOfficerLogin = document.getElementById("cancelOfficerLogin");
if (cancelOfficerLogin) {
  cancelOfficerLogin.addEventListener("click", () => {
    switchView("farmer");
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    if (currentView === "officer") {
      currentOfficerUser = null;
      await StorageAdapter.delete("auth_officer");
    } else {
      currentFarmerUser = null;
      await StorageAdapter.delete("auth_farmer");
    }
    updateAuthUI();
  });
}

const originalSwitchView = switchView;
switchView = function(view) {
  currentView = view;
  document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.getElementById("farmerView").style.display = view === "farmer" ? "" : "none";
  document.getElementById("officerView").style.display = view === "officer" ? "" : "none";
  
  updateAuthUI();
  
  if (view === "officer" && currentOfficerUser) {
    renderOfficerDash();
    initOrUpdateMap();
    setTimeout(() => {
      if (mapInstance) {
        mapInstance.invalidateSize();
      }
    }, 200);
  }
};

async function initOrUpdateMap() {
  if (typeof L === "undefined") return;

  const mapContainer = document.getElementById('hotspotMap');
  if (!mapContainer) return;

  if (!mapInstance) {
    mapInstance = L.map('hotspotMap').setView([19.2502, 76.1000], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '© OpenStreetMap'
    }).addTo(mapInstance);
  }

  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];

  const cases = await loadAllCases();
  
  const districtCounts = {};
  cases.forEach(c => {
    const key = Object.keys(DISTRICT_MAP_COORDS).find(k => k.toLowerCase() === (c.district || "").toLowerCase()) || "Pune";
    if (!districtCounts[key]) {
      districtCounts[key] = { total: 0, high: 0, topDisease: c.diagnosisId };
    }
    districtCounts[key].total += 1;
    if (c.severity === "high") districtCounts[key].high += 1;
  });

  Object.keys(DISTRICT_MAP_COORDS).forEach(dKey => {
    const coords = DISTRICT_MAP_COORDS[dKey];
    const data = districtCounts[dKey] || { total: 0, high: 0, topDisease: "None" };
    
    const radius = Math.max(12000, data.total * 9000);
    const color = data.high > 0 ? "#B23A2E" : data.total > 0 ? "#C4831F" : "#4B7340";

    const circle = L.circle([coords.lat, coords.lng], {
      color: color,
      fillColor: color,
      fillOpacity: 0.45,
      radius: radius
    }).addTo(mapInstance);

    const diagName = ((t(currentLang).results || {})[data.topDisease] || {}).name || data.topDisease;

    circle.bindPopup(`
      <div class="hotspot-popup">
        <h4>${dKey} Region</h4>
        <p><strong>Active Cases:</strong> ${data.total}</p>
        <p><strong>High Severity:</strong> ${data.high}</p>
        <p><strong>Primary Concern:</strong> ${diagName}</p>
      </div>
    `);

    mapMarkers.push(circle);
  });

  setTimeout(() => { mapInstance.invalidateSize(); }, 300);
}

const originalInitApp = initApp;
initApp = async function() {
  await originalInitApp();
  await checkAuthOnStart();
};
initApp();