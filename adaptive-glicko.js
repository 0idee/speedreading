export const GLICKO_DEFAULT_R = 1000;
export const GLICKO_DEFAULT_RD = 250;

const R_MIN = 600;
const R_MAX = 1800;
const RD_MIN = 60;
const RD_MAX = 350;
const RD_ITEM = 80;

export function defaultAdaptiveProfile(currentParams){
  return {
    R_user: GLICKO_DEFAULT_R,
    RD_user: GLICKO_DEFAULT_RD,
    attempts_count: 0,
    currentParams: { ...currentParams },
    bestParams: { ...currentParams },
    lastSessionAt: null,
    rollingResults: [],
    fatigueBias: 0,
    cooldown: 0,
  };
}

export function normalizeAdaptiveProfile(profile, fallbackParams){
  const base = defaultAdaptiveProfile(fallbackParams);
  const p = { ...base, ...(profile || {}) };
  p.R_user = clampNum(p.R_user, R_MIN, R_MAX, GLICKO_DEFAULT_R);
  p.RD_user = clampNum(p.RD_user, RD_MIN, RD_MAX, GLICKO_DEFAULT_RD);
  p.attempts_count = clampNum(p.attempts_count, 0, 1e9, 0);
  p.currentParams = { ...base.currentParams, ...(p.currentParams || {}) };
  p.bestParams = { ...base.bestParams, ...(p.bestParams || {}) };
  p.rollingResults = Array.isArray(p.rollingResults) ? p.rollingResults.slice(-10) : [];
  p.fatigueBias = clampNum(p.fatigueBias, -5, 5, 0);
  p.cooldown = clampNum(p.cooldown, 0, 2, 0);
  return p;
}

export function expectedScore(R_user, RD_user, R_item){
  const RD_combined = Math.sqrt(RD_user**2 + RD_ITEM**2);
  const g = 1 / Math.sqrt(1 + (3 * (RD_combined**2)) / (Math.PI**2 * 400**2));
  return 1 / (1 + 10 ** (g * (R_item - R_user) / 400));
}

export function updateGlickoLite({ R_user, RD_user, R_item, S }){
  const E = expectedScore(R_user, RD_user, R_item);
  const K = clampNum(24 * (RD_user / 200), 12, 40, 24);
  const nextR = clampNum(R_user + K * (S - E), R_MIN, R_MAX, GLICKO_DEFAULT_R);
  const surprise = Math.abs(S - E);
  const shrink = 0.97 + 0.03 * surprise;
  const nextRD = clampNum(RD_user * shrink, RD_MIN, RD_MAX, GLICKO_DEFAULT_RD);
  return { R_user: nextR, RD_user: nextRD, E, K };
}

export function targetItemRating(R_user, RD_user){
  const p = 0.75;
  const R_target = R_user - 400 * Math.log10((1/p) - 1);
  return R_target - 0.20 * RD_user;
}

export function selectCandidate({ currentParams, candidates, itemRating, targetRating }){
  if(!candidates?.length) return null;
  const scored = candidates.map(c => ({
    candidate: c,
    dist: Math.abs(itemRating(c) - targetRating),
    delta: paramDistance(currentParams, c),
    easier: itemRating(c) <= targetRating,
  }));
  scored.sort((a,b)=> a.dist-b.dist || a.delta-b.delta || (a.easier===b.easier?0:(a.easier?-1:1)));
  return scored[0].candidate;
}

export function pushRollingResult(profile, S, meta={}){
  const p = { ...profile };
  p.rollingResults = [...(p.rollingResults||[]), { S, ...meta }].slice(-10);
  return p;
}

export function rollingAccuracy(rollingResults){
  if(!rollingResults?.length) return null;
  return rollingResults.reduce((a,r)=>a+(Number(r.S)||0),0) / rollingResults.length;
}

function paramDistance(a,b){
  const keys = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);
  let sum = 0;
  for(const k of keys){
    const x = Number(a?.[k]);
    const y = Number(b?.[k]);
    if(Number.isFinite(x) && Number.isFinite(y)) sum += Math.abs(x-y);
    else if(String(a?.[k]) !== String(b?.[k])) sum += 1;
  }
  return sum;
}

function clampNum(n, min, max, fallback){
  const x = Number(n);
  if(!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
