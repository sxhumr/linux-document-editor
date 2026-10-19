// Keyboard shortcuts: one table, used to handle keys, label menus and fill the Help screen,
// so a shortcut can never be shown in one place and behave differently in another.
// Conventions follow Word and LibreOffice Writer.

export type CommandId =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.quit'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.selectAll'
  | 'edit.find'
  | 'edit.findNext'
  | 'edit.findPrevious'
  | 'format.bold'
  | 'format.italic'
  | 'format.underline'
  | 'format.strike'
  | 'format.clear'
  | 'format.normal'
  | 'format.title'
  | 'format.heading1'
  | 'format.heading2'
  | 'format.heading3'
  | 'format.alignLeft'
  | 'format.alignCenter'
  | 'format.alignRight'
  | 'format.alignJustify'
  | 'format.bullets'
  | 'format.numbering'
  | 'format.indent'
  | 'format.outdent'
  | 'help.shortcuts'
  | 'help.about';

export interface Shortcut {
  /** KeyboardEvent.key, lower-case for letters: "s", "f3", "1", "/", " ". */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Where a command's keys are handled:
 *  - 'app': by PageLite, wherever focus is (file, find, help).
 *  - 'document': by PageLite, unless focus is in one of PageLite's own text fields.
 *  - 'native': left to the editor/browser (clipboard needs the real key event); listed
 *    here only so menus and Help show them.
 */
export type ShortcutScope = 'app' | 'document' | 'native';

export interface ShortcutBinding {
  keys: Shortcut[];
  scope: ShortcutScope;
}

const ctrl = (key: string, extra: Omit<Shortcut, 'key' | 'ctrl'> = {}): Shortcut => ({ key, ctrl: true, ...extra });

export const SHORTCUTS: Partial<Record<CommandId, ShortcutBinding>> = {
  'file.new': { keys: [ctrl('n')], scope: 'app' },
  'file.open': { keys: [ctrl('o')], scope: 'app' },
  'file.save': { keys: [ctrl('s')], scope: 'app' },
  'file.saveAs': { keys: [ctrl('s', { shift: true })], scope: 'app' },
  'file.quit': { keys: [ctrl('q')], scope: 'app' },

  'edit.undo': { keys: [ctrl('z')], scope: 'document' },
  'edit.redo': { keys: [ctrl('z', { shift: true }), ctrl('y')], scope: 'document' },
  'edit.cut': { keys: [ctrl('x')], scope: 'native' },
  'edit.copy': { keys: [ctrl('c')], scope: 'native' },
  'edit.paste': { keys: [ctrl('v')], scope: 'native' },
  'edit.selectAll': { keys: [ctrl('a')], scope: 'native' },
  'edit.find': { keys: [ctrl('f')], scope: 'app' },
  'edit.findNext': { keys: [{ key: 'f3' }, ctrl('g')], scope: 'app' },
  'edit.findPrevious': { keys: [{ key: 'f3', shift: true }, ctrl('g', { shift: true })], scope: 'app' },

  'format.bold': { keys: [ctrl('b')], scope: 'document' },
  'format.italic': { keys: [ctrl('i')], scope: 'document' },
  'format.underline': { keys: [ctrl('u')], scope: 'document' },
  'format.clear': { keys: [ctrl(' ')], scope: 'document' },
  'format.normal': { keys: [ctrl('0', { alt: true })], scope: 'document' },
  'format.heading1': { keys: [ctrl('1', { alt: true })], scope: 'document' },
  'format.heading2': { keys: [ctrl('2', { alt: true })], scope: 'document' },
  'format.heading3': { keys: [ctrl('3', { alt: true })], scope: 'document' },
  'format.alignLeft': { keys: [ctrl('l')], scope: 'document' },
  'format.alignCenter': { keys: [ctrl('e')], scope: 'document' },
  'format.alignRight': { keys: [ctrl('r')], scope: 'document' },
  'format.alignJustify': { keys: [ctrl('j')], scope: 'document' },
  'format.bullets': { keys: [ctrl('l', { shift: true })], scope: 'document' },

  'help.shortcuts': { keys: [ctrl('/'), { key: 'f1' }], scope: 'app' },
};

/** Normalised key of an event: letters lower-cased, so Shift does not change the key. */
function eventKey(e: Pick<KeyboardEvent, 'key'>): string {
  return e.key.toLowerCase();
}

export function matches(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, s: Shortcut) {
  return (
    eventKey(e) === s.key &&
    (e.ctrlKey || e.metaKey) === Boolean(s.ctrl) &&
    e.shiftKey === Boolean(s.shift) &&
    e.altKey === Boolean(s.alt)
  );
}

/**
 * The command a key event should run, or null.
 * `inTextField` is true when focus is in PageLite's own input (e.g. the Find box), where
 * document editing keys such as Ctrl+Z must keep their usual meaning for that field.
 */
export function commandForKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  inTextField: boolean,
): CommandId | null {
  for (const [id, binding] of Object.entries(SHORTCUTS) as [CommandId, ShortcutBinding][]) {
    if (binding.scope === 'native') continue;
    if (inTextField && binding.scope === 'document') continue;
    if (binding.keys.some((s) => matches(e, s))) return id;
  }
  return null;
}

const KEY_LABELS: Record<string, string> = { ' ': 'Space', '/': '/' };

export function formatShortcut(s: Shortcut): string {
  const key = KEY_LABELS[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key.toUpperCase());
  return [s.ctrl && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', key].filter(Boolean).join('+');
}

/** The first (primary) shortcut of a command as a label, e.g. "Ctrl+Shift+S". */
export function shortcutLabel(id: CommandId): string | undefined {
  const binding = SHORTCUTS[id];
  return binding ? formatShortcut(binding.keys[0]) : undefined;
}
