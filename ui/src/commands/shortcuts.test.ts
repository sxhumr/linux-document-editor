import { describe, expect, it } from 'vitest';
import { commandForKey, formatShortcut, SHORTCUTS, shortcutLabel } from './shortcuts';

const key = (k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  key: k,
  ctrlKey: Boolean(mods.ctrl),
  metaKey: Boolean(mods.meta),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
});

describe('commandForKey', () => {
  it('maps file shortcuts, telling Save from Save As', () => {
    expect(commandForKey(key('s', { ctrl: true }), false)).toBe('file.save');
    expect(commandForKey(key('S', { ctrl: true, shift: true }), false)).toBe('file.saveAs');
    expect(commandForKey(key('n', { ctrl: true }), false)).toBe('file.new');
  });

  it('requires exact modifiers', () => {
    expect(commandForKey(key('s'), false)).toBeNull();
    expect(commandForKey(key('s', { ctrl: true, alt: true }), false)).toBeNull();
    expect(commandForKey(key('b', { ctrl: true, shift: true }), false)).toBeNull();
  });

  it('accepts Cmd as Ctrl', () => {
    expect(commandForKey(key('o', { meta: true }), false)).toBe('file.open');
  });

  it('maps formatting, alignment and headings', () => {
    expect(commandForKey(key('b', { ctrl: true }), false)).toBe('format.bold');
    expect(commandForKey(key('e', { ctrl: true }), false)).toBe('format.alignCenter');
    expect(commandForKey(key('j', { ctrl: true }), false)).toBe('format.alignJustify');
    expect(commandForKey(key('2', { ctrl: true, alt: true }), false)).toBe('format.heading2');
    expect(commandForKey(key('L', { ctrl: true, shift: true }), false)).toBe('format.bullets');
    expect(commandForKey(key(' ', { ctrl: true }), false)).toBe('format.clear');
  });

  it('supports alternative keys', () => {
    expect(commandForKey(key('y', { ctrl: true }), false)).toBe('edit.redo');
    expect(commandForKey(key('Z', { ctrl: true, shift: true }), false)).toBe('edit.redo');
    expect(commandForKey(key('F3'), false)).toBe('edit.findNext');
    expect(commandForKey(key('F3', { shift: true }), false)).toBe('edit.findPrevious');
    expect(commandForKey(key('F1'), false)).toBe('help.shortcuts');
  });

  it('leaves clipboard keys to the editor', () => {
    for (const k of ['x', 'c', 'v', 'a']) expect(commandForKey(key(k, { ctrl: true }), false)).toBeNull();
  });

  it('in a text field, keeps document keys for the field but still handles app keys', () => {
    expect(commandForKey(key('z', { ctrl: true }), true)).toBeNull();
    expect(commandForKey(key('b', { ctrl: true }), true)).toBeNull();
    expect(commandForKey(key('s', { ctrl: true }), true)).toBe('file.save');
    expect(commandForKey(key('F3'), true)).toBe('edit.findNext');
  });
});

describe('labels', () => {
  it('formats shortcuts the GNOME way', () => {
    expect(formatShortcut({ key: 's', ctrl: true, shift: true })).toBe('Ctrl+Shift+S');
    expect(formatShortcut({ key: '1', ctrl: true, alt: true })).toBe('Ctrl+Alt+1');
    expect(formatShortcut({ key: ' ', ctrl: true })).toBe('Ctrl+Space');
    expect(formatShortcut({ key: 'f3', shift: true })).toBe('Shift+F3');
    expect(shortcutLabel('edit.redo')).toBe('Ctrl+Shift+Z');
    expect(shortcutLabel('help.about')).toBeUndefined();
  });

  it('never binds the same key combination to two commands', () => {
    const seen = new Map<string, string>();
    for (const [id, binding] of Object.entries(SHORTCUTS)) {
      for (const s of binding!.keys) {
        const label = formatShortcut(s);
        expect(seen.get(label), `${label} bound to ${seen.get(label)} and ${id}`).toBeUndefined();
        seen.set(label, id);
      }
    }
  });
});
