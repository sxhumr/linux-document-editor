import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appInfo,
  chooseSavePath,
  isNativeShell,
  markAfterPaint,
  NativeError,
  onCloseRequested,
  openDocument,
  setWindowTitle,
  takeInitialDocument,
  writeDocument,
} from './bridge';

type Win = Record<string, unknown>;
const win = window as unknown as Win;
const bound = [
  'pagelite_appInfo',
  'pagelite_setTitle',
  'pagelite_registerCloseHandler',
  'pagelite_confirmClose',
  '__pagelite_requestClose',
  'pagelite_openDocument',
  'pagelite_takeInitialDocument',
  'pagelite_chooseSavePath',
  'pagelite_writeDocument',
  'pagelite_mark',
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

describe('documents', () => {
  it('decodes an opened document', async () => {
    win.pagelite_openDocument = vi.fn().mockResolvedValue({ path: '/d/a.docx', name: 'a.docx', data: 'UEs=' });
    const doc = await openDocument();
    expect(doc).toEqual({ path: '/d/a.docx', name: 'a.docx', bytes: new Uint8Array([0x50, 0x4b]) });
  });

  it('passes through a cancelled dialog as null', async () => {
    win.pagelite_openDocument = vi.fn().mockResolvedValue(null);
    win.pagelite_chooseSavePath = vi.fn().mockResolvedValue(null);
    expect(await openDocument()).toBeNull();
    expect(await chooseSavePath('Untitled.docx', null)).toBeNull();
  });

  it('turns shell rejections into NativeError with the code', async () => {
    win.pagelite_writeDocument = vi.fn().mockRejectedValue({ code: 'no-space', message: 'Disk full' });
    const error = await writeDocument('/d/a.docx', new Uint8Array([1])).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NativeError);
    expect(error).toMatchObject({ code: 'no-space', message: 'Disk full' });
  });

  it('sends bytes as base64 and the current path for the dialog folder', async () => {
    const write = vi.fn().mockResolvedValue(null);
    const choose = vi.fn().mockResolvedValue({ path: '/d/b.docx', name: 'b.docx' });
    win.pagelite_writeDocument = write;
    win.pagelite_chooseSavePath = choose;
    await writeDocument('/d/a.docx', new Uint8Array([0x50, 0x4b]));
    expect(write).toHaveBeenCalledWith('/d/a.docx', 'UEs=');
    await chooseSavePath('a.docx', '/d/a.docx');
    expect(choose).toHaveBeenCalledWith('a.docx', '/d/a.docx');
    await chooseSavePath('Untitled.docx', null);
    expect(choose).toHaveBeenLastCalledWith('Untitled.docx', '');
  });

  it('reports file access as unavailable outside the desktop app', async () => {
    await expect(openDocument()).rejects.toMatchObject({ code: 'unavailable' });
    expect(await takeInitialDocument()).toBeNull();
  });
});

describe('startup timing marks', () => {
  it('do nothing unless the shell is measuring', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    markAfterPaint('ui-ready');
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });

  it('report the phase after the next painted frame', () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const mark = vi.fn(async () => null);
    win.pagelite_mark = mark;
    markAfterPaint('document-opened');
    frames.shift()!(0);
    expect(mark).not.toHaveBeenCalled(); // the first frame may not be painted yet
    frames.shift()!(0);
    expect(mark).toHaveBeenCalledWith('document-opened');
    raf.mockRestore();
  });
});
