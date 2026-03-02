import { defaultAdaptiveProfile, normalizeAdaptiveProfile, pushRollingResult, rollingAccuracy } from './adaptive-glicko.js';

export const SPAN_MIN_LENGTH = 4;
export const SPAN_MAX_LENGTH = 14;
export const SPAN_MIN_MS = 80;
export const SPAN_MAX_MS = 1200;

const DIGITS = '0123456789';
const UPPERCASE = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'; // no O
const LOWERCASE = 'abcdefghijklmnpqrstuvwxyz'; // no o
const SPECIALS = '.,;:!?-_()[]{}\\/@#$%&*+=';

export function getStageCharset(stage){
  const s = Number(stage) || 1;
  if(s <= 1) return DIGITS;
  if(s === 2) return DIGITS + UPPERCASE;
  if(s === 3) return DIGITS + UPPERCASE + LOWERCASE;
  return DIGITS + UPPERCASE + LOWERCASE + SPECIALS;
}

export function spanDefaultParams(){
  return { length: 4, exposureMs: 800, stage: 1 };
}

export function defaultSpanProfile(){
  return {
    profileAdaptive: defaultAdaptiveProfile(spanDefaultParams()),
    lastSessionAt: null,
    bestStageReached: 1,
    bestLengthReached: SPAN_MIN_LENGTH,
    rollingResults: [],
    stageHoldWindows: 0,
    stageCooldown: 0,
  };
}

export function normalizeSpanProfile(profile = {}){
  const base = defaultSpanProfile();
  const p = { ...base, ...(profile || {}) };
  p.profileAdaptive = normalizeAdaptiveProfile(p.profileAdaptive, spanDefaultParams());
  p.profileAdaptive.currentParams = normalizeSpanParams(p.profileAdaptive.currentParams || spanDefaultParams());
  p.profileAdaptive.bestParams = normalizeSpanParams(p.profileAdaptive.bestParams || p.profileAdaptive.currentParams);
  p.lastSessionAt = p.lastSessionAt || null;
  p.bestStageReached = clampInt(Math.max(p.bestStageReached || 1, p.profileAdaptive.currentParams.stage), 1, 4, 1);
  p.bestLengthReached = clampInt(Math.max(p.bestLengthReached || 4, p.profileAdaptive.currentParams.length), SPAN_MIN_LENGTH, SPAN_MAX_LENGTH, 4);
  p.rollingResults = Array.isArray(p.rollingResults) ? p.rollingResults.slice(-10) : [];
  p.stageHoldWindows = clampInt(p.stageHoldWindows, 0, 10, 0);
  p.stageCooldown = clampInt(p.stageCooldown, 0, 5, 0);
  return p;
}

export function normalizeSpanParams(params = {}){
  const stage = clampInt(params.stage, 1, 4, 1);
  return {
    stage,
    length: clampInt(params.length, SPAN_MIN_LENGTH, SPAN_MAX_LENGTH, SPAN_MIN_LENGTH),
    exposureMs: clampInt(params.exposureMs, SPAN_MIN_MS, SPAN_MAX_MS, 800),
  };
}

export function generateSpanStimulus({ stage, length, random = Math.random }){
  const charset = getStageCharset(stage);
  const L = clampInt(length, SPAN_MIN_LENGTH, SPAN_MAX_LENGTH, SPAN_MIN_LENGTH);
  let out = '';
  for(let i = 0; i < L; i++) out += charset[Math.floor(random() * charset.length)];
  return out;
}

export function evaluateSpanAttempt(expected, typed){
  return String(expected || '') === String(typed || '').trim();
}

export function spanPartialScore(expected, typed){
  const a = String(expected || '');
  const b = String(typed || '').trim();
  if(!a.length) return 0;
  const d = levenshtein(a, b);
  return clampNum(1 - (d / a.length), 0, 1, 0);
}

export function spanItemRating(params){
  const p = normalizeSpanParams(params);
  const a = 52;
  const b = 84;
  const c = 130;
  return 1000 + a * (p.length - 4) + b * Math.log2(800 / p.exposureMs) + c * (p.stage - 1);
}

export function buildSpanCandidates(params, options = {}){
  const current = normalizeSpanParams(params);
  const lengthSteps = options.lengthSteps || [-1, 0, 1];
  const msSteps = options.msSteps || [120, 60, 0, -40, -80];
  const out = [];
  for(const dL of lengthSteps){
    for(const dMs of msSteps){
      out.push(normalizeSpanParams({ ...current, length: current.length + dL, exposureMs: current.exposureMs + dMs }));
    }
  }
  return dedupeParams(out);
}

export function maybePromoteSpanStage(profile){
  const p = normalizeSpanProfile(profile);
  const adaptive = p.profileAdaptive;
  const current = normalizeSpanParams(adaptive.currentParams);
  const acc = rollingAccuracy(adaptive.rollingResults);

  if(p.stageCooldown > 0){
    p.stageCooldown -= 1;
    return p;
  }

  const stable = Number.isFinite(acc) && acc >= 0.8 && current.length >= 10 && adaptive.RD_user < 160;
  if(stable) p.stageHoldWindows += 1;
  else p.stageHoldWindows = 0;

  if(stable && p.stageHoldWindows >= 2 && current.stage < 4){
    const next = normalizeSpanParams({
      ...current,
      stage: current.stage + 1,
      length: current.length - 2,
      exposureMs: current.exposureMs + 160,
    });
    adaptive.currentParams = next;
    p.stageCooldown = 2;
    p.stageHoldWindows = 0;
  }

  p.profileAdaptive = adaptive;
  p.bestStageReached = Math.max(p.bestStageReached, p.profileAdaptive.currentParams.stage);
  p.bestLengthReached = Math.max(p.bestLengthReached, p.profileAdaptive.currentParams.length);
  return p;
}

export function pushSpanRollingResult(profile, score, meta = {}){
  const p = normalizeSpanProfile(profile);
  p.profileAdaptive = pushRollingResult(p.profileAdaptive, score, meta);
  p.rollingResults = [...p.rollingResults, { S: score, ...meta }].slice(-10);
  p.bestStageReached = Math.max(p.bestStageReached, p.profileAdaptive.currentParams.stage);
  p.bestLengthReached = Math.max(p.bestLengthReached, p.profileAdaptive.currentParams.length);
  return p;
}

function dedupeParams(items){
  const seen = new Set();
  return items.filter((it)=>{
    const key = `${it.stage}|${it.length}|${it.exposureMs}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function levenshtein(a, b){
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for(let i = 0; i <= m; i++) dp[i][0] = i;
  for(let j = 0; j <= n; j++) dp[0][j] = j;
  for(let i = 1; i <= m; i++){
    for(let j = 1; j <= n; j++){
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function clampNum(v, min, max, fallback){
  const n = Number(v);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(v, min, max, fallback){
  return Math.round(clampNum(v, min, max, fallback));
}
