import { describe, expect, it } from 'vitest';
import { isJudgeEmail, judgeEmails } from './demoMode';
describe('judge account list', () => {
  const list = judgeEmails(' Judge@Example.com , second@x.in ,, ');
  it('parses, trims and lowercases', () => { expect(list).toEqual(['judge@example.com', 'second@x.in']); });
  it('matches ignoring case', () => { expect(isJudgeEmail('JUDGE@example.com', list)).toBe(true); });
  it('other emails and empty values are not judges', () => { expect(isJudgeEmail('me@example.com', list)).toBe(false); expect(isJudgeEmail(null, list)).toBe(false); expect(isJudgeEmail('x', [])).toBe(false); });
});
