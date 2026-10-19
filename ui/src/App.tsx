import { useEffect, useState, useSyncExternalStore } from 'react';
import { DocxEditor, useDocumentSearch, useDocxEditor } from '@docx-editor.dev/react';
import type { Editor } from '@docx-editor.dev/core';
import {
  appInfo,
  chooseSavePath,
  closeWindow,
  markAfterPaint,
  onCloseRequested,
  openDocument,
  setWindowTitle,
  takeInitialDocument,
  writeDocument,
  type AppInfo,
} from './native/bridge';
import { DocumentController, type DocumentState, type SaveChoice } from './document/controller';
import { windowTitle } from './document/session';
import { validateDocx } from './document/validate';
import { commandForKey } from './commands/shortcuts';
import { useCommands } from './commands/useCommands';
import { AboutDialog } from './components/AboutDialog';
import { FindBar } from './components/FindBar';
import { MenuBar, type MenuSpec } from './components/MenuBar';
import { SaveChangesDialog } from './components/SaveChangesDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Toolbar } from './components/Toolbar';

const INFO_TIMEOUT_MS = 4000;

const MENUS: MenuSpec[] = [
  { label: 'File', mnemonic: 'f', items: ['file.new', 'file.open', '-', 'file.save', 'file.saveAs', '-', 'file.quit'] },
  {
    label: 'Edit',
    mnemonic: 'e',
    items: [
      'edit.undo',
      'edit.redo',
      '-',
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.selectAll',
      '-',
      'edit.find',
      'edit.findNext',
      'edit.findPrevious',
    ],
  },
  {
    label: 'Format',
    mnemonic: 'o',
    items: [
      'format.bold',
      'format.italic',
      'format.underline',
      'format.strike',
      '-',
      'format.normal',
      'format.title',
      'format.heading1',
      'format.heading2',
      'format.heading3',
      '-',
      'format.alignLeft',
      'format.alignCenter',
      'format.alignRight',
      'format.alignJustify',
      '-',
      'format.bullets',
      'format.numbering',
      'format.outdent',
      'format.indent',
      '-',
      'format.clear',
    ],
  },
  { label: 'Help', mnemonic: 'h', items: ['help.shortcuts', '-', 'help.about'] },
];

/** Pending "save changes?" question, answered by SaveChangesDialog. */
type Prompt = { docName: string; answer: (choice: SaveChoice) => void };

/**
 * Builds the controller over the native shell and the editor. The engine creates the
 * editor after first render, so it is attached later through `attachEditor`.
 */
function createController(setPrompt: (prompt: Prompt | null) => void) {
  const editor: { current: Editor | null } = { current: null };
  const controller = new DocumentController({
    editor: {
      load: (source) => editor.current?.load(source),
      save: async () => {
        if (!editor.current) throw new Error('The editor is not ready yet.');
        return new Uint8Array(await editor.current.save());
      },
      revision: () => editor.current?.getDocumentHandle().revision ?? 0,
    },
    files: { openDocument, chooseSavePath, writeDocument },
    validate: validateDocx,
    askToSave: (docName) =>
      new Promise<SaveChoice>((resolve) =>
        setPrompt({
          docName,
          answer: (choice) => {
            setPrompt(null);
            resolve(choice);
          },
        }),
      ),
  });
  const attachEditor = (ready: Editor) => {
    editor.current = ready;
  };
  return { controller, attachEditor };
}

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

/** Everything inside the editor's Root: engine hooks are only available down here. */
function Workspace({
  controller,
  state,
  info,
}: {
  controller: DocumentController;
  state: DocumentState;
  info: AppInfo | null;
}) {
  const editor = useDocxEditor();
  const search = useDocumentSearch({ highlight: 'all' });
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  const [dialog, setDialog] = useState<'shortcuts' | 'about' | null>(null);

  const openFind = () => {
    setFindOpen(true);
    setFindFocus((n) => n + 1);
  };
  const closeFind = () => {
    search.clear();
    setFindOpen(false);
    editor?.focus();
  };

  const commands = useCommands(controller, {
    openFind,
    findNext: () => (findOpen && search.query ? void search.next() : openFind()),
    findPrevious: () => (findOpen && search.query ? void search.previous() : openFind()),
    showShortcuts: () => setDialog('shortcuts'),
    showAbout: () => setDialog('about'),
    quit: () => {
      void controller.requestClose().then((ok) => {
        if (ok) void closeWindow();
      });
    },
  });

  // Global shortcuts, captured before the editor sees the keys. Modal dialogs own the
  // keyboard while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const id = commandForKey(e, isTextField(e.target));
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      if (commands[id].enabled) commands[id].run();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [commands]);

  const { info: doc, modified, notice } = state;
  return (
    <div className="shell">
      <header className="titlebar">
        <MenuBar menus={MENUS} commands={commands} />
        <span className="spacer" />
        <span className="doc-name" title={doc.path ?? 'Not saved yet'}>
          {doc.name}
          {modified && (
            <span className="modified" aria-label="unsaved changes">
              {' '}
              • Edited
            </span>
          )}
        </span>
      </header>
      <Toolbar commands={commands} />
      {findOpen && <FindBar search={search} focusToken={findFocus} onClose={closeFind} />}
      {notice && (
        <div className={`status status-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" className="tool" aria-label="Dismiss" onClick={controller.dismissNotice}>
            ×
          </button>
        </div>
      )}
      <main className="canvas">
        <DocxEditor.Viewport className="viewport">
          <DocxEditor.Content />
        </DocxEditor.Viewport>
      </main>
      {dialog === 'shortcuts' && <ShortcutsDialog commands={commands} onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog info={info} onClose={() => setDialog(null)} />}
    </div>
  );
}

export function App() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [{ controller, attachEditor }] = useState(() => createController(setPrompt));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    void setWindowTitle(windowTitle(state.info, state.modified));
  }, [state.info, state.modified]);

  useEffect(() => {
    if (state.notice?.kind !== 'info') return;
    const timer = setTimeout(controller.dismissNotice, INFO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.notice, controller]);

  useEffect(() => {
    void appInfo().then(setInfo);
    // The window's close button lands here; it closes only once nothing would be lost.
    return onCloseRequested((confirm) => {
      void controller.requestClose().then((ok) => {
        if (ok) void confirm();
      });
    });
  }, [controller]);

  const onReady = (ready: Editor) => {
    attachEditor(ready);
    markAfterPaint('ui-ready');
    // A document named on the command line opens as soon as the editor exists.
    takeInitialDocument().then(
      async (opened) => {
        if (opened && (await controller.openInitial(opened))) markAfterPaint('document-opened');
      },
      (error: unknown) =>
        controller.notify({
          kind: 'error',
          text: `Couldn't open the file: ${error instanceof Error ? error.message : String(error)}`,
        }),
    );
  };

  return (
    <DocxEditor.Root document="blank" mode="edit" onReady={onReady} onChange={controller.noteChange}>
      <Workspace controller={controller} state={state} info={info} />
      {prompt && <SaveChangesDialog docName={prompt.docName} onChoice={prompt.answer} />}
    </DocxEditor.Root>
  );
}
