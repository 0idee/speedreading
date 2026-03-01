export function randomSalt(){
  return Math.random().toString(36).slice(2, 10);
}

export function hashWithSalt(raw, salt){
  const s = `${String(raw || '')}::${String(salt || '')}`;
  let h = 2166136261;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return `pw_${(h >>> 0).toString(16)}`;
}

export function createPasswordAuth(password){
  const salt = randomSalt();
  const passwordHash = hashWithSalt(password, salt);
  return { salt, passwordHash };
}

export function verifyPasswordAuth(auth, candidate){
  if(!auth || typeof auth.passwordHash !== 'string' || typeof auth.salt !== 'string') return false;
  return auth.passwordHash === hashWithSalt(candidate, auth.salt);
}
