import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateReaderDb, buildReaderRenderModel, isExactCorrectAnswer } from './reader-quiz.js';

const db = JSON.parse(fs.readFileSync(new URL('./data/lettura_veloce_santi_it_v1.json', import.meta.url), 'utf8'));

test('each question has exactly one correct answer via correctIndex', ()=>{
  const valid = validateReaderDb(db);
  for(const item of valid.items){
    for(const q of item.questions){
      assert.ok(Number.isInteger(q.correctIndex));
      assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length);
      const correct = q.options[q.correctIndex];
      const occurrences = q.options.filter(x=>x===correct).length;
      assert.equal(occurrences, 1);
    }
  }
});

test('quasi-correct options are not accepted', ()=>{
  const item = db.items[0];
  const model = buildReaderRenderModel(item, 20);
  const q = model.questions.find(x=>x.prompt.includes('parola è presente nel testo'));
  assert.ok(q);
  assert.equal(isExactCorrectAnswer(q, 'ricevata'), false);
  assert.equal(isExactCorrectAnswer(q, 'ricevuto'), true);
});

test('render model provides text and 20 questions', ()=>{
  const item = db.items[0];
  const model = buildReaderRenderModel(item, 20);
  assert.ok(model.text.length > 200);
  assert.equal(model.questions.length, 20);
  assert.equal(model.questionCount, 20);
});
