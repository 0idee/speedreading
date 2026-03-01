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

function fromLetterQuestion(q){
  const opts = [q.A, q.B, q.C, q.D].map(x=> String(x || ''));
  if(opts.some(x=>!x.trim())) throw new Error('Opzioni A/B/C/D incomplete');
  const correctMap = { A:0, B:1, C:2, D:3 };
  const key = String(q.correct || '').toUpperCase();
  if(!(key in correctMap)) throw new Error('correct deve essere A/B/C/D');
  return { prompt: q.prompt, options: opts, correctIndex: correctMap[key] };
}

export function validateQuestion(q){
  if(typeof q?.prompt !== 'string' || !q.prompt.trim()) throw new Error('Domanda senza prompt');

  const hasABCD = ['A','B','C','D'].every(k => k in q);
  if(hasABCD){
    return fromLetterQuestion(q);
  }

  if(!Array.isArray(q.options) || q.options.length !== 4) throw new Error('Domanda deve avere 4 opzioni');
  if(!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length){
    throw new Error('correctIndex non valido');
  }
  return q;
}

export function normalizeQuestions(questions, maxCount = 4){
  const normalized = questions.map((q)=>{
    const fixed = validateQuestion(q);
    const opts = fixed.options.map(String);
    return {
      id: fixed.id || crypto.randomUUID?.() || `q_${Math.random().toString(16).slice(2)}`,
      prompt: fixed.prompt,
      opts,
      correctIndex: fixed.correctIndex,
      chosen: null,
    };
  });
  return normalized.slice(0, maxCount);
}

export function buildReaderRenderModel(item, questionCount = 4){
  const qs = normalizeQuestions(item.questions, questionCount);
  return {
    title: item.title || 'Testo database',
    text: item.text,
    questions: qs,
    questionCount: qs.length,
  };
}

export function isExactCorrectAnswer(question, selected){
  if(!question || !Array.isArray(question.opts)) return false;
  const i = question.opts.findIndex((x)=> String(x) === String(selected));
  return i === question.correctIndex;
}
