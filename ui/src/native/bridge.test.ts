import { afterEach, describe, expect, it, vi } from 'vitest';
import { appInfo, isNativeShell, onCloseRequested, setWindowTitle } from './bridge';

type Win = Record<string, unknown>;
const win = window as unknown as Win;
const bound = [
  'pagelite_appInfo',
  'pagelite_setTitle',
  'pagelite_registerCloseHandler',
  'pagelite_confirmClose',
  '__pagelite_requestClose',
];

afterEach(() => {
  for (const name of bound) delete win[name];
});

describe('outside the native shell', () => {
  it('reports no shell and no app info', async () => {
    expect(isNativeShell()).toBe(false);
    expect(await appInfo()).toBeNull();
  });

  it('falls back to document.title', async () => {
    await setWindowTitle('Untitled — PageLite');
    expect(document.title).toBe('Untitled — PageLite');
  });
});

describe('inside the native shell', () => {
  it('forwards the title to the shell', async () => {
    const setTitle = vi.fn().mockResolvedValue(null);
    win.pagelite_setTitle = setTitle;
    await setWindowTitle('report.docx — PageLite');
    expect(setTitle).toHaveBeenCalledWith('report.docx — PageLite');
  });

  it('registers for close and only closes after confirmation', async () => {
    const register = vi.fn().mockResolvedValue(null);
    const confirmClose = vi.fn().mockResolvedValue(null);
    win.pagelite_registerCloseHandler = register;
    win.pagelite_confirmClose = confirmClose;

    let pendingConfirm: (() => Promise<void>) | undefined;
    const unregister = onCloseRequested((confirm) => {
      pendingConfirm = confirm;
    });
    expect(register).toHaveBeenCalledOnce();

    (win.__pagelite_requestClose as () => void)();
    expect(confirmClose).not.toHaveBeenCalled();

    await pendingConfirm!();
    expect(confirmClose).toHaveBeenCalledOnce();

    unregister();
    expect(win.__pagelite_requestClose).toBeUndefined();
  });
});
