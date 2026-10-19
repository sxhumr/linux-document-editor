// Every user-facing command (label, action, enabled/active state) in one place. Menus,
// the toolbar, keyboard shortcuts and the Help screen all read from this table.
import { useDocxEditor, useEditorCommand, useParagraphStyle } from '@docx-editor.dev/react';
import type { DocumentController } from '../document/controller';
import { shortcutLabel, type CommandId } from './shortcuts';
import { builtinStyleId, type BuiltinStyle } from './styles';

export interface Command {
  id: CommandId;
  label: string;
  run: () => void;
  enabled: boolean;
  /** For toggles and choices (Bold, an alignment, a heading): whether it applies now. */
  checked?: boolean;
  shortcut?: string;
}

export type Commands = Record<CommandId, Command>;

export interface AppActions {
  openFind: () => void;
  findNext: () => void;
  findPrevious: () => void;
  showShortcuts: () => void;
  showAbout: () => void;
  quit: () => void;
}

// Hoisted so the hooks receive identity-stable command objects.
const CUT = { type: 'cut' } as const;
const COPY = { type: 'copy' } as const;
const SELECT_ALL = { type: 'selectAll' } as const;
const PASTE_PROBE = { type: 'paste', text: '' } as const;

type EngineCommand = ReturnType<typeof useEditorCommand>;

export function useCommands(controller: DocumentController, actions: AppActions): Commands {
  const editor = useDocxEditor();
  const style = useParagraphStyle();

  const engine: Record<string, EngineCommand> = {
    undo: useEditorCommand('history.undo'),
    redo: useEditorCommand('history.redo'),
    cut: useEditorCommand(CUT),
    copy: useEditorCommand(COPY),
    paste: useEditorCommand(PASTE_PROBE),
    selectAll: useEditorCommand(SELECT_ALL),
    bold: useEditorCommand('text.bold'),
    italic: useEditorCommand('text.italic'),
    underline: useEditorCommand('text.underline'),
    strike: useEditorCommand('text.strike'),
    clear: useEditorCommand('format.clear'),
    alignLeft: useEditorCommand('alignment.left'),
    alignCenter: useEditorCommand('alignment.center'),
    alignRight: useEditorCommand('alignment.right'),
    alignJustify: useEditorCommand('alignment.justify'),
    bullets: useEditorCommand('list.bullet'),
    numbering: useEditorCommand('list.numbered'),
    indent: useEditorCommand('list.indent'),
    outdent: useEditorCommand('list.outdent'),
  };

  const make = (id: CommandId, label: string, run: () => void, enabled = true, checked?: boolean): Command => ({
    id,
    label,
    run,
    enabled,
    checked,
    shortcut: shortcutLabel(id),
  });

  const fromEngine = (id: CommandId, label: string, cmd: EngineCommand, toggle = false) =>
    make(id, label, () => void cmd.execute(), cmd.isEnabled, toggle ? cmd.isActive : undefined);

  const styleCommand = (id: CommandId, label: string, which: BuiltinStyle) => {
    const styleId = builtinStyleId(style.options, which);
    return make(
      id,
      label,
      () => styleId && style.setValue(styleId),
      style.isEnabled && styleId !== null,
      style.value !== null && style.value === styleId,
    );
  };

  // Paste reads the clipboard inside the click that asked for it, then hands the text to
  // the engine (exec is synchronous; clipboard reads are not).
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) editor?.exec({ type: 'paste', text });
    } catch {
      // Clipboard access refused; Ctrl+V still works through the native paste event.
    }
  };

  const list: Command[] = [
    make('file.new', 'New', () => void controller.newDocument()),
    make('file.open', 'Open…', () => void controller.open()),
    make('file.save', 'Save', () => void controller.save()),
    make('file.saveAs', 'Save As…', () => void controller.saveAs()),
    make('file.quit', 'Quit', actions.quit),

    fromEngine('edit.undo', 'Undo', engine.undo),
    fromEngine('edit.redo', 'Redo', engine.redo),
    fromEngine('edit.cut', 'Cut', engine.cut),
    fromEngine('edit.copy', 'Copy', engine.copy),
    make('edit.paste', 'Paste', () => void paste(), engine.paste.isEnabled),
    fromEngine('edit.selectAll', 'Select All', engine.selectAll),
    make('edit.find', 'Find…', actions.openFind),
    make('edit.findNext', 'Find Next', actions.findNext),
    make('edit.findPrevious', 'Find Previous', actions.findPrevious),

    fromEngine('format.bold', 'Bold', engine.bold, true),
    fromEngine('format.italic', 'Italic', engine.italic, true),
    fromEngine('format.underline', 'Underline', engine.underline, true),
    fromEngine('format.strike', 'Strikethrough', engine.strike, true),
    fromEngine('format.clear', 'Clear Formatting', engine.clear),
    styleCommand('format.normal', 'Normal Text', 'normal'),
    styleCommand('format.title', 'Title', 'title'),
    styleCommand('format.heading1', 'Heading 1', 'heading1'),
    styleCommand('format.heading2', 'Heading 2', 'heading2'),
    styleCommand('format.heading3', 'Heading 3', 'heading3'),
    fromEngine('format.alignLeft', 'Align Left', engine.alignLeft, true),
    fromEngine('format.alignCenter', 'Center', engine.alignCenter, true),
    fromEngine('format.alignRight', 'Align Right', engine.alignRight, true),
    fromEngine('format.alignJustify', 'Justify', engine.alignJustify, true),
    fromEngine('format.bullets', 'Bulleted List', engine.bullets, true),
    fromEngine('format.numbering', 'Numbered List', engine.numbering, true),
    fromEngine('format.indent', 'Increase Indent', engine.indent),
    fromEngine('format.outdent', 'Decrease Indent', engine.outdent),

    make('help.shortcuts', 'Keyboard Shortcuts', actions.showShortcuts),
    make('help.about', 'About PageLite', actions.showAbout),
  ];
  return Object.fromEntries(list.map((c) => [c.id, c])) as Commands;
}
