import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDocx } from './validate';

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/docx');
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, `${name}.docx`)));

describe('validateDocx', () => {
  it.each(['basic-formatting', 'tables', 'empty-document', 'long-document', 'libreoffice/lo-lists'])(
    'accepts %s',
    (name) => {
      expect(validateDocx(fixture(name))).toEqual({ ok: true });
    },
  );

  it.each([
    ['malformed-not-a-zip', 'damaged or not a Word document'],
    ['malformed-truncated', 'damaged or not a Word document'],
    ['malformed-missing-document', 'has no document body'],
  ])('rejects %s with a readable reason', (name, why) => {
    const result = validateDocx(fixture(name));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(why);
  });

  it('rejects an empty file', () => {
    expect(validateDocx(new Uint8Array())).toEqual({ ok: false, reason: 'The file is empty.' });
  });
});
