// Typed access to the functions the C++ shell binds onto `window` (see native/src/shell.cpp).
// Outside the shell (e.g. `npm run dev` in a normal browser, or tests) the bindings do not
// exist, so every call degrades to a harmless fallback instead of throwing.

export interface AppInfo {
  name: string;
  version: string;
  webkitVersion: string;
}

interface NativeBindings {
  pagelite_appInfo?: () => Promise<AppInfo>;
  pagelite_setTitle?: (title: string) => Promise<null>;
  pagelite_registerCloseHandler?: () => Promise<null>;
  pagelite_confirmClose?: () => Promise<null>;
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
