import type { ReactNode } from 'react';
import { useDocxEditor, useEditorValueCommand, useFontFamily, useParagraphStyle } from '@docx-editor.dev/react';
import type { Command, Commands } from '../commands/useCommands';
import { Icon, type IconName } from './Icon';

function ToolButton({ command, children }: { command: Command; children: ReactNode }) {
  return (
    <button
      type="button"
      className="tool"
      title={command.shortcut ? `${command.label} (${command.shortcut})` : command.label}
      aria-label={command.label}
      aria-pressed={command.checked}
      disabled={!command.enabled}
      onMouseDown={(e) => e.preventDefault() /* keep the caret in the document */}
      onClick={command.run}
    >
      {children}
    </button>
  );
}

const iconButton = (command: Command, icon: IconName) => (
  <ToolButton command={command}>
    <Icon name={icon} />
  </ToolButton>
);

/** Shown when the selection mixes values, so the select does not claim one of them. */
const MIXED = '';

function Picker({
  label,
  value,
  options,
  enabled,
  width,
  onPick,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  enabled: boolean;
  width: string;
  onPick: (value: string) => void;
}) {
  return (
    <select
      className="picker"
      style={{ width }}
      aria-label={label}
      title={label}
      disabled={!enabled}
      value={value ?? MIXED}
      onChange={(e) => e.target.value !== MIXED && onPick(e.target.value)}
    >
      {value === null && <option value={MIXED}>—</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** The compact formatting toolbar. File actions live in the File menu. */
export function Toolbar({ commands: c }: { commands: Commands }) {
  const editor = useDocxEditor();
  const style = useParagraphStyle();
  const font = useFontFamily();
  const size = useEditorValueCommand('font.size'); // half-points
  const backToDocument = () => editor?.focus();

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {iconButton(c['edit.undo'], 'undo')}
      {iconButton(c['edit.redo'], 'redo')}
      <span className="separator" />
      <Picker
        label="Paragraph style"
        width="9.5rem"
        value={style.value}
        enabled={style.isEnabled}
        options={style.options.map((o) => ({ value: o.styleId, label: o.name }))}
        onPick={(v) => {
          style.setValue(v);
          backToDocument();
        }}
      />
      <Picker
        label="Font"
        width="10rem"
        value={font.value}
        enabled={font.isEnabled}
        options={font.options.map((f) => ({ value: f, label: f }))}
        onPick={(v) => {
          font.setValue(v);
          backToDocument();
        }}
      />
      <Picker
        label="Font size"
        width="4.5rem"
        value={size.value === null ? null : String(size.value)}
        enabled={size.isEnabled}
        options={size.options.map((half) => ({ value: String(half), label: String(half / 2) }))}
        onPick={(v) => {
          size.execute(Number(v));
          backToDocument();
        }}
      />
      <span className="separator" />
      <ToolButton command={c['format.bold']}>
        <b>B</b>
      </ToolButton>
      <ToolButton command={c['format.italic']}>
        <i>I</i>
      </ToolButton>
      <ToolButton command={c['format.underline']}>
        <u>U</u>
      </ToolButton>
      {iconButton(c['format.clear'], 'clear')}
      <span className="separator" />
      {iconButton(c['format.alignLeft'], 'alignLeft')}
      {iconButton(c['format.alignCenter'], 'alignCenter')}
      {iconButton(c['format.alignRight'], 'alignRight')}
      {iconButton(c['format.alignJustify'], 'alignJustify')}
      <span className="separator" />
      {iconButton(c['format.bullets'], 'bullets')}
      {iconButton(c['format.numbering'], 'numbering')}
      {iconButton(c['format.outdent'], 'outdent')}
      {iconButton(c['format.indent'], 'indent')}
    </div>
  );
}
