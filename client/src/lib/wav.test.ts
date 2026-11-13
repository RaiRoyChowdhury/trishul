import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

describe('encodeWav', () => {
  it('writes a valid mono 16-bit header and clamps samples', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 24000);
    const v = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(36)]).toEqual(['RIFF', 'WAVE', 'data']);
    expect(blob.size).toBe(44 + 10); expect(v.getUint16(22, true)).toBe(1); expect(v.getUint32(24, true)).toBe(24000); expect(v.getUint16(34, true)).toBe(16);
    expect([v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true), v.getInt16(52, true)]).toEqual([32767, -32768, 32767, -32768]);
  });
});
