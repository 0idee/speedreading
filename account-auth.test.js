import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordAuth, verifyPasswordAuth } from './account-auth.js';
import { createAccountRecord, canLogin, deleteAccountWithPassword } from './account-state.js';

test('create account requires password and login requires password', ()=>{
  assert.throws(()=> createAccountRecord('Mario', '123', ()=> 'u1'));
  const u = createAccountRecord('Mario', '1234', ()=> 'u1');
  assert.equal(canLogin(u, '1234'), true);
  assert.equal(canLogin(u, 'wrong'), false);
});

test('delete account requires matching password', ()=>{
  const u1 = createAccountRecord('A', '1111', ()=> 'u1');
  const u2 = createAccountRecord('B', '2222', ()=> 'u2');
  assert.throws(()=> deleteAccountWithPassword([u1,u2], 'u1', 'x'));
  const after = deleteAccountWithPassword([u1,u2], 'u1', '1111');
  assert.equal(after.length, 1);
  assert.equal(after[0].id, 'u2');
});

test('delete last account returns no-account state (empty users)', ()=>{
  const u1 = createAccountRecord('Solo', '1111', ()=> 'u1');
  const after = deleteAccountWithPassword([u1], 'u1', '1111');
  assert.equal(after.length, 0);
});
