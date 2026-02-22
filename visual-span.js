export const SPAN_MIN_LENGTH = 4;
export const SPAN_MAX_LENGTH = 14;
export const SPAN_SUCCESS_STREAK = 3;

const DIGITS = "0123456789";
const UPPERCASE = "ABCDEFGHIJKLMNPQRSTUVWXYZ"; // no O
const LOWERCASE = "abcdefghijklmnpqrstuvwxyz"; // no o
const SPECIALS = ".,;:!?-_()[]{}\\/@#$%&*+=";

export function getStageCharset(stage){
  const s = Number(stage) || 1;
  if(s <= 1) return DIGITS;
  if(s === 2) return DIGITS + UPPERCASE;
  if(s === 3) return DIGITS + UPPERCASE + LOWERCASE;
  return DIGITS + UPPERCASE + LOWERCASE + SPECIALS;
}

export function defaultSpanProfile(){
  return {
    currentStage: 1,
    currentLength: SPAN_MIN_LENGTH,
    bestStageReached: 1,
    bestLengthReached: SPAN_MIN_LENGTH,
    lastSessionAt: null,
    rollingResults: [],
    successStreak: 0,
    promotionStreaksAt10: 0,
    cooldown: 0,
  };
}

export function normalizeSpanProfile(profile={}){
  const base = defaultSpanProfile();
  const p = { ...base, ...(profile || {}) };
  p.currentStage = clampInt(p.currentStage, 1, 4, 1);
  p.currentLength = clampInt(p.currentLength, SPAN_MIN_LENGTH, SPAN_MAX_LENGTH, SPAN_MIN_LENGTH);
  p.bestStageReached = clampInt(Math.max(p.bestStageReached || 1, p.currentStage), 1, 4, p.currentStage);
  p.bestLengthReached = clampInt(Math.max(p.bestLengthReached || SPAN_MIN_LENGTH, p.currentLength), SPAN_MIN_LENGTH, SPAN_MAX_LENGTH, p.currentLength);
  p.successStreak = clampInt(p.successStreak, 0, 999, 0);
  p.promotionStreaksAt10 = clampInt(p.promotionStreaksAt10, 0, 10, 0);
  p.cooldown = clampInt(p.cooldown, 0, 5, 0);
  p.rollingResults = Array.isArray(p.rollingResults) ? p.rollingResults.slice(-10) : [];
  return p;
}

export function generateSpanStimulus({ stage, length, random = Math.random }){
  const charset = getStageCharset(stage);
  const L = clampInt(length, SPAN_MIN_LENGTH, SPAN_MAX_LENGTH, SPAN_MIN_LENGTH);
  let out = "";
  for(let i=0; i<L; i++){
    out += charset[Math.floor(random() * charset.length)];
  }
  return out;
}

export function evaluateSpanAttempt(expected, typed){
  return String(expected || "") === String(typed || "").trim();
}

export function updateSpanProgress(profile, wasCorrect, options={}){
  const nSuccess = clampInt(options.successStreakToGrow, 2, 10, SPAN_SUCCESS_STREAK);
  const p = normalizeSpanProfile(profile);

  if(wasCorrect){
    p.successStreak += 1;
    if(p.cooldown > 0){
      p.cooldown -= 1;
    } else if(p.successStreak >= nSuccess){
      if(p.currentStage < 4 && p.currentLength >= 10){
        p.promotionStreaksAt10 += 1;
        p.successStreak = 0;
        if(p.promotionStreaksAt10 >= 2){
          p.currentStage += 1;
          p.currentLength = Math.max(SPAN_MIN_LENGTH, p.currentLength - 2);
          p.promotionStreaksAt10 = 0;
          p.cooldown = 1;
        }
      } else {
        const nextLen = Math.min(SPAN_MAX_LENGTH, p.currentLength + 1);
        if(nextLen !== p.currentLength){
          p.currentLength = nextLen;
          p.cooldown = 1;
        }
        p.successStreak = 0;
      }
    }
  } else {
    p.successStreak = 0;
    p.promotionStreaksAt10 = 0;
    if(p.cooldown > 0){
      p.cooldown -= 1;
    } else {
      const nextLen = Math.max(SPAN_MIN_LENGTH, p.currentLength - 1);
      if(nextLen !== p.currentLength){
        p.currentLength = nextLen;
        p.cooldown = 1;
      }
    }
  }

  p.bestStageReached = Math.max(p.bestStageReached, p.currentStage);
  p.bestLengthReached = Math.max(p.bestLengthReached, p.currentLength);
  return p;
}

export function pushSpanRollingResult(profile, result){
  const p = normalizeSpanProfile(profile);
  p.rollingResults = [...p.rollingResults, {
    ok: !!result.ok,
    stage: p.currentStage,
    length: p.currentLength,
    at: result.at || new Date().toISOString(),
  }].slice(-10);
  return p;
}

function clampInt(value, min, max, fallback){
  const n = Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
