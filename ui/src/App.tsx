import { useEffect, useState } from 'react';
import { DocxEditor, useEditorCommand } from '@docx-editor.dev/react';
import { appInfo, onCloseRequested, setWindowTitle, type AppInfo } from './native/bridge';

type CommandSlot = Parameters<typeof useEditorCommand>[0];

/** A PageLite-owned toolbar button driving an engine command. */
function CommandButton({ slot, label, shortcut }: { slot: CommandSlot; label: string; shortcut: string }) {
  const command = useEditorCommand(slot);
  return (
    <button
      type="button"
      className="tool"
      title={`${label} (${shortcut})`}
      aria-label={label}
      aria-pressed={command.isActive}
      disabled={!command.isEnabled}
      onMouseDown={(e) => e.preventDefault() /* keep the caret in the document */}
      onClick={() => command.execute()}
    >
      {label}
    </button>
  );
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void setWindowTitle('Untitled — PageLite');
    void appInfo().then(setInfo);
    // Milestone 2: nothing can be unsaved yet, so closing is confirmed immediately.
    // Milestone 4 replaces this with the Save / Discard / Cancel prompt.
    return onCloseRequested((confirm) => void confirm());
  }, []);

  return (
    <DocxEditor.Root document="blank" mode="edit">
      <div className="shell">
        <header className="toolbar" role="toolbar" aria-label="Formatting">
          <CommandButton slot="history.undo" label="Undo" shortcut="Ctrl+Z" />
          <CommandButton slot="history.redo" label="Redo" shortcut="Ctrl+Shift+Z" />
          <span className="separator" />
          <CommandButton slot="text.bold" label="Bold" shortcut="Ctrl+B" />
          <CommandButton slot="text.italic" label="Italic" shortcut="Ctrl+I" />
          <CommandButton slot="text.underline" label="Underline" shortcut="Ctrl+U" />
          <span className="separator" />
          <CommandButton slot="list.bullet" label="Bullets" shortcut="" />
          <CommandButton slot="list.numbered" label="Numbering" shortcut="" />
          <span className="spacer" />
          {info && (
            <span className="version">
              {info.name} {info.version} · WebKitGTK {info.webkitVersion}
            </span>
          )}
        </header>
        <main className="canvas">
          <DocxEditor.Viewport>
            <DocxEditor.Content />
          </DocxEditor.Viewport>
        </main>
      </div>
    </DocxEditor.Root>
  );
}
