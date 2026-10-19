import { describe, expect, it } from 'vitest';
import { builtinStyleId } from './styles';

describe('builtinStyleId', () => {
  const word = [
    { styleId: 'Normal', name: 'Normal' },
    { styleId: 'Heading1', name: 'heading 1' },
    { styleId: 'Heading2', name: 'heading 2' },
    { styleId: 'Title', name: 'Title' },
  ];

  it('finds Word ids', () => {
    expect(builtinStyleId(word, 'heading1')).toBe('Heading1');
    expect(builtinStyleId(word, 'normal')).toBe('Normal');
    expect(builtinStyleId(word, 'title')).toBe('Title');
  });

  it('falls back to the built-in name when ids differ', () => {
    const other = [
      { styleId: 'berschrift1', name: 'Heading 1' },
      { styleId: 'Standard', name: 'Normal' },
    ];
    expect(builtinStyleId(other, 'heading1')).toBe('berschrift1');
    expect(builtinStyleId(other, 'normal')).toBe('Standard');
  });

  it('returns null when the document lacks the style', () => {
    expect(builtinStyleId(word, 'heading3')).toBeNull();
    expect(builtinStyleId([], 'normal')).toBeNull();
  });

  it('does not confuse Heading 1 with Heading 10', () => {
    expect(builtinStyleId([{ styleId: 'H10', name: 'heading 10' }], 'heading1')).toBeNull();
  });
});
