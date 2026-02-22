import { defaultSpanProfile, normalizeSpanProfile, generateSpanStimulus, evaluateSpanAttempt, updateSpanProgress, pushSpanRollingResult } from "./visual-span.js";
import { defaultAdaptiveProfile, normalizeAdaptiveProfile, updateGlickoLite, targetItemRating, selectCandidate, pushRollingResult, rollingAccuracy } from "./adaptive-glicko.js";
// SpeedRead Trainer V2 (no build tools, Brave-friendly)
// LocalStorage for data + optional Sync file (File System Access API on Chromium/Brave)

const APP_KEY = "speedread_trainer_v2_state";
const APP_VERSION = 5;

const EXERCISES = {
  reader: { id: "reader", name: "Lettura veloce" },
  span: { id: "span", name: "Campo visivo" },
  fixation: { id: "fixation", name: "Punti di fissità" },
};

const OFFLINE_TEXTS = {
  it: [
    "La lettura è un allenamento. Quando aumenti la velocità, devi proteggere anche la comprensione: meglio piccoli passi costanti che sprint casuali.",
    "L'attenzione segue gli occhi. Se impari a fissare punti regolari e a ridurre le regressioni, aumenti la fluidità senza forzare.",
    "La difficoltà non è solo la lunghezza: frasi più dense e concetti più astratti richiedono un ritmo diverso e una pausa mentale migliore."
  ],
  en: [
    "Reading speed is trainable. As you get faster, protect comprehension: steady small steps beat random sprints.",
    "Attention follows your eyes. If you reduce regressions and stabilize fixations, fluency improves without forcing.",
    "Difficulty is not only length: denser sentences and abstract ideas need a different pacing and cleaner mental pauses."
  ],
};

const STOPWORDS = {
  it: new Set(["il","lo","la","i","gli","le","un","uno","una","di","a","da","in","su","per","tra","fra","e","o","che","del","della","dei","delle","al","allo","alla","ai","agli","alle","nel","nello","nella","nei","nelle","con","non","più","come","se"]),
  en: new Set(["the","a","an","of","to","in","on","for","and","or","that","with","as","at","by","from","is","are","was","were","be","been","this","these","those","it","its","not","more","than"])
};

function defaultUserSettings(){
  return {
    reader: { lang: "it", mode: "rsvp", wpm: 350, chunk: 3, minWords: 180, source:"wiki", customText:"", profile: defaultAdaptiveProfile({ exposureMs: 250, stimulusSize: 8, complexity: 1.0 }) },
    span: { ms: 800, font:110, profile: defaultSpanProfile() },
    fixation: { ms: 250, laps: 2, cols: 3, rows: 10, mode: "dots", segLen: 20, lang:"it", source:"wiki", customText:"", profile: defaultAdaptiveProfile({ holdMs: 600, targetSizePx: 24, distractorCount: 2, amplitude: 1.0, motionFlag: 0 }) },
  };
}

// ---------- utilities ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function nowIso() { return new Date().toISOString(); }

