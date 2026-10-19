// The document file lifecycle: New, Open, Save, Save As and close, with unsaved-change
// protection. Framework-free; the editor, native file access and the "save changes?"
// prompt are injected, so every workflow is unit-tested (controller.test.ts).
//
// Data-safety rules this class enforces:
//  - A document is marked saved only after the write succeeded, and only up to the
//    revision that was actually written (edits made during a save stay unsaved).
//  - Nothing replaces or closes a modified document without Save / Discard / Cancel.
//  - A failed save changes nothing: the editor keeps every edit and stays modified.
import type { FileRef, OpenedDocument } from '../native/bridge';
import { suggestedSaveName, UNTITLED, type DocumentInfo } from './session';
import type { Validation } from './validate';

export interface EditorPort {
  load(source: Uint8Array | 'blank'): void;
  save(): Promise<Uint8Array>;
  /** Current revision; the engine raises it on every edit and resets it on load. */
  revision(): number;
}

export interface FilesPort {
  openDocument(): Promise<OpenedDocument | null>;
  chooseSavePath(suggestedName: string, currentPath: string | null): Promise<FileRef | null>;
  writeDocument(path: string, bytes: Uint8Array): Promise<void>;
}

export type SaveChoice = 'save' | 'discard' | 'cancel';

export interface ControllerDeps {
  editor: EditorPort;
  files: FilesPort;
  validate: (bytes: Uint8Array) => Validation;
  /** Asks whether to save changes to `docName` before it is replaced or closed. */
  askToSave: (docName: string) => Promise<SaveChoice>;
}

export type Notice = { kind: 'error' | 'info'; text: string };

export interface DocumentState {
  info: DocumentInfo;
  modified: boolean;
  notice: Notice | null;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class DocumentController {
  private info: DocumentInfo = UNTITLED;
  private revision = 0;
  private savedRevision = 0;
  private notice: Notice | null = null;
  private busy = false;
  private readonly listeners = new Set<() => void>();
  private snapshot: DocumentState;
  private readonly deps: ControllerDeps;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.snapshot = this.compute();
  }

  // ---- state ------------------------------------------------------------------------

  /** Stable between changes, so it works as a useSyncExternalStore source. */
  getState = (): DocumentState => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private compute(): DocumentState {
    return { info: this.info, modified: this.revision !== this.savedRevision, notice: this.notice };
  }

  private emit() {
    this.snapshot = this.compute();
    for (const listener of this.listeners) listener();
  }

  private setNotice(notice: Notice | null) {
    this.notice = notice;
    this.emit();
  }

  dismissNotice = () => this.setNotice(null);

  /** Shows a message from outside a controller action (e.g. a startup failure). */
  notify = (notice: Notice) => this.setNotice(notice);

  // ---- engine events ----------------------------------------------------------------

  /** Feed every engine change here. A load starts a new, unmodified baseline. */
  noteChange = (change: { source?: string; revision: number }) => {
    if (change.source === 'load') this.savedRevision = change.revision;
    this.revision = change.revision;
    this.emit();
  };

  // ---- actions ----------------------------------------------------------------------

  /** Runs one file action at a time; a second request while one is open is ignored. */
  private async exclusive<T>(task: () => Promise<T>, whenBusy: T): Promise<T> {
    if (this.busy) return whenBusy;
    this.busy = true;
    try {
      return await task();
    } finally {
      this.busy = false;
    }
  }

  newDocument = () =>
    this.exclusive(async () => {
      if (!(await this.confirmDiscard())) return false;
      this.replace('blank', UNTITLED);
      return true;
    }, false);

  open = () =>
    this.exclusive(async () => {
      let opened: OpenedDocument | null;
      try {
        opened = await this.deps.files.openDocument();
      } catch (error) {
        this.setNotice({ kind: 'error', text: `Couldn't open the file: ${describe(error)}` });
        return false;
      }
      if (!opened) return false;
      return this.show(opened);
    }, false);

  /** Opens a document handed over at startup (command line). */
  openInitial = (opened: OpenedDocument) => this.exclusive(() => this.show(opened), false);

  save = () => this.exclusive(() => this.saveNow(), false);

  saveAs = () => this.exclusive(() => this.saveAsNow(), false);

  /** Resolves true if the window may close (nothing unsaved, saved, or discarded). */
  requestClose = () => this.exclusive(() => this.confirmDiscard(), false);

  // ---- internals --------------------------------------------------------------------

  /** Validates, asks about unsaved changes, then replaces the document. */
  private async show(opened: OpenedDocument): Promise<boolean> {
    const validation = this.deps.validate(opened.bytes);
    if (!validation.ok) {
      this.setNotice({ kind: 'error', text: `${opened.name}: ${validation.reason}` });
      return false;
    }
    if (!(await this.confirmDiscard())) return false;
    this.replace(opened.bytes, { name: opened.name, path: opened.path });
    return true;
  }

  private replace(source: Uint8Array | 'blank', info: DocumentInfo) {
    this.deps.editor.load(source);
    // The engine reports the load through noteChange; this also covers engines that don't.
    this.revision = this.savedRevision = this.deps.editor.revision();
    this.info = info;
    this.notice = null;
    this.emit();
  }

  /** True if it is safe to drop the current document. */
  private async confirmDiscard(): Promise<boolean> {
    if (!this.snapshot.modified) return true;
    const choice = await this.deps.askToSave(this.info.name);
    if (choice === 'cancel') return false;
    if (choice === 'discard') return true;
    return this.saveNow();
  }

  private async saveNow(): Promise<boolean> {
    if (this.info.path === null) return this.saveAsNow();
    return this.write({ path: this.info.path, name: this.info.name });
  }

  private async saveAsNow(): Promise<boolean> {
    let target: FileRef | null;
    try {
      target = await this.deps.files.chooseSavePath(suggestedSaveName(this.info), this.info.path);
    } catch (error) {
      this.setNotice({ kind: 'error', text: `Couldn't save: ${describe(error)}` });
      return false;
    }
    if (!target) return false;
    return this.write(target);
  }

  private async write(target: FileRef): Promise<boolean> {
    const revision = this.deps.editor.revision();
    try {
      const bytes = await this.deps.editor.save();
      await this.deps.files.writeDocument(target.path, bytes);
    } catch (error) {
      this.setNotice({
        kind: 'error',
        text: `Couldn't save ${target.name}: ${describe(error)} Your changes are still here.`,
      });
      return false;
    }
    this.info = { name: target.name, path: target.path };
    this.savedRevision = revision; // edits made while saving remain unsaved
    this.notice = { kind: 'info', text: `Saved ${target.name}` };
    this.emit();
    return true;
  }
}
