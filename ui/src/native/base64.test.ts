import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64', () => {
  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('matches the standard encoding', () => {
    expect(bytesToBase64(new TextEncoder().encode('PK'))).toBe('UEs=');
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });

  it('handles inputs larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