function fmtTime(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(s/60);
  const r = s%60;
  return `${m}:${String(r).padStart(2,"0")}`;
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

function uid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function safeParseJson(s){
  try { return JSON.parse(s); } catch { return null; }
}

function ensureObject(value, fallback){
  return (value && typeof value === "object" && !Array.isArray(value)) ? value : fallback;
}

function wordsOf(text){
  return text
    .replace(/\s+/g, " ")
    .replace(/[“”«»]/g, "\"")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function median(nums){
  const a = nums.filter(n=>Number.isFinite(n)).slice().sort((x,y)=>x-y);
  if(!a.length) return null;
  const mid = Math.floor(a.length/2);
  return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
}

// ---------- storage ----------
function defaultState(){
  const userId = uid();
  return {
    version: APP_VERSION,
    activeUserId: userId,
    users: [
      {
        id: userId,
        name: "Luca",
        createdAt: nowIso(),
        sessions: [],
        settings: defaultUserSettings()
      }
    ],
    textCache: { it: null, en: null },
    ui: { pacerFont: 18, debug: false },
  };
}

function migrateState(st){
  if(!st || typeof st !== "object") return defaultState();

  // Versioning
  if(!st.version) st.version = 1;
  if(!st.users || !Array.isArray(st.users) || st.users.length===0){
    return defaultState();
  }
  if(!st.activeUserId || !st.users.some(u=>u.id===st.activeUserId)){
    st.activeUserId = st.users[0].id;
  }
  if(!st.textCache) st.textCache = { it:null, en:null };
  if(!st.ui) st.ui = { pacerFont: 18, debug: false };

  const defaults = defaultUserSettings();
  for(const u of st.users){
    if(!u.sessions) u.sessions = [];
    if(!u.settings || typeof u.settings !== "object") u.settings = JSON.parse(JSON.stringify(defaults));
    u.settings.reader = ensureObject(u.settings.reader, JSON.parse(JSON.stringify(defaults.reader)));
    u.settings.span = ensureObject(u.settings.span, JSON.parse(JSON.stringify(defaults.span)));
    u.settings.fixation = ensureObject(u.settings.fixation, JSON.parse(JSON.stringify(defaults.fixation)));
    if(typeof u.settings.reader.customText !== "string") u.settings.reader.customText = "";
    if(typeof u.settings.fixation.customText !== "string") u.settings.fixation.customText = "";
    u.settings.reader.profile = normalizeAdaptiveProfile(u.settings.reader.profile, { exposureMs: 250, stimulusSize: 8, complexity: 1.0 });
    u.settings.fixation.profile = normalizeAdaptiveProfile(u.settings.fixation.profile, { holdMs: 600, targetSizePx: 24, distractorCount: 2, amplitude: 1.0, motionFlag: 0 });
    if(!u.settings.span.profile){
      u.settings.span.profile = defaultSpanProfile();
      if(Number.isFinite(u.settings.span.len)) u.settings.span.profile.currentLength = clamp(Number(u.settings.span.len), 4, 14);
    }
    u.settings.span.profile = normalizeSpanProfile(u.settings.span.profile);

    // Fix the bug that caused: (a.startedAt||"").localeCompare is not a function
    // Ensure startedAt/endedAt are ISO strings (or null), not numbers/objects.
    for(const s of u.sessions){
      if(s.startedAt && typeof s.startedAt !== "string"){
        const t = typeof s.startedAt === "number" ? s.startedAt : Date.parse(s.startedAt);
        s.startedAt = new Date(Number.isFinite(t)?t:Date.now()).toISOString();
      }
      if(s.endedAt && typeof s.endedAt !== "string"){
        const t = typeof s.endedAt === "number" ? s.endedAt : Date.parse(s.endedAt);
        s.endedAt = new Date(Number.isFinite(t)?t:Date.now()).toISOString();
      }
    }
  }

  st.version = APP_VERSION;
  return st;
}

function loadState(){
  const raw = localStorage.getItem(APP_KEY);
  const parsed = raw ? safeParseJson(raw) : null;
  return migrateState(parsed);
}

let STATE = loadState();
let SAVE_DEBOUNCE = null;

function saveState(){
  localStorage.setItem(APP_KEY, JSON.stringify(STATE));
  if(SAVE_DEBOUNCE) clearTimeout(SAVE_DEBOUNCE);
  SAVE_DEBOUNCE = setTimeout(()=> syncWriteIfConnected().catch(()=>{}), 350);
}

// ---------- sync (File System Access API + IndexedDB handle persistence) ----------
const IDB_DB = "speedread_v2_idb";
const IDB_STORE = "kv";

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDel(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const SYNC = {
  fileHandle: null,
  connected: false,
  lastWriteAt: null,
};

async function syncInit(){
  // recover handle if any
  try{
    const h = await idbGet("syncFileHandle");
    if(h){
      SYNC.fileHandle = h;
      const perm = await h.queryPermission?.({mode:"readwrite"});
      SYNC.connected = (perm === "granted");
    }
  }catch{}
  renderSyncStatus();
}

async function syncConnect(){
  if(!window.showSaveFilePicker){
    alert("Il browser non supporta File System Access API. Usa Esporta/Importa dal Dashboard.");
    return;
  }
  const h = await showSaveFilePicker({
    suggestedName: "speedread-sync.json",
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
  });
  const perm = await h.requestPermission({mode:"readwrite"});
  if(perm !== "granted"){
    alert("Permesso non concesso.");
    return;
  }
  SYNC.fileHandle = h;
  SYNC.connected = true;
  await idbSet("syncFileHandle", h);
  await syncWriteIfConnected(true);
  renderSyncStatus();
}

async function syncDisconnect(){
  SYNC.fileHandle = null;
  SYNC.connected = false;
  await idbDel("syncFileHandle");
  renderSyncStatus();
}

async function syncWriteIfConnected(force=false){
  if(!SYNC.connected || !SYNC.fileHandle) return;
  const now = Date.now();
  if(!force && SYNC.lastWriteAt && (now - SYNC.lastWriteAt) < 800) return;
  const writable = await SYNC.fileHandle.createWritable();
  await writable.write(JSON.stringify(STATE, null, 2));
  await writable.close();
  SYNC.lastWriteAt = now;
  $("#syncStatus").textContent = `Sync: salvato ${new Date().toLocaleString()}`;
}

async function syncPull(){
  if(!SYNC.fileHandle) return;
  const perm = await SYNC.fileHandle.requestPermission?.({mode:"readwrite"});
  if(perm !== "granted"){
    alert("Permesso non concesso.");
    return;
  }
  const file = await SYNC.fileHandle.getFile();
  const txt = await file.text();
  const parsed = safeParseJson(txt);
  if(!parsed){
    alert("File non valido.");
    return;
  }
  STATE = migrateState(parsed);
  saveState();
  rerenderAll();
  $("#syncStatus").textContent = `Sync: importato ${new Date().toLocaleString()}`;
}

// ---------- wikipedia fetch ----------
async function fetchWikipediaExtract(lang, minWords){
  const host = lang === "en" ? "en.wikipedia.org" : "it.wikipedia.org";
  const url = `https://${host}/w/api.php?origin=*&format=json&action=query&generator=random&grnnamespace=0&grnlimit=8&prop=extracts&explaintext=1&exsectionformat=plain&exchars=12000`;
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("Wikipedia fetch failed");
  const j = await r.json();

  const pages = Object.values(j?.query?.pages || {});
  if(!pages.length) throw new Error("Wikipedia empty");

  const candidates = pages
    .map(p=>{
      const title = p?.title || "Wikipedia";
      const textRaw = (p?.extract || "").replace(/\n{2,}/g, "\n").trim();
      const w = wordsOf(textRaw);
      const sourceUrl = `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g,"_"))}`;
      return { title, text: textRaw, sourceUrl, wordCount: w.length };
    })
    .filter(x=>x.wordCount >= minWords);

  if(!candidates.length) throw new Error("Too short");
  return pick(candidates);
}

async function getAdaptiveText(lang, minWords, source, customText=""){
  if(source === "custom") {
    const text = (customText || "").trim();
    const wordCount = wordsOf(text).length;
    if(wordCount < 40) throw new Error("Incolla almeno 40 parole nel testo personalizzato.");
    return { title: "Testo personalizzato", text, sourceUrl: null, wordCount };
  }
  if(source === "offline"){
    const t = OFFLINE_TEXTS[lang] || OFFLINE_TEXTS.it;
    const text = t.join("\n\n");
    return { title: "Offline", text, sourceUrl: null, wordCount: wordsOf(text).length };
  }

  // Try Wikipedia multiple times to guarantee length
  const tries = 8;
  let lastErr = null;
  for(let i=0;i<tries;i++){
    try{
      const res = await fetchWikipediaExtract(lang, minWords);
      return res;
    }catch(e){
      lastErr = e;
    }
  }
  // fallback
  console.warn("Wikipedia fallback", lastErr);
  const t = OFFLINE_TEXTS[lang] || OFFLINE_TEXTS.it;
  const text = t.join("\n\n");
  return { title: "Offline (fallback)", text, sourceUrl: null, wordCount: wordsOf(text).length };
}

// ---------- UI state helpers ----------
function getActiveUser(){
  return STATE.users.find(u=>u.id===STATE.activeUserId) || STATE.users[0];
}

function setActiveUser(userId){
  STATE.activeUserId = userId;
  saveState();
  rerenderAll();
}

function addUser(name){
  const clean = (name || "").trim();
  if(!clean) return;
  const u = {
    id: uid(),
    name: clean,
    createdAt: nowIso(),
    sessions: [],
    settings: JSON.parse(JSON.stringify(defaultState().users[0].settings)),
  };
  STATE.users.push(u);
  STATE.activeUserId = u.id;
  saveState();
  rerenderAll();
}

function wipeUser(userId){
  const u = STATE.users.find(x=>x.id===userId);
  if(!u) return;
  u.sessions = [];
  saveState();
  rerenderAll();
}

function wipeAll(){
  STATE = defaultState();
  saveState();
  rerenderAll();
}

// ---------- sessions/statistics ----------
function addSessionToUser(session){
  const u = getActiveUser();
  u.sessions.push(session);
  // Sort chronologically using numeric compare (not localeCompare)
  u.sessions.sort((a,b)=> (Date.parse(a.startedAt||"")||0) - (Date.parse(b.startedAt||"")||0));
  saveState();
}

function sessionsByExercise(user, exId){
  return user.sessions.filter(s=>s.exerciseId===exId).slice().sort((a,b)=> (Date.parse(a.startedAt)||0) - (Date.parse(b.startedAt)||0));
}

function computeReaderLevel(user){
  const ss = sessionsByExercise(user, "reader");
  const recent = ss.slice(-8);
  const wpm = recent.map(s=>s.metrics?.wpm).filter(Number.isFinite);
  const acc = recent.map(s=>s.metrics?.accuracy).filter(Number.isFinite);
  const m = median(wpm);
  if(!m) return { level: 1, baseWpm: 300, minWords: 180 };
  const accFactor = acc.length ? clamp((median(acc)-0.65)/0.3, 0, 1) : 0.5;
  const perf = m * (0.75 + accFactor*0.5);
  const level = clamp(Math.floor(perf / 170) + 1, 1, 10);
  const baseWpm = clamp(Math.round((m + level*18)/10)*10, 180, 1200);
  const minWords = clamp(140 + level*95, 140, 1500);
  return { level, baseWpm, minWords };
}

function computeSpanLevel(user){
  const profile = normalizeSpanProfile(user.settings?.span?.profile || {});
  return {
    level: profile.currentStage,
    ms: user.settings?.span?.ms ?? 800,
    len: profile.currentLength,
  };
}

function computeFixLevel(user){
  const ss = sessionsByExercise(user, "fixation").slice(-8);
  const completed = ss.filter(s=>s.metrics?.accuracy===1).length;
  const duration = ss.map(s=>s.metrics?.durationSec).filter(Number.isFinite);
  if(!ss.length) return { level: 1, ms: 260, laps: 2, rows: 10 };
  const completionRate = completed/ss.length;
  const speed = duration.length ? clamp(1 - (median(duration)/240), 0, 1) : 0.4;
  const level = clamp(Math.round(1 + completionRate*5 + speed*4), 1, 10);
  return {
    level,
    ms: clamp(Math.round(320 - level*20), 90, 3000),
    laps: clamp(1 + Math.floor(level/3), 1, 8),
    rows: clamp(8 + Math.floor(level/2), 8, 16),
  };
}


function readerItemRating(params){
  const size0 = 8;
  const ms0 = 250;
  const a = 40;
  const b = 300;
  const c = 1.2;
  return 1000 + a * ((params.stimulusSize ?? size0) - size0) + b * ((params.complexity ?? 1.0) - 1.0) + c * (ms0 - (params.exposureMs ?? ms0));
}

function fixationItemRating(params){
  const hold0 = 600, size0 = 24, d0 = 2, amp0 = 1.0;
  const a=35,b=25,c=40,d=80,e=120;
  return 1000
    + a * (((params.holdMs ?? hold0) - hold0)/100)
    + b * ((size0 - (params.targetSizePx ?? size0))/5)
    + c * ((params.distractorCount ?? d0) - d0)
    + d * ((params.amplitude ?? amp0) - amp0)
    + e * (params.motionFlag ? 1 : 0);
}

function applyReaderAdaptiveParams(user){
  const p = normalizeAdaptiveProfile(user.settings.reader.profile, { exposureMs:250, stimulusSize:8, complexity:1.0 });
  user.settings.reader.profile = p;
  const wpm = clamp(Math.round(60000 / clamp(p.currentParams.exposureMs ?? 250, 80, 600)), 100, 1200);
  user.settings.reader.wpm = wpm;
  user.settings.reader.chunk = clamp(Math.round(p.currentParams.stimulusSize ?? 8), 1, 20);
}

function applyFixAdaptiveParams(user){
  const p = normalizeAdaptiveProfile(user.settings.fixation.profile, { holdMs:600, targetSizePx:24, distractorCount:2, amplitude:1.0, motionFlag:0 });
  user.settings.fixation.profile = p;
  user.settings.fixation.ms = clamp(Math.round(p.currentParams.holdMs ?? 600), 50, 3000);
  user.settings.fixation.cols = clamp(Math.round((p.currentParams.distractorCount ?? 2) + 1), 1, 8);
  user.settings.fixation.rows = clamp(Math.round(8 + (p.currentParams.amplitude ?? 1.0) * 4), 6, 16);
}

function fmtSessionLabel(s){
  const d = new Date(s.startedAt);
  const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`;
  return `${when} • ${EXERCISES[s.exerciseId]?.name || s.exerciseId}`;
}

// ---------- charts (simple SVG line chart) ----------
function renderLineChart(el, points, opts){
  const width = 800;
  const height = 260;
  const padL = 46;
  const padR = 18;
  const padT = 14;
  const padB = 28;

  el.innerHTML = "";
  if(!points.length){
    el.innerHTML = `<div class="muted">Nessun dato.</div>`;
    return;
  }

  const xs = points.map(p=>p.x);
  const ys = points.map(p=>p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const xSpan = (maxX-minX) || 1;
  const ySpan = (maxY-minY) || 1;

  const xTo = (x) => padL + ((x-minX)/xSpan)*(width-padL-padR);
  const yTo = (y) => padT + (1-((y-minY)/ySpan))*(height-padT-padB);

  const path = points.map((p,i)=>`${i===0?"M":"L"} ${xTo(p.x).toFixed(2)} ${yTo(p.y).toFixed(2)}`).join(" ");

  const yLabel = opts?.yLabel ?? "";
  const xLabel = opts?.xLabel ?? "";

  const ticks = 4;
  let axisLines = "";
  for(let i=0;i<=ticks;i++){
    const y = padT + (i/ticks)*(height-padT-padB);
    axisLines += `<line class="axis" x1="${padL}" x2="${width-padR}" y1="${y}" y2="${y}"></line>`;
  }

  const startDate = new Date(minX).toLocaleDateString();
  const endDate = new Date(maxX).toLocaleDateString();

  const svg = `
  <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="grafico a linee">
    ${axisLines}
    <path class="line" d="${path}"></path>
    ${points.map(p=>`<circle class="dotpt" cx="${xTo(p.x)}" cy="${yTo(p.y)}" r="4"></circle>`).join("")}
    <text class="label" x="${padL}" y="${height-10}">${xLabel || `${startDate} → ${endDate}`}</text>
    <text class="label" x="10" y="18">${yLabel}</text>
    <text class="label" x="10" y="${height-12}">${minY.toFixed(0)}</text>
    <text class="label" x="10" y="${padT+10}">${maxY.toFixed(0)}</text>
  </svg>`;
  el.innerHTML = svg;
}

// ---------- views ----------
function showView(viewId){
  $$(".nav-item").forEach(b=>{
    b.classList.toggle("active", b.dataset.view===viewId);
  });
  $$(".view").forEach(v=>{
    v.classList.toggle("hidden", v.dataset.view!==viewId);
  });
  if(viewId==="data") renderDataDump();
}

// ---------- text cache ----------
function setTextCache(lang, info){
  STATE.textCache[lang] = { ...info, cachedAt: nowIso() };
  saveState();
  renderTextMeta();
}

function getTextCache(lang){
  return STATE.textCache[lang];
}

function renderTextMeta(){
  const cIt = getTextCache("it");
  const cEn = getTextCache("en");
  const pickLang = ($("#readerLang")?.value) || getActiveUser().settings.reader.lang || "it";
  const c = pickLang==="en" ? cEn : cIt;
  if(!c){
    $("#textMeta").textContent = "Nessun testo caricato.";
    return;
  }
  const ttl = c.title ? `“${c.title}”` : "testo";
  $("#textMeta").textContent = `${pickLang.toUpperCase()} • ${ttl} • ${c.wordCount || "?"} parole`;
}

// ---------- Dashboard rendering ----------
function renderUserSelect(){
  const sel = $("#userSelect");
  sel.innerHTML = "";
  for(const u of STATE.users){
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    sel.appendChild(opt);
  }
  sel.value = STATE.activeUserId;
}

function renderGoal(){
  const u = getActiveUser();
  const rd = computeReaderLevel(u);
  const sp = computeSpanLevel(u);
  const fx = computeFixLevel(u);
  $("#goalLine").textContent = `Reader L${rd.level}/10 • Span L${sp.level}/10 • Fix L${fx.level}/10`;
  $("#levelLine").textContent = `Target: ${rd.baseWpm} WPM, span ${sp.len} char/${sp.ms}ms, fix ${fx.ms}ms • giri ${fx.laps}`;
}

function renderRecent(){
  const u = getActiveUser();
  const ss = u.sessions.slice().sort((a,b)=> (Date.parse(b.startedAt)||0) - (Date.parse(a.startedAt)||0)).slice(0,8);
  const box = $("#recentSessions");
  box.innerHTML = "";
  if(!ss.length){
    box.innerHTML = `<div class="muted">Nessuna sessione.</div>`;
    return;
  }
  for(const s of ss){
    const item = document.createElement("div");
    item.className = "item";
    const left = document.createElement("div");
    left.innerHTML = `<div><b>${EXERCISES[s.exerciseId]?.name || s.exerciseId}</b></div><div class="muted small">${new Date(s.startedAt).toLocaleString()}</div>`;
    const right = document.createElement("div");
    const badges = [];
    if(Number.isFinite(s.metrics?.wpm)) badges.push(`<span class="badge good">${Math.round(s.metrics.wpm)} WPM</span>`);
    if(Number.isFinite(s.metrics?.accuracy)) badges.push(`<span class="badge ${s.metrics.accuracy>=0.8?"good":"warn"}">${Math.round(s.metrics.accuracy*100)}%</span>`);
    if(Number.isFinite(s.metrics?.score)) badges.push(`<span class="badge">${s.metrics.score}</span>`);
    right.innerHTML = badges.join(" ");
    item.appendChild(left);
    item.appendChild(right);
    box.appendChild(item);
  }
}

function renderCharts(){
  const u = getActiveUser();

  const read = sessionsByExercise(u, "reader").filter(s=>Number.isFinite(s.metrics?.wpm));
  const wpmPts = read.slice(-20).map(s=>({ x: Date.parse(s.startedAt), y: s.metrics.wpm }));
  renderLineChart($("#chartWpm"), wpmPts, { yLabel: "WPM" });

  const all = u.sessions.filter(s=>Number.isFinite(s.metrics?.accuracy));
  const accPts = all.slice(-30).map(s=>({ x: Date.parse(s.startedAt), y: s.metrics.accuracy*100 }));
  renderLineChart($("#chartAcc"), accPts, { yLabel: "Acc (%)" });
}

function renderDataDump(){
  const u = getActiveUser();
  $("#dataDump").textContent = JSON.stringify(u, null, 2);
}

// ---------- Reader exercise ----------
const Reader = {
  running: false,
  paused: false,
  timerId: null,
  startedPerf: null,
  pausedAt: null,
  elapsedMs: 0,
  idx: 0,
  tokens: [],
  mode: "rsvp",
  chunk: 3,
  msPerToken: 200,
  textInfo: null,
  session: null,
};

function readerResetRuntime(){
  Reader.running = false;
  Reader.paused = false;
  Reader.timerId = null;
  Reader.startedPerf = null;
  Reader.pausedAt = null;
  Reader.elapsedMs = 0;
  Reader.idx = 0;
  Reader.tokens = [];
  Reader.textInfo = null;
  Reader.session = null;
  $("#readerDisplay").textContent = "—";
  $("#pacerBox").classList.add("hidden");
  $("#pacerBox").innerHTML = "";
  $("#quizBox").innerHTML = "";
  $("#readerTimer").textContent = "0:00";
  $("#readerProgress").textContent = "—";
  $("#readerStatus").textContent = "—";
}

function readerUpdateTimer(){
  if(!Reader.running) return;
  const now = performance.now();
  const base = Reader.startedPerf ?? now;
  const elapsed = Reader.elapsedMs + (Reader.paused ? 0 : (now - base));
  $("#readerTimer").textContent = fmtTime(elapsed);
}

function readerBuildTokens(words, mode, chunk){
  if(mode === "chunk"){
    const out = [];
    for(let i=0;i<words.length;i+=chunk){
      out.push(words.slice(i,i+chunk).join(" "));
    }
    return out;
  }
  return words.slice();
}

function readerComputeMsPerToken(wpm, mode, chunk){
  // WPM is "words per minute". For RSVP: 1 token = 1 word. For chunk: token has N words.
  const msPerWord = 60000 / clamp(wpm, 50, 2500);
  if(mode === "chunk") return msPerWord * clamp(chunk,1,12);
  return msPerWord;
}

function renderPacer(words){
  const box = $("#pacerBox");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  words.forEach((w,i)=>{
    const span = document.createElement("span");
    span.className = "w";
    span.dataset.i = String(i);
    span.textContent = w + " ";
    frag.appendChild(span);
  });
  box.appendChild(frag);
}

function pacerSetActive(i){
  const box = $("#pacerBox");
  const prev = box.querySelector(".w.active");
  if(prev) prev.classList.remove("active");
  const cur = box.querySelector(`.w[data-i="${i}"]`);
  if(cur){
    cur.classList.add("active");
    if(i % 30 === 0) cur.scrollIntoView({block:"center", inline:"nearest"});
  }
}

async function readerLoadText(){
  const u = getActiveUser();
  const s = u.settings.reader;
  const lang = $("#readerLang").value;
  const minWords = Number($("#readerMinWords").value) || s.minWords || 180;
  const source = $("#readerSource").value;

  $("#readerStatus").textContent = "Carico testo…";
  const info = await getAdaptiveText(lang, minWords, source, $("#readerCustomText")?.value || "");
  setTextCache(lang, info);
  $("#readerStatus").textContent = `Testo pronto: ${info.wordCount} parole`;
  return info;
}

function readerPrepare(info){
  Reader.textInfo = info;
  const u = getActiveUser();
  const mode = $("#readerMode").value;
  const chunk = Number($("#readerChunk").value) || u.settings.reader.chunk || 3;
  const wpm = Number($("#readerWpm").value) || u.settings.reader.wpm || 350;

  const w = wordsOf(info.text);
  Reader.mode = mode;
  Reader.chunk = chunk;
  Reader.msPerToken = readerComputeMsPerToken(wpm, mode, chunk);
  Reader.tokens = readerBuildTokens(w, mode, chunk);
  Reader.idx = 0;

  $("#readerDisplay").textContent = "Pronto";
  $("#readerProgress").textContent = `0 / ${w.length} parole`;

  if(mode === "pacer"){
    $("#pacerBox").classList.remove("hidden");
    $("#pacerBox").style.fontSize = `${STATE.ui.pacerFont || 18}px`;
    renderPacer(w);
    pacerSetActive(0);
  }else{
    $("#pacerBox").classList.add("hidden");
  }
}

function readerStep(){
  if(!Reader.running || Reader.paused) return;

  const mode = Reader.mode;
  const token = Reader.tokens[Reader.idx];

  if(token == null){
    readerStop(true);
    return;
  }

  if(mode === "pacer"){
    // token array is words (not chunks) in pacer mode
    pacerSetActive(Reader.idx);
    $("#readerDisplay").textContent = wordsOf(token).join(" ");
  }else{
    $("#readerDisplay").textContent = token;
  }

  const totalWords = (Reader.mode === "chunk") ? Reader.tokens.join(" ").split(" ").length : Reader.tokens.length;
  const progressWords = (Reader.mode === "chunk")
    ? Reader.tokens.slice(0, Reader.idx+1).join(" ").split(" ").length
    : Reader.idx+1;

  $("#readerProgress").textContent = `${progressWords} / ${totalWords} parole`;

  Reader.idx += 1;
}

function readerStart(){
  if(Reader.running) return;
  const lang = $("#readerLang").value;

  // ensure a text exists
  const cached = getTextCache(lang);
  if(!cached){
    $("#readerStatus").textContent = "Nessun testo: clicca “Carica testo”.";
    return;
  }
  readerPrepare(cached);

  Reader.running = true;
  Reader.paused = false;
  Reader.startedPerf = performance.now();
  Reader.elapsedMs = 0;

  const u = getActiveUser();
  const mode = $("#readerMode").value;
  const wpm = Number($("#readerWpm").value) || u.settings.reader.wpm || 350;
  const chunk = Number($("#readerChunk").value) || u.settings.reader.chunk || 3;

  Reader.session = {
    id: uid(),
    exerciseId: "reader",
    startedAt: nowIso(),
    endedAt: null,
    config: { lang, mode, wpm, chunk, minWords: Number($("#readerMinWords").value)||180, source: $("#readerSource").value, title: cached.title, sourceUrl: cached.sourceUrl },
    metrics: {},
    notes: {},
  };

  $("#readerStatus").textContent = "In corso…";

  // tick
  Reader.timerId = setInterval(()=>{
    readerUpdateTimer();
    readerStep();
  }, Math.max(40, Math.round(Reader.msPerToken)));
}

function readerPauseToggle(){
  if(!Reader.running) return;
  Reader.paused = !Reader.paused;
  if(Reader.paused){
    Reader.pausedAt = performance.now();
    Reader.elapsedMs += (Reader.pausedAt - (Reader.startedPerf ?? Reader.pausedAt));
    Reader.startedPerf = null;
    $("#readerStatus").textContent = "In pausa";
  }else{
    Reader.startedPerf = performance.now();
    Reader.pausedAt = null;
    $("#readerStatus").textContent = "In corso…";
  }
}

function buildQuizFromText(text, lang){
  const w = wordsOf(text).map(x=>x.replace(/[^\p{L}\p{N}'-]/gu,"")).filter(Boolean);
  const candidates = w.filter(x=>x.length>=4 && !(STOPWORDS[lang]?.has(x.toLowerCase())));
  const unique = Array.from(new Set(candidates.map(x=>x.toLowerCase())));
  if(unique.length < 8) return [];
  const qs = [];
  for(let i=0;i<3;i++){
    const correct = pick(unique);
    const distractPool = unique.filter(x=>x!==correct);
    const distract = shuffle(distractPool).slice(0,3);
    const opts = shuffle([correct, ...distract]);
    qs.push({ id: uid(), correct, opts, chosen: null });
  }
  return qs;
}

function renderQuiz(quiz){
  const box = $("#quizBox");
  box.innerHTML = "";
  if(!quiz.length){
    box.innerHTML = `<div class="muted">Quiz non disponibile per questo testo.</div>`;
    return;
  }
  quiz.forEach((q, idx)=>{
    const div = document.createElement("div");
    div.className = "q";
    div.innerHTML = `
      <div class="q-title">Domanda ${idx+1}: quale parola era nel testo?</div>
      <div class="opts"></div>
    `;
    const optsBox = div.querySelector(".opts");
    q.opts.forEach(opt=>{
      const b = document.createElement("div");
      b.className = "opt";
      b.textContent = opt;
      b.addEventListener("click", ()=>{
        if(q.chosen) return;
        q.chosen = opt;
        b.classList.add(opt===q.correct ? "correct" : "wrong");
        // mark correct if chosen wrong
        if(opt!==q.correct){
          Array.from(optsBox.children).forEach(ch=>{
            if(ch.textContent===q.correct) ch.classList.add("correct");
          });
        }
      });
      optsBox.appendChild(b);
    });
    box.appendChild(div);
  });
}

function readerStop(completed=false){
  if(!Reader.running) return;
  clearInterval(Reader.timerId);
  Reader.timerId = null;

  // finalize timing
  if(!Reader.paused && Reader.startedPerf != null){
    Reader.elapsedMs += (performance.now() - Reader.startedPerf);
  }

  Reader.running = false;
  Reader.paused = false;
  $("#readerStatus").textContent = completed ? "Completato" : "Interrotto";

  const cachedLang = $("#readerLang").value;
  const cached = getTextCache(cachedLang);
  const words = cached ? wordsOf(cached.text).length : 0;
  const minutes = Reader.elapsedMs / 60000;
  const wpm = minutes > 0 ? (words / minutes) : null;

  const quiz = cached ? buildQuizFromText(cached.text, cachedLang) : [];
  renderQuiz(quiz);

  const accuracy = quiz.length ? (quiz.filter(q=>q.chosen===q.correct).length / quiz.length) : null;

  if(Reader.session){
    Reader.session.endedAt = nowIso();
    Reader.session.metrics = {
      wpm: Number.isFinite(wpm) ? wpm : null,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      score: quiz.length ? `${quiz.filter(q=>q.chosen===q.correct).length}/${quiz.length}` : null,
      durationSec: Math.round(Reader.elapsedMs/1000),
      wordCount: words,
    };
    addSessionToUser(Reader.session);
    if(completed){
      const u = getActiveUser();
      let prof = normalizeAdaptiveProfile(u.settings.reader.profile, { exposureMs: 250, stimulusSize: 8, complexity: 1.0 });
      const S = Number.isFinite(accuracy) ? clamp(accuracy, 0, 1) : 0;
      const curr = prof.currentParams;
      const currItem = readerItemRating(curr);
      const upd = updateGlickoLite({ R_user: prof.R_user, RD_user: prof.RD_user, R_item: currItem, S });
      prof.R_user = upd.R_user;
      prof.RD_user = upd.RD_user;
      prof.attempts_count += 1;
      prof.lastSessionAt = nowIso();
      prof = pushRollingResult(prof, S, { at: nowIso(), params: curr });
      const ra = rollingAccuracy(prof.rollingResults);
      if(ra !== null){
        if(ra < 0.45) prof.fatigueBias = -5;
        else if(ra > 0.90) prof.fatigueBias = 5;
        else prof.fatigueBias = 0;
      }
      const target = targetItemRating(prof.R_user, prof.RD_user) + prof.fatigueBias * 10;
      const cands = [];
      for(const dMs of [-25,0,25]) for(const dSz of [-1,0,1]) for(const dCx of [-0.05,0,0.05]){
        cands.push({
          exposureMs: clamp((curr.exposureMs ?? 250) + dMs, 80, 600),
          stimulusSize: clamp((curr.stimulusSize ?? 8) + dSz, 4, 20),
          complexity: clamp((curr.complexity ?? 1.0) + dCx, 1.0, 1.5),
        });
      }
      const next = selectCandidate({ currentParams: curr, candidates: cands, itemRating: readerItemRating, targetRating: target }) || curr;
      prof.currentParams = next;
      if(readerItemRating(next) > readerItemRating(prof.bestParams)) prof.bestParams = { ...next };
      u.settings.reader.profile = prof;
      applyReaderAdaptiveParams(u);
      saveState();
    }
  }

  rerenderDashboard();
}

// ---------- Span exercise ----------
const Span = {
  active: false,
  current: null,
  session: null,
  tries: 0,
  correct: 0,
  shownAt: null,
  hideTimer: null,
};

function getSpanProfile(){
  const u = getActiveUser();
  const defaults = defaultUserSettings();
  u.settings = ensureObject(u.settings, JSON.parse(JSON.stringify(defaults)));
  u.settings.span = ensureObject(u.settings.span, JSON.parse(JSON.stringify(defaults.span)));
  u.settings.span.profile = normalizeSpanProfile(u.settings.span.profile || {});
  return u.settings.span.profile;
}

function setSpanProfile(profile){
  const u = getActiveUser();
  u.settings.span.profile = normalizeSpanProfile(profile);
}

function renderSpanStatus(){
  const p = getSpanProfile();
  $("#spanStatus").textContent = `Livello: Stage ${p.currentStage} · ${p.currentLength} caratteri`;
}

function spanGenerate(){
  const p = getSpanProfile();
  return generateSpanStimulus({ stage: p.currentStage, length: p.currentLength });
}

function spanApplyFont(){
  const pct = clamp(Number($("#spanFont").value)||110, 70, 220);
  $("#spanStimulus").style.fontSize = `${Math.round(54*(pct/110))}px`;
}

function spanStartSessionIfNeeded(){
  if(Span.session) return;
  const profile = getSpanProfile();
  Span.session = {
    id: uid(),
    exerciseId: "span",
    startedAt: nowIso(),
    endedAt: null,
    config: {
      ms: Number($("#spanMs").value)||800,
      font: Number($("#spanFont").value)||110,
      startStage: profile.currentStage,
      startLength: profile.currentLength,
    },
    metrics: {},
    notes: {},
  };
  Span.tries = 0;
  Span.correct = 0;
  $("#spanScore").textContent = "Score: 0/0";
  renderSpanStatus();
}

function spanNewTrial(){
  spanStartSessionIfNeeded();
  if(Span.hideTimer) clearTimeout(Span.hideTimer);
  spanApplyFont();
  $("#spanResult").textContent = "";
  $("#spanInput").value = "";
  $("#spanInput").focus();

  const ms = clamp(Number($("#spanMs").value)||800, 40, 3000);
  const stim = spanGenerate();
  Span.current = stim;
  Span.shownAt = performance.now();
  const el = $("#spanStimulus");
  el.textContent = stim;
  el.style.visibility = "visible";

  if(Span.hideTimer) clearTimeout(Span.hideTimer);
  Span.hideTimer = setTimeout(()=>{
    el.style.visibility = "hidden";
  }, ms);
}

function spanCheck(){
  if(!Span.session || !Span.current) return;
  const typed = ($("#spanInput").value||"").trim();
  const ok = evaluateSpanAttempt(Span.current, typed);
  Span.tries += 1;
  if(ok) Span.correct += 1;

  let profile = getSpanProfile();
  profile = updateSpanProgress(profile, ok, { successStreakToGrow: 3 });
  profile = pushSpanRollingResult(profile, { ok, at: nowIso() });
  profile.lastSessionAt = nowIso();
  setSpanProfile(profile);

  $("#spanResult").innerHTML = ok
    ? `<span style="color: var(--good); font-weight: 800;">buono:</span> ${Span.current}`
    : `<span style="color: var(--bad); font-weight: 800;">era:</span> ${Span.current}`;
  $("#spanScore").textContent = `Score: ${Span.correct}/${Span.tries}`;
  renderSpanStatus();
  saveState();
  Span.current = null;
}

function spanEndSession(){
  if(!Span.session) return;
  Span.session.endedAt = nowIso();
  const acc = Span.tries ? (Span.correct/Span.tries) : null;
  const profile = getSpanProfile();
  Span.session.metrics = {
    accuracy: Number.isFinite(acc) ? acc : null,
    score: `${Span.correct}/${Span.tries}`,
    tries: Span.tries,
    stage: profile.currentStage,
    length: profile.currentLength,
  };
  Span.session.notes = {
    restartPoint: `Stage ${profile.currentStage} · ${profile.currentLength} caratteri`,
    best: `Stage ${profile.bestStageReached} · ${profile.bestLengthReached} caratteri`,
  };
  addSessionToUser(Span.session);

  $("#spanResult").textContent = `Record: Stage ${profile.bestStageReached} · ${profile.bestLengthReached}. Ripartenza: Stage ${profile.currentStage} · ${profile.currentLength}.`;
  Span.session = null;
  Span.tries = 0;
  Span.correct = 0;
  $("#spanStimulus").style.visibility = "visible";
  $("#spanStimulus").textContent = "—";
  $("#spanScore").textContent = "Score: 0/0";
  rerenderDashboard();
}

// ---------- Fixation exercise ----------
const Fix = {
  running:false,
  paused:false,
  timerId:null,
  startedPerf:null,
  elapsedMs:0,
  index:0,
  lapsLeft:0,
  total:0,
  segs:[],
  session:null,
};

function fixBuildGrid(cols, rows, segs, mode){
  const grid = $("#fixGrid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const total = cols*rows;
  for(let i=0;i<total;i++){
    const cell = document.createElement("div");
    cell.className = "fix-cell";
    cell.dataset.i = String(i);
    const dot = document.createElement("div");
    dot.className = "dot";
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.textContent = (mode==="text" && segs[i]) ? segs[i] : "";
    cell.appendChild(dot);
    cell.appendChild(seg);
    grid.appendChild(cell);
  }
  Fix.total = total;
}

function splitIntoSegments(text, segLen){
  // similar to original HTML exercises: fixed length in chars, then stop at next space
  const clean = text.replace(/\s+/g, " ").trim();
  const out = [];
  let start = 0;
  const L = clean.length;
  while(start < L){
    const hard = Math.min(L, start + segLen);
    if(hard >= L){
      out.push(clean.slice(start));
      break;
    }
    const nextSpace = clean.indexOf(" ", hard);
    const stop = nextSpace === -1 ? L : nextSpace;
    out.push(clean.slice(start, stop));
    start = stop + 1;
  }
  return out.filter(s=>s.trim().length>0);
}

function fixUpdateTimer(){
  if(!Fix.running) return;
  const now = performance.now();
  const base = Fix.startedPerf ?? now;
  const elapsed = Fix.elapsedMs + (Fix.paused ? 0 : (now - base));
  $("#fixTimer").textContent = fmtTime(elapsed);
}

function fixActivate(i){
  const grid = $("#fixGrid");
  const prev = grid.querySelector(".fix-cell.active");
  if(prev) prev.classList.remove("active");
  const cur = grid.querySelector(`.fix-cell[data-i="${i}"]`);
  if(cur) cur.classList.add("active");
}

async function fixLoadText(){
  const lang = $("#fixLang").value;
  const source = $("#fixSource").value;
  const cols = Number($("#fixCols").value);
  const rows = Number($("#fixRows").value);
  const total = cols*rows;
  const segLen = Number($("#fixSegLen").value) || 20;
  const minWords = Math.max(120, Math.round(total * (segLen/6))); // rough

  $("#fixStatus").textContent = "Carico testo…";
  const info = await getAdaptiveText(lang, minWords, source, $("#fixCustomText")?.value || "");
  setTextCache(lang, info);
  const segs = splitIntoSegments(info.text, segLen);
  Fix.segs = segs;
  $("#fixStatus").textContent = `Testo pronto: ${info.wordCount} parole`;
}

function fixPrepare(){
  const mode = $("#fixMode").value;
  const cols = Number($("#fixCols").value);
  const rows = Number($("#fixRows").value);

  // ensure grid exists
  if(mode==="text"){
    const lang = $("#fixLang").value;
    const cached = getTextCache(lang);
    if(!cached){
      $("#fixStatus").textContent = "Nessun testo: clicca “Carica testo”.";
      return false;
    }
    const segLen = Number($("#fixSegLen").value)||20;
    Fix.segs = splitIntoSegments(cached.text, segLen);
    fixBuildGrid(cols, rows, Fix.segs, "text");
  }else{
    fixBuildGrid(cols, rows, [], "dots");
  }
  Fix.index = 0;
  Fix.elapsedMs = 0;
  $("#fixTimer").textContent = "0:00";
  $("#fixProgress").textContent = `0 / ${Fix.total}`;
  fixActivate(0);
  return true;
}

function fixStart(){
  if(Fix.running) return;
  if(!fixPrepare()) return;

  const ms = clamp(Number($("#fixMs").value)||250, 50, 3000);
  const laps = clamp(Number($("#fixLaps").value)||2, 1, 50);
  Fix.lapsLeft = laps;
  Fix.running = true;
  Fix.paused = false;
  Fix.startedPerf = performance.now();

  Fix.session = {
    id: uid(),
    exerciseId: "fixation",
    startedAt: nowIso(),
    endedAt: null,
    config: {
      ms, laps,
      cols: Number($("#fixCols").value),
      rows: Number($("#fixRows").value),
      mode: $("#fixMode").value,
      segLen: Number($("#fixSegLen").value)||20,
      lang: $("#fixLang").value,
      source: $("#fixSource").value,
      title: (getTextCache($("#fixLang").value)||{}).title || null
    },
    metrics: {},
    notes: {},
  };

  $("#fixStatus").textContent = "In corso…";

  Fix.timerId = setInterval(()=>{
    if(!Fix.running) return;
    fixUpdateTimer();
    if(Fix.paused) return;

    fixActivate(Fix.index);
    $("#fixProgress").textContent = `${Fix.index+1} / ${Fix.total} • giri rimasti: ${Fix.lapsLeft}`;

    Fix.index += 1;
    if(Fix.index >= Fix.total){
      Fix.index = 0;
      Fix.lapsLeft -= 1;
      if(Fix.lapsLeft <= 0){
        fixStop(true);
      }
    }
  }, ms);
}

function fixPauseToggle(){
  if(!Fix.running) return;
  Fix.paused = !Fix.paused;
  if(Fix.paused){
    Fix.elapsedMs += (performance.now() - (Fix.startedPerf ?? performance.now()));
    Fix.startedPerf = null;
    $("#fixStatus").textContent = "In pausa";
  }else{
    Fix.startedPerf = performance.now();
    $("#fixStatus").textContent = "In corso…";
  }
}

function fixStop(completed=false){
  if(!Fix.running) return;
  clearInterval(Fix.timerId);
  Fix.timerId = null;

  if(!Fix.paused && Fix.startedPerf != null){
    Fix.elapsedMs += (performance.now() - Fix.startedPerf);
  }

  Fix.running = false;
  Fix.paused = false;
  $("#fixStatus").textContent = completed ? "Completato" : "Interrotto";

  if(Fix.session){
    Fix.session.endedAt = nowIso();
    Fix.session.metrics = {
      // for fixation we measure "completion" and duration; accuracy not really defined
      accuracy: completed ? 1 : 0,
      durationSec: Math.round(Fix.elapsedMs/1000),
      score: completed ? "OK" : "STOP",
    };
    addSessionToUser(Fix.session);
    if(completed){
      const u = getActiveUser();
      let prof = normalizeAdaptiveProfile(u.settings.fixation.profile, { holdMs: 600, targetSizePx: 24, distractorCount: 2, amplitude: 1.0, motionFlag: 0 });
      const S = completed ? 1 : 0;
      const curr = prof.currentParams;
      const currItem = fixationItemRating(curr);
      const upd = updateGlickoLite({ R_user: prof.R_user, RD_user: prof.RD_user, R_item: currItem, S });
      prof.R_user = upd.R_user;
      prof.RD_user = upd.RD_user;
      prof.attempts_count += 1;
      prof.lastSessionAt = nowIso();
      prof = pushRollingResult(prof, S, { at: nowIso(), params: curr });
      const ra = rollingAccuracy(prof.rollingResults);
      if(ra !== null){
        if(ra < 0.45) prof.fatigueBias = -5;
        else if(ra > 0.90) prof.fatigueBias = 5;
        else prof.fatigueBias = 0;
      }
      const target = targetItemRating(prof.R_user, prof.RD_user) + prof.fatigueBias * 10;
      const cands = [];
      for(const dH of [-100,0,100]) for(const dS of [-2,0,2]) for(const dD of [-1,0,1]) for(const dA of [-0.1,0,0.1]){
        cands.push({
          holdMs: clamp((curr.holdMs ?? 600)+dH, 300, 2000),
          targetSizePx: clamp((curr.targetSizePx ?? 24)+dS, 10, 40),
          distractorCount: clamp((curr.distractorCount ?? 2)+dD, 0, 8),
          amplitude: clamp((curr.amplitude ?? 1.0)+dA, 0.5, 2.0),
          motionFlag: curr.motionFlag ?? 0,
        });
      }
      if(prof.attempts_count % 5 === 0){
        cands.push({ ...curr, motionFlag: curr.motionFlag ? 0 : 1 });
      }
      const next = selectCandidate({ currentParams: curr, candidates: cands, itemRating: fixationItemRating, targetRating: target }) || curr;
      prof.currentParams = next;
      if(fixationItemRating(next) > fixationItemRating(prof.bestParams)) prof.bestParams = { ...next };
      u.settings.fixation.profile = prof;
      applyFixAdaptiveParams(u);
      saveState();
    }
    Fix.session = null;
  }
  rerenderDashboard();
}

// ---------- Settings ----------
function renderSyncStatus(){
  const el = $("#syncStatus");
  if(!el) return;
  if(!SYNC.fileHandle){
    el.textContent = "Sync: non configurato.";
    return;
  }
  el.textContent = SYNC.connected ? "Sync: connesso (read/write)." : "Sync: file trovato, ma manca permesso (clicca Importa o Connetti).";
}

function openSettings(){
  $("#uiPacerFont").value = String(STATE.ui.pacerFont || 18);
  $("#uiDebug").checked = !!STATE.ui.debug;
  $("#settingsDialog").showModal();
  renderSyncStatus();
}

function saveSettings(){
  STATE.ui.pacerFont = clamp(Number($("#uiPacerFont").value)||18, 14, 28);
  STATE.ui.debug = $("#uiDebug").checked;
  saveState();
  $("#settingsDialog").close();
  rerenderAll();
}

// ---------- import/export ----------
function exportJson(){
  const blob = new Blob([JSON.stringify(STATE, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "speedread-v2-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}

function importJsonFile(file){
  file.text().then(txt=>{
    const parsed = safeParseJson(txt);
    if(!parsed){ alert("JSON non valido."); return; }
    STATE = migrateState(parsed);
    saveState();
    rerenderAll();
  });
}

// ---------- wiring ----------
function bindNav(){
  $$(".nav-item").forEach(b=>{
    b.addEventListener("click", ()=> showView(b.dataset.view));
  });
}

function bindTopbar(){
  $("#userSelect").addEventListener("change", (e)=> setActiveUser(e.target.value));
  $("#btnAddUser").addEventListener("click", ()=>{
    const name = prompt("Nome nuovo utente:");
    if(name) addUser(name);
  });
  $("#btnSettings").addEventListener("click", openSettings);
}

function bindDashboard(){
  $("#btnQuickStart").addEventListener("click", ()=>{
    showView("reader");
    // load text if missing
    if(!getTextCache($("#readerLang").value)){
      readerLoadText().catch(err=>{
        $("#readerStatus").textContent = `Errore: ${err.message}`;
      });
    }
  });
  $("#btnExport").addEventListener("click", exportJson);
  $("#btnImport").addEventListener("click", ()=> $("#fileImport").click());
  $("#fileImport").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJsonFile(f);
    e.target.value = "";
  });
  $("#btnNewText").addEventListener("click", async ()=>{
    const lang = ($("#readerLang")?.value) || getActiveUser().settings.reader.lang || "it";
    const lvl = computeReaderLevel(getActiveUser());
    const source = ($("#readerSource")?.value) || "wiki";
    const info = await getAdaptiveText(lang, lvl.minWords, source, $("#readerCustomText")?.value || "");
    setTextCache(lang, info);
    rerenderAll();
  });
  $("#btnCopyText").addEventListener("click", async ()=>{
    const lang = ($("#readerLang")?.value) || getActiveUser().settings.reader.lang || "it";
    const c = getTextCache(lang);
    if(!c?.text){ alert("Nessun testo."); return; }
    await navigator.clipboard.writeText(c.text);
    alert("Testo copiato.");
  });
}

function bindReader(){
  $("#btnLoadText").addEventListener("click", ()=> readerLoadText().catch(err=>{
    $("#readerStatus").textContent = `Errore: ${err.message}`;
  }));
  $("#btnReaderStart").addEventListener("click", readerStart);
  $("#btnReaderPause").addEventListener("click", readerPauseToggle);
  $("#btnReaderStop").addEventListener("click", ()=> readerStop(false));

  // save reader settings on change
  ["readerLang","readerMode","readerWpm","readerChunk","readerMinWords","readerSource","readerCustomText"].forEach(id=>{
    $("#"+id).addEventListener("change", ()=>{
      const u = getActiveUser();
      u.settings.reader = {
        lang: $("#readerLang").value,
        mode: $("#readerMode").value,
        wpm: Number($("#readerWpm").value)||350,
        chunk: Number($("#readerChunk").value)||3,
        minWords: Number($("#readerMinWords").value)||180,
        source: $("#readerSource").value,
        customText: $("#readerCustomText").value || "",
      };
      saveState();
      renderTextMeta();
    });
  });
}

function withSpanGuard(action){
  try{
    action();
  }catch(err){
    console.error("Campo visivo error:", err);
    const out = $("#spanResult");
    if(out) out.textContent = `Errore Campo visivo: ${err?.message || err}`;
    const stim = $("#spanStimulus");
    if(stim){
      stim.style.visibility = "visible";
      stim.textContent = "⚠";
    }
  }
}

function spanHandleEnterAction(){
  if(Span.current){
    spanCheck();
    return;
  }
  spanNewTrial();
}

function bindSpan(){
  $("#btnSpanNew").addEventListener("click", ()=> withSpanGuard(spanNewTrial));
  $("#btnSpanCheck").addEventListener("click", ()=> withSpanGuard(spanCheck));
  $("#btnSpanEnd").addEventListener("click", ()=> withSpanGuard(spanEndSession));
  $("#spanInput").addEventListener("keydown", (e)=>{
    if(e.key==="Enter" || e.key==="NumpadEnter"){
      e.preventDefault();
      withSpanGuard(spanHandleEnterAction);
    }
  });
  document.addEventListener("keydown", (e)=>{
    if((e.key!=="Enter" && e.key!=="NumpadEnter") || e.repeat) return;
    const spanView = document.querySelector('.view[data-view="span"]');
    if(spanView?.classList.contains("hidden")) return;
    if(document.activeElement?.id === "spanInput") return;
    e.preventDefault();
    withSpanGuard(spanHandleEnterAction);
  });

  ["spanMs","spanFont"].forEach(id=>{
    $("#"+id).addEventListener("change", ()=>{
      spanApplyFont();
      const u = getActiveUser();
      const defaults = defaultUserSettings();
      u.settings = ensureObject(u.settings, JSON.parse(JSON.stringify(defaults)));
      u.settings.span = ensureObject(u.settings.span, JSON.parse(JSON.stringify(defaults.span)));
      u.settings.span.ms = Number($("#spanMs").value)||800;
      u.settings.span.font = Number($("#spanFont").value)||110;
      saveState();
    });
  });
}

function bindFix(){
  $("#btnFixLoadText").addEventListener("click", ()=> fixLoadText().catch(err=>{
    $("#fixStatus").textContent = `Errore: ${err.message}`;
  }));
  $("#btnFixStart").addEventListener("click", fixStart);
  $("#btnFixPause").addEventListener("click", fixPauseToggle);
  $("#btnFixStop").addEventListener("click", ()=> fixStop(false));

  ["fixMs","fixLaps","fixCols","fixRows","fixMode","fixSegLen","fixLang","fixSource","fixCustomText"].forEach(id=>{
    $("#"+id).addEventListener("change", ()=>{
      const u = getActiveUser();
      u.settings.fixation = {
        ms: Number($("#fixMs").value)||250,
        laps: Number($("#fixLaps").value)||2,
        cols: Number($("#fixCols").value)||3,
        rows: Number($("#fixRows").value)||10,
        mode: $("#fixMode").value,
        segLen: Number($("#fixSegLen").value)||20,
        lang: $("#fixLang").value,
        source: $("#fixSource").value,
        customText: $("#fixCustomText").value || "",
      };
      saveState();
    });
  });
}

function bindData(){
  $("#btnWipeUser").addEventListener("click", ()=>{
    const u = getActiveUser();
    if(confirm(`Azzero tutte le sessioni per ${u.name}?`)){
      wipeUser(u.id);
    }
  });
  $("#btnWipeAll").addEventListener("click", ()=>{
    if(confirm("Azzero TUTTI i dati (tutti gli utenti)?")){
      wipeAll();
    }
  });
}

function bindSettings(){
  $("#btnOpenSync").addEventListener("click", openSettings);
  $("#btnConnectSync").addEventListener("click", ()=> syncConnect().catch(err=> alert(err.message)));
  $("#btnPullSync").addEventListener("click", ()=> syncPull().catch(err=> alert(err.message)));
  $("#btnDisconnectSync").addEventListener("click", ()=> syncDisconnect().catch(err=> alert(err.message)));
  $("#btnSaveSettings").addEventListener("click", saveSettings);
}

// ---------- render all ----------
function applyUserSettingsToForm(){
  const u = getActiveUser();

  applyReaderAdaptiveParams(u);
  const lvl = computeReaderLevel(u);
  const rs = u.settings.reader || defaultUserSettings().reader;
  $("#readerLang").value = rs.lang || "it";
  $("#readerMode").value = rs.mode || "rsvp";
  $("#readerWpm").value = String(rs.wpm ?? lvl.baseWpm);
  $("#readerChunk").value = String(rs.chunk ?? 3);
  $("#readerMinWords").value = String(rs.minWords ?? lvl.minWords);
  $("#readerSource").value = rs.source || "wiki";
  $("#readerCustomText").value = rs.customText || "";

  const spl = computeSpanLevel(u);
  const sp = u.settings.span || defaultUserSettings().span;
  sp.profile = normalizeSpanProfile(sp.profile || {});
  $("#spanMs").value = String(clamp(Number(sp.ms ?? spl.ms), 40, 3000));
  $("#spanFont").value = String(sp.font ?? 110);
  spanApplyFont();
  renderSpanStatus();

  applyFixAdaptiveParams(u);
  const fxl = computeFixLevel(u);
  const fx = u.settings.fixation || defaultUserSettings().fixation;
  $("#fixMs").value = String(fx.ms ?? fxl.ms);
  $("#fixLaps").value = String(fx.laps ?? fxl.laps);
  $("#fixCols").value = String(fx.cols ?? 3);
  $("#fixRows").value = String(fx.rows ?? fxl.rows);
  $("#fixMode").value = fx.mode ?? "dots";
  $("#fixSegLen").value = String(fx.segLen ?? 20);
  $("#fixLang").value = fx.lang ?? "it";
  $("#fixSource").value = fx.source ?? "wiki";
  $("#fixCustomText").value = fx.customText || "";
}

function rerenderDashboard(){
  renderGoal();
  renderTextMeta();
  renderCharts();
  renderRecent();
}

function rerenderAll(){
  renderUserSelect();
  applyUserSettingsToForm();
  rerenderDashboard();
  renderSyncStatus();
  // stop exercises if needed
  if(STATE.ui.debug){
    console.log("STATE", STATE);
  }
}

function boot(){
  bindNav();
  bindTopbar();
  bindDashboard();
  bindReader();
  bindSpan();
  bindFix();
  bindData();
  bindSettings();

  syncInit().finally(()=>{
    rerenderAll();
  });

  showView("dashboard");
  readerResetRuntime();
}

boot();
