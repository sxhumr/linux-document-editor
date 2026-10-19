// Typed access to the functions the C++ shell binds onto `window` (see native/src/shell.cpp).
// Outside the shell (e.g. `npm run dev` in a normal browser, or tests) the bindings do not
// exist, so every call degrades to a harmless fallback instead of throwing.

import { base64ToBytes, bytesToBase64 } from './base64';

export interface AppInfo {
  name: string;
  version: string;
  webkitVersion: string;
}

/** A file the user picked; the shell only reads and writes paths it has handed out. */
export interface FileRef {
  path: string;
  name: string;
}

export interface OpenedDocument extends FileRef {
  bytes: Uint8Array;
}

/** A failure reported by the shell, e.g. code "permission-denied" or "no-space". */
export class NativeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'NativeError';
    this.code = code;
  }
}

type WireDocument = FileRef & { data: string };

/** Startup milestones reported to the shell's timing mode (scripts/measure.sh). */
export type StartupPhase = 'ui-ready' | 'document-opened';

interface NativeBindings {
  pagelite_appInfo?: () => Promise<AppInfo>;
  pagelite_openDocument?: () => Promise<WireDocument | null>;
  pagelite_takeInitialDocument?: () => Promise<WireDocument | null>;
  pagelite_chooseSavePath?: (suggestedName: string, currentPath: string) => Promise<FileRef | null>;
  pagelite_writeDocument?: (path: string, base64: string) => Promise<null>;
  pagelite_setTitle?: (title: string) => Promise<null>;
  pagelite_registerCloseHandler?: () => Promise<null>;
  pagelite_confirmClose?: () => Promise<null>;
  /** Bound only when the shell runs with PAGELITE_MEASURE=1. */
  pagelite_mark?: (phase: StartupPhase) => Promise<null>;
  __pagelite_requestClose?: () => void;
}

const native = (): NativeBindings => window as unknown as NativeBindings;

export const isNativeShell = (): boolean => typeof native().pagelite_appInfo === 'function';

export async function appInfo(): Promise<AppInfo | null> {
  return native().pagelite_appInfo?.() ?? null;
}

export async function setWindowTitle(title: string): Promise<void> {
  if (native().pagelite_setTitle) {
    await native().pagelite_setTitle!(title);
  } else {
    document.title = title;
  }
}

/**
 * Routes the window's close button through `onRequest`. The shell will not close the
 * window until `confirm` is called, so the handler can ask about unsaved changes first.
 * Returns an unregister function (used by tests and hot reload).
 */
export function onCloseRequested(onRequest: (confirm: () => Promise<void>) => void): () => void {
  const confirm = async () => {
    await native().pagelite_confirmClose?.();
  };
  native().__pagelite_requestClose = () => onRequest(confirm);
  void native().pagelite_registerCloseHandler?.();
  return () => {
    delete native().__pagelite_requestClose;
  };
}

/** Rejections from the shell arrive as {code, message}; anything else is unexpected. */
function toNativeError(reason: unknown): NativeError {
  if (reason && typeof reason === 'object' && 'code' in reason && 'message' in reason) {
    return new NativeError(String(reason.code), String(reason.message));
  }
  return new NativeError('unknown', reason instanceof Error ? reason.message : String(reason));
}

async function call<T>(fn: (() => Promise<T>) | undefined): Promise<T> {
  if (!fn) throw new NativeError('unavailable', 'File access needs the PageLite desktop app.');
  try {
    return await fn();
  } catch (reason) {
    throw toNativeError(reason);
  }
}

const fromWire = (doc: WireDocument | null): OpenedDocument | null =>
  doc && { path: doc.path, name: doc.name, bytes: base64ToBytes(doc.data) };

/** Shows the Open dialog. Resolves null if the user cancels. */
export async function openDocument(): Promise<OpenedDocument | null> {
  const n = native();
  return fromWire(await call(n.pagelite_openDocument && (() => n.pagelite_openDocument!())));
}

/** The document passed on the command line, once; null if there was none. */
export async function takeInitialDocument(): Promise<OpenedDocument | null> {
  const n = native();
  if (!n.pagelite_takeInitialDocument) return null;
  return fromWire(await call(() => n.pagelite_takeInitialDocument!()));
}

/** Shows the Save As dialog. Resolves null if the user cancels. */
export async function chooseSavePath(suggestedName: string, currentPath: string | null): Promise<FileRef | null> {
  const n = native();
  return call(n.pagelite_chooseSavePath && (() => n.pagelite_chooseSavePath!(suggestedName, currentPath ?? '')));
}

/** Writes the document atomically. Rejects with a NativeError; the file is then unchanged. */
export async function writeDocument(path: string, bytes: Uint8Array): Promise<void> {
  const n = native();
  await call(n.pagelite_writeDocument && (() => n.pagelite_writeDocument!(path, bytesToBase64(bytes))));
}

/** Closes the window immediately. Callers must have resolved unsaved changes first. */
export async function closeWindow(): Promise<void> {
  await native().pagelite_confirmClose?.();
}

/**
 * Reports a startup milestone once the frame showing it has been painted (the second
 * animation frame after this call). Does nothing unless the shell is measuring startup.
 */
export function markAfterPaint(phase: StartupPhase): void {
  const mark = native().pagelite_mark;
  if (!mark) return;
  requestAnimationFrame(() => requestAnimationFrame(() => void mark(phase)));
}
