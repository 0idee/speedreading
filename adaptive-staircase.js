export function defaultStaircaseState(options = {}){
  const nDown = clampInt(options.nDown, 2, 4, 3);
  return {
    nDown,
    stepSize: clampNum(options.stepSize, 0.25, 3, 1),
    lastDirection: null,
    inversions: clampInt(options.inversions, 0, 99, 0),
    upStreak: clampInt(options.upStreak, 0, 99, 0),
    downStreak: clampInt(options.downStreak, 0, 99, 0),
  };
}

export function normalizeStaircaseState(state = {}, options = {}){
  const base = defaultStaircaseState(options);
  const merged = { ...base, ...(state || {}) };
  merged.nDown = clampInt(merged.nDown, 2, 4, base.nDown);
  merged.stepSize = clampNum(merged.stepSize, 0.25, 3, base.stepSize);
  merged.lastDirection = (merged.lastDirection === 'harder' || merged.lastDirection === 'easier') ? merged.lastDirection : null;
  merged.inversions = clampInt(merged.inversions, 0, 99, 0);
  merged.upStreak = clampInt(merged.upStreak, 0, 99, 0);
  merged.downStreak = clampInt(merged.downStreak, 0, 99, 0);
  return merged;
}

export function staircaseDirectionFromScore(score, options = {}){
  const threshold = clampNum(options.successThreshold, 0.4, 1, 0.8);
  return Number(score) >= threshold ? 'harder' : 'easier';
}

export function updateStaircase(state, direction, options = {}){
  const s = normalizeStaircaseState(state, options);
  const dir = direction === 'harder' ? 'harder' : 'easier';
  const oldDirection = s.lastDirection;

  if(dir === 'harder'){
    s.upStreak += 1;
    s.downStreak = 0;
  }else{
    s.downStreak += 1;
    s.upStreak = 0;
  }

  let outputDirection = 'none';
  if(dir === 'harder' && s.upStreak >= s.nDown){
    outputDirection = 'harder';
    s.upStreak = 0;
  }else if(dir === 'easier'){
    outputDirection = 'easier';
    s.downStreak = 0;
  }

  if(outputDirection !== 'none'){
    if(oldDirection && oldDirection !== outputDirection){
      s.inversions += 1;
      if(s.inversions >= 2 && s.stepSize > 0.25){
        s.stepSize = clampNum(s.stepSize * 0.75, 0.25, 3, 1);
      }
    }
    s.lastDirection = outputDirection;
  }

  return { state: s, direction: outputDirection, stepSize: s.stepSize };
}

function clampNum(v, min, max, fallback){
  const n = Number(v);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(v, min, max, fallback){
  return Math.round(clampNum(v, min, max, fallback));
}
