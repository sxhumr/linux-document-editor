import { useCallback, useEffect, useRef, useState } from 'react';
import { DocxEditor, useDocxEditor, useEditorCommand } from '@docx-editor.dev/react';
import {
  appInfo,
  chooseSavePath,
  NativeError,
  onCloseRequested,
  openDocument,
  setWindowTitle,
  takeInitialDocument,
  writeDocument,
  type AppInfo,
  type OpenedDocument,
} from './native/bridge';
import { suggestedSaveName, UNTITLED, windowTitle, type DocumentInfo } from './document/session';
import { validateDocx } from './document/validate';

type CommandSlot = Parameters<typeof useEditorCommand>[0];
type Status = { kind: 'error' | 'info'; text: string } | null;

const INFO_TIMEOUT_MS = 4000;

/** A PageLite-owned toolbar button driving an engine command. */
function CommandButton({ slot, label, shortcut }: { slot: CommandSlot; label: string; shortcut?: string }) {
  const command = useEditorCommand(slot);
  return (
    <button
      type="button"
      className="tool"
      title={shortcut ? `${label} (${shortcut})` : label}
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

const describe = (error: unknown) =>
  error instanceof NativeError ? error.message : error instanceof Error ? error.message : String(error);

function Workspace() {
  const editor = useDocxEditor();
  const [doc, setDoc] = useState<DocumentInfo>(UNTITLED);
  const [status, setStatus] = useState<Status>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const busy = useRef(false); // one file dialog or save at a time

  useEffect(() => {
    void setWindowTitle(windowTitle(doc));
  }, [doc]);

  useEffect(() => {
    if (status?.kind !== 'info') return;
    const timer = setTimeout(() => setStatus(null), INFO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    void appInfo().then(setInfo);
    // Nothing tracks unsaved changes yet, so closing is confirmed immediately.
    // Milestone 4 replaces this with the Save / Discard / Cancel prompt.
    return onCloseRequested((confirm) => void confirm());
  }, []);

  /** Replaces the open document, but only with a file the engine can actually read. */
  const show = useCallback(
    (opened: OpenedDocument) => {
      if (!editor) return;
      const validation = validateDocx(opened.bytes);
      if (!validation.ok) {
        setStatus({ kind: 'error', text: `${opened.name}: ${validation.reason}` });
        return;
      }
      editor.load(opened.bytes);
      setDoc({ name: opened.name, path: opened.path });
      setStatus(null);
    },
    [editor],
  );

  const exclusive = useCallback(async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await task();
    } finally {
      busy.current = false;
    }
  }, []);

  const open = useCallback(
    () =>
      exclusive(async () => {
        try {
          const opened = await openDocument();
          if (opened) show(opened);
        } catch (error) {
          setStatus({ kind: 'error', text: `Couldn't open the file: ${describe(error)}` });
        }
      }),
    [exclusive, show],
  );

  const saveAs = useCallback(
    () =>
      exclusive(async () => {
        if (!editor) return;
        try {
          const target = await chooseSavePath(suggestedSaveName(doc), doc.path);
          if (!target) return;
          const bytes = new Uint8Array(await editor.save());
          await writeDocument(target.path, bytes);
          // Only now is the document associated with the new file.
          setDoc(target);
          setStatus({ kind: 'info', text: `Saved ${target.name}` });
        } catch (error) {
          setStatus({
            kind: 'error',
            text: `Couldn't save: ${describe(error)} Your changes are still here; try another location.`,
          });
        }
      }),
    [editor, exclusive, doc],
  );

  // A document named on the command line opens as soon as the editor exists.
  useEffect(() => {
    if (!editor) return;
    takeInitialDocument().then(
      (opened) => opened && show(opened),
      (error: unknown) => setStatus({ kind: 'error', text: `Couldn't open the file: ${describe(error)}` }),
    );
  }, [editor, show]);

  // Captured before the editor sees the keys, so Ctrl+O/S never reach the document.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'o' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        void open();
      } else if (key === 's') {
        // Ctrl+S is Save As until Milestone 4 adds Save.
        e.preventDefault();
        e.stopPropagation();
        void saveAs();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, saveAs]);

  return (
    <div className="shell">
      <header className="toolbar" role="toolbar" aria-label="Document">
        <button type="button" className="tool" title="Open (Ctrl+O)" onClick={() => void open()}>
          Open…
        </button>
        <button type="button" className="tool" title="Save As (Ctrl+Shift+S)" onClick={() => void saveAs()}>
          Save As…
        </button>
        <span className="separator" />
        <CommandButton slot="history.undo" label="Undo" shortcut="Ctrl+Z" />
        <CommandButton slot="history.redo" label="Redo" shortcut="Ctrl+Shift+Z" />
        <span className="separator" />
        <CommandButton slot="text.bold" label="Bold" shortcut="Ctrl+B" />
        <CommandButton slot="text.italic" label="Italic" shortcut="Ctrl+I" />
        <CommandButton slot="text.underline" label="Underline" shortcut="Ctrl+U" />
        <span className="separator" />
        <CommandButton slot="list.bullet" label="Bullets" />
        <CommandButton slot="list.numbered" label="Numbering" />
        <span className="spacer" />
        {info && (
          <span className="version">
            {info.name} {info.version} · WebKitGTK {info.webkitVersion}
          </span>
        )}
      </header>
      {status && (
        <div className={`status status-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          <span>{status.text}</span>
          <button type="button" className="tool" aria-label="Dismiss" onClick={() => setStatus(null)}>
            ×
          </button>
        </div>
      )}
      <main className="canvas">
        <DocxEditor.Viewport className="viewport">
          <DocxEditor.Content />
        </DocxEditor.Viewport>
      </main>
    </div>
  );
}

export function App() {
  return (
    <DocxEditor.Root document="blank" mode="edit">
      <Workspace />
    </DocxEditor.Root>
  );
}
