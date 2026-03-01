import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRecord, canLogin, deleteAccountWithPassword, changePassword } from './account-state.js';

test('create account requires password and email; login requires password', ()=>{
  assert.throws(()=> createAccountRecord('Mario', '123', 'mario@example.com', ()=> 'u1'));
  assert.throws(()=> createAccountRecord('Mario', '1234', 'not-an-email', ()=> 'u1'));
  const u = createAccountRecord('Mario', '1234', 'mario@example.com', ()=> 'u1');
  assert.equal(canLogin(u, '1234'), true);
  assert.equal(canLogin(u, 'wrong'), false);
});

test('change password requires current password and updates login', ()=>{
  const u = createAccountRecord('A', '1111', 'a@example.com', ()=> 'u1');
  assert.throws(()=> changePassword(u, 'xxx', '2222'));
  const upd = changePassword(u, '1111', '2222');
  assert.equal(canLogin(upd, '1111'), false);
  assert.equal(canLogin(upd, '2222'), true);
});

test('delete account requires matching password', ()=>{
  const u1 = createAccountRecord('A', '1111', 'a@example.com', ()=> 'u1');
  const u2 = createAccountRecord('B', '2222', 'b@example.com', ()=> 'u2');
  assert.throws(()=> deleteAccountWithPassword([u1,u2], 'u1', 'x'));
  const after = deleteAccountWithPassword([u1,u2], 'u1', '1111');
  assert.equal(after.length, 1);
  assert.equal(after[0].id, 'u2');
});

test('delete last account returns no-account state (empty users)', ()=>{
  const u1 = createAccountRecord('Solo', '1111', 'solo@example.com', ()=> 'u1');
  const after = deleteAccountWithPassword([u1], 'u1', '1111');
  assert.equal(after.length, 0);
});
