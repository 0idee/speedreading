export function validateReaderDb(db){
  if(!db || typeof db !== 'object') throw new Error('Reader DB non valido');
  if(!Array.isArray(db.items) || !db.items.length) throw new Error('Reader DB senza items');
  db.items.forEach(validateReaderItem);
  return db;
}

export function validateReaderItem(item){
  if(!item || typeof item !== 'object') throw new Error('Item non valido');
  if(typeof item.text !== 'string' || !item.text.trim()) throw new Error('Item senza testo');
  if(!Array.isArray(item.questions)) throw new Error('Item senza domande');
  item.questions.forEach(validateQuestion);
  return item;
}

export function validateQuestion(q){
  if(typeof q?.prompt !== 'string' || !q.prompt.trim()) throw new Error('Domanda senza prompt');
  if(!Array.isArray(q.options) || q.options.length < 2) throw new Error('Domanda senza opzioni valide');
  if(!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length){
    throw new Error('correctIndex non valido');
  }
  return q;
}

export function normalizeQuestions(questions, maxCount = 20){
  const out = questions.slice(0, maxCount).map((q)=>({
    id: q.id || crypto.randomUUID?.() || `q_${Math.random().toString(16).slice(2)}`,
    prompt: q.prompt,
    opts: q.options.map(String),
    correct: String(q.options[q.correctIndex]),
    correctIndex: q.correctIndex,
    chosen: null,
  }));
  return out;
}

export function isExactCorrectAnswer(question, selected){
  if(!question || !Array.isArray(question.opts)) return false;
  const i = question.opts.findIndex((x)=> String(x) === String(selected));
  return i === question.correctIndex;
}

export function buildReaderRenderModel(item, questionCount = 20){
  const qs = normalizeQuestions(item.questions, questionCount);
  return {
    title: item.title || 'Testo database',
    text: item.text,
    questions: qs,
    questionCount: qs.length,
  };
}
