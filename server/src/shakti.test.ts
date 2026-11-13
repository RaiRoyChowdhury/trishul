import { describe, expect, it } from 'vitest';
import { bookable } from './routes/shakti.js';
const v = { is_demo: false, verification_status: 'verified', training_status: 'completed', safeguarding_status: 'cleared', available: true };
describe('Shakti volunteers are bookable only when fully cleared', () => {
  it('fully cleared', () => expect(bookable(v)).toBe(true));
  it('missing any one step', () => { for (const o of [{ verification_status: 'pending' }, { training_status: 'in_progress' }, { safeguarding_status: 'pending' }, { available: false }]) expect(bookable({ ...v, ...o })).toBe(false); });
});
