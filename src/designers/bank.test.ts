import { describe, expect, it } from 'vitest';
import { bankProblem, questionProblem } from './bank';

describe('question bank', () => {
  const ok = { q: 'Dose?', t: 'radio', op: [{ t: '5 mg', a: 'Yes' }, { t: '9 mg', a: 'No' }] };
  it('checks questions like the web page', () => {
    expect(questionProblem(ok)).toBeNull();
    expect(questionProblem({ ...ok, op: [ok.op[0]] })).toMatch(/two answers/);
    expect(questionProblem({ ...ok, op: ok.op.map((o) => ({ ...o, a: 'No' })) })).toMatch(/correct/);
    expect(bankProblem('Week 1', 0, [ok])).toMatch(/Per Day/);
    expect(bankProblem('', 3, [ok])).toMatch(/Title/);
    expect(bankProblem('Week 1', 3, [ok])).toBeNull();
  });
});
