import { createPasswordAuth, verifyPasswordAuth } from './account-auth.js';

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function createAccountRecord(name, password, email, idFactory){
  if(!name || !String(name).trim()) throw new Error('name_required');
  if(String(password || '').length < 4) throw new Error('password_required');
  if(!isValidEmail(email)) throw new Error('email_required');
  return {
    id: idFactory(),
    name: String(name).trim(),
    email: String(email).trim(),
    createdAt: new Date().toISOString(),
    sessions: [],
    auth: createPasswordAuth(password),
  };
}

export function canLogin(user, password){
  return verifyPasswordAuth(user?.auth, password);
}

export function changePassword(user, oldPassword, newPassword){
  if(!verifyPasswordAuth(user?.auth, oldPassword)) throw new Error('password_invalid');
  if(String(newPassword || '').length < 4) throw new Error('password_too_short');
  return { ...user, auth: createPasswordAuth(newPassword) };
}

export function deleteAccountWithPassword(users, userId, password){
  const u = users.find(x=>x.id===userId);
  if(!u) throw new Error('user_not_found');
  if(!verifyPasswordAuth(u.auth, password)) throw new Error('password_invalid');
  return users.filter(x=>x.id!==userId);
}
