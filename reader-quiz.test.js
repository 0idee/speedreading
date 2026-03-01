import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateReaderDb, buildReaderRenderModel, isExactCorrectAnswer } from './reader-quiz.js';

const db = JSON.parse(fs.readFileSync(new URL('./data/lettura_veloce_santi_it_v1.json', import.meta.url), 'utf8'));

test('for each DB question there is exactly one correct answer', ()=>{
  const valid = validateReaderDb(db);
  for(const item of valid.items){
    for(const q of item.questions){
      assert.equal(q.options.length, 4);
      assert.ok(Number.isInteger(q.correctIndex));
      const correct = q.options[q.correctIndex];
      assert.equal(q.options.filter(x=>x===correct).length, 1);
    }
  }
});

test('near_miss option is never accepted as correct', ()=>{
  const item = db.items[0];
  const model = buildReaderRenderModel(item, 4);
  const source = validateReaderDb(db).items[0];
  const qSrc = source.questions.find(x=>x.prompt.includes('parola è presente nel testo'));
  const q = {
    prompt: qSrc.prompt,
    opts: qSrc.options,
    correctIndex: qSrc.correctIndex,
  };
  assert.equal(isExactCorrectAnswer(q, 'ricevata'), false);
  assert.equal(isExactCorrectAnswer(q, 'ricevuto'), true);
  assert.equal(model.questions.length, 4);
});

test('if correct index is B only B is correct', ()=>{
  const q = { opts: ['Aopt', 'Bopt', 'Copt', 'Dopt'], correctIndex: 1 };
  assert.equal(isExactCorrectAnswer(q, 'Aopt'), false);
  assert.equal(isExactCorrectAnswer(q, 'Bopt'), true);
  assert.equal(isExactCorrectAnswer(q, 'Copt'), false);
  assert.equal(isExactCorrectAnswer(q, 'Dopt'), false);
});

test('render model uses exactly 4 questions from DB', ()=>{
  const item = db.items[0];
  const model = buildReaderRenderModel(item, 4);
  assert.ok(model.text.length > 200);
  assert.equal(model.questions.length, 4);
  assert.equal(model.questionCount, 4);
  const promptsDb = item.questions.slice(0,4).map(x=>x.prompt);
  const promptsRender = model.questions.map(x=>x.prompt);
  assert.deepEqual(promptsRender, promptsDb);
});
