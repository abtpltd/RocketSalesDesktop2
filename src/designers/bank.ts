import type { BankQuestion } from '../api/types';

/** The checks js/api/QuestionBankApi.js makes when a question is added and when the bank is saved. */
export function questionProblem(q: BankQuestion): string | null {
  if (!q.q.trim()) return 'Question missing';
  if (q.t !== 'checkbox' && q.t !== 'radio') return 'Type missing.';
  if (q.op.length < 2) return 'There must be two answers.';
  if (q.op.some((o) => !String(o.t).trim() || (o.a !== 'Yes' && o.a !== 'No'))) return 'Every answer needs a text and Is Answer Yes or No.';
  if (!q.op.some((o) => o.a === 'Yes')) return 'One answer must be correct.';
  return null;
}

export function bankProblem(title: string, perday: number, questions: BankQuestion[]): string | null {
  if (!questions.length) return 'No Question Added!';
  if (!perday || perday < 1) return 'Per Day Missing!';
  if (!title.trim()) return 'Title Missing!';
  for (let i = 0; i < questions.length; i++) {
    const p = questionProblem(questions[i]);
    if (p) return `Question ${i + 1}: ${p}`;
  }
  return null;
}
