import { createPasswordAuth, verifyPasswordAuth } from './account-auth.js';

export function createAccountRecord(name, password, idFactory){
  if(!name || !String(name).trim()) throw new Error('name_required');
  if(String(password || '').length < 4) throw new Error('password_required');
  return {
    id: idFactory(),
    name: String(name).trim(),
    createdAt: new Date().toISOString(),
    sessions: [],
    auth: createPasswordAuth(password),
  };
}

export function canLogin(user, password){
  return verifyPasswordAuth(user?.auth, password);
}

export function deleteAccountWithPassword(users, userId, password){
  const u = users.find(x=>x.id===userId);
  if(!u) throw new Error('user_not_found');
  if(!verifyPasswordAuth(u.auth, password)) throw new Error('password_invalid');
  return users.filter(x=>x.id!==userId);
}
