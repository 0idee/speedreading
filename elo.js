export const ELO_DEFAULTS = {
  R_USER_START: 1000,
  RD_USER_START: 250,
  R_MIN: 100,
  R_MAX: 3000,
  RD_MIN: 60,
  RD_MAX: 350,
  K_BASE: 28,
};

const CHARSET_WEIGHTS = {
  az: 0,
  AZ: 30,
  n09: 45,
  us: 20,
};

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

export function normalizeUserRating(raw = {}){
  return {
    R_user: clamp(Number(raw.R_user) || ELO_DEFAULTS.R_USER_START, ELO_DEFAULTS.R_MIN, ELO_DEFAULTS.R_MAX),
    RD_user: clamp(Number(raw.RD_user) || ELO_DEFAULTS.RD_USER_START, ELO_DEFAULTS.RD_MIN, ELO_DEFAULTS.RD_MAX),
  };
}

export function computeItemRating({ length = 4, charset = {} } = {}){
  const len = clamp(Number(length) || 4, 1, 24);
  const complexity = Object.entries(CHARSET_WEIGHTS)
    .reduce((acc,[k,w])=> acc + (charset[k] ? w : 0), 0);
  const density = Math.max(0, (len - 3) * 42);
  return clamp(780 + complexity + density, ELO_DEFAULTS.R_MIN, ELO_DEFAULTS.R_MAX);
}

export function expectedScore(R_user, RD_user, R_item){
  const scale = 400 + clamp(Number(RD_user) || ELO_DEFAULTS.RD_USER_START, ELO_DEFAULTS.RD_MIN, ELO_DEFAULTS.RD_MAX);
  return 1 / (1 + (10 ** ((R_item - R_user) / scale)));
}

export function updateUserRating({ R_user, RD_user, R_item, score }){
  const r = clamp(Number(R_user), ELO_DEFAULTS.R_MIN, ELO_DEFAULTS.R_MAX);
  const rd = clamp(Number(RD_user), ELO_DEFAULTS.RD_MIN, ELO_DEFAULTS.RD_MAX);
  const s = clamp(Number(score), 0, 1);
  const e = expectedScore(r, rd, Number(R_item));

  const confidence = 1 - ((rd - ELO_DEFAULTS.RD_MIN) / (ELO_DEFAULTS.RD_MAX - ELO_DEFAULTS.RD_MIN));
  const K = ELO_DEFAULTS.K_BASE * (0.65 + (1 - confidence));
  const nextR = clamp(r + K * (s - e), ELO_DEFAULTS.R_MIN, ELO_DEFAULTS.R_MAX);

  const error = Math.abs(s - e);
  const nextRD = clamp(Math.sqrt((rd * rd) * (0.88 + error * 0.08)), ELO_DEFAULTS.RD_MIN, ELO_DEFAULTS.RD_MAX);

  return {
    R_user: nextR,
    RD_user: nextRD,
    expected: e,
    margin: nextRD,
  };
}

export function selectNextItem({ userRating, itemPool }){
  const u = normalizeUserRating(userRating);
  const pool = (itemPool || []).filter(Boolean);
  if(!pool.length) return null;

  const scored = pool.map(item=>{
    const R_item = Number.isFinite(item.R_item) ? item.R_item : computeItemRating(item);
    const distance = Math.abs(R_item - u.R_user);
    const uncertaintyBias = u.RD_user * 0.3;
    const score = Math.abs(distance - uncertaintyBias);
    return { item, R_item, score };
  }).sort((a,b)=>a.score-b.score);

  const top = scored.slice(0, Math.min(3, scored.length));
  const pick = top[Math.floor(Math.random()*top.length)];
  return { ...pick.item, R_item: pick.R_item };
}

export function buildSpanItemPool(){
  const lengths = [3,4,5,6,7,8,9,10,11,12];
  const charsets = [
    { az:true, AZ:false, n09:false, us:false },
    { az:true, AZ:true, n09:false, us:false },
    { az:true, AZ:true, n09:true, us:false },
    { az:true, AZ:true, n09:true, us:true },
  ];
  const out = [];
  for(const length of lengths){
    for(const charset of charsets){
      out.push({ length, charset, R_item: computeItemRating({ length, charset }) });
    }
  }
  return out;
}
