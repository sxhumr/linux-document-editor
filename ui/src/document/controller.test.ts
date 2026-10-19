import { describe, expect, it, vi } from 'vitest';
import { DocumentController, type SaveChoice } from './controller';
import type { FileRef, OpenedDocument } from '../native/bridge';
import { NativeError } from '../native/bridge';

const DOCX = new Uint8Array([0x50, 0x4b]);
const doc = (name: string, path = `/docs/${name}`): OpenedDocument => ({ name, path, bytes: DOCX });

/** A controller over fakes. `edit()` simulates typing; prompts answer from a queue. */
function setup(answers: SaveChoice[] = []) {
  let revision = 0;
  const editor = {
    load: vi.fn(() => {
      revision = 0;
    }),
    save: vi.fn(async () => new Uint8Array([revision])),
    revision: () => revision,
  };
  const files = {
    openDocument: vi.fn<() => Promise<OpenedDocument | null>>(async () => null),
    chooseSavePath: vi.fn<(name: string, current: string | null) => Promise<FileRef | null>>(async () => null),
    writeDocument: vi.fn<(path: string, bytes: Uint8Array) => Promise<void>>(async () => {}),
  };
  const askToSave = vi.fn(async () => answers.shift() ?? 'cancel');
  const validate = vi.fn((bytes: Uint8Array) =>
    bytes.length > 0 ? ({ ok: true } as const) : ({ ok: false, reason: 'The file is empty.' } as const),
  );
  const controller = new DocumentController({ editor, files, validate, askToSave });
  const edit = () => {
    revision += 1;
    controller.noteChange({ revision });
  };
  return { controller, editor, files, askToSave, edit, state: () => controller.getState() };
}

describe('modified state', () => {
  it('starts as an unmodified Untitled document', () => {
    const { state } = setup();
    expect(state()).toMatchObject({ info: { name: 'Untitled', path: null }, modified: false });
  });

  it('becomes modified on an edit and clean again on load', () => {
    const { controller, edit, state } = setup();
    edit();
    expect(state().modified).toBe(true);
    controller.noteChange({ source: 'load', revision: 0 });
    expect(state().modified).toBe(false);
  });

  it('notifies subscribers and keeps a stable snapshot between changes', () => {
    const { controller, edit } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);
    const before = controller.getState();
    expect(controller.getState()).toBe(before);
    edit();
    expect(listener).toHaveBeenCalled();
    expect(controller.getState()).not.toBe(before);
  });
});

describe('Save', () => {
  it('on an untitled document behaves as Save As', async () => {
    const { controller, files, edit, state } = setup();
    files.chooseSavePath.mockResolvedValue({ path: '/docs/new.docx', name: 'new.docx' });
    edit();
    expect(await controller.save()).toBe(true);
    expect(files.chooseSavePath).toHaveBeenCalledWith('Untitled.docx', null);
    expect(files.writeDocument).toHaveBeenCalledWith('/docs/new.docx', expect.any(Uint8Array));
    expect(state()).toMatchObject({ info: { name: 'new.docx', path: '/docs/new.docx' }, modified: false });
    expect(state().notice).toEqual({ kind: 'info', text: 'Saved new.docx' });
  });

  it('writes straight to the current file once it has one', async () => {
    const { controller, files, edit, state } = setup();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    await controller.open();
    edit();
    expect(await controller.save()).toBe(true);
    expect(files.chooseSavePath).not.toHaveBeenCalled();
    expect(files.writeDocument).toHaveBeenCalledWith('/docs/a.docx', expect.any(Uint8Array));
    expect(state().modified).toBe(false);
  });

  it('a failed write keeps the document modified and its name unchanged', async () => {
    const { controller, files, editor, edit, state } = setup();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    await controller.open();
    edit();
    files.writeDocument.mockRejectedValue(new NativeError('no-space', 'No space left on device.'));
    expect(await controller.save()).toBe(false);
    expect(state()).toMatchObject({ info: { name: 'a.docx' }, modified: true });
    expect(state().notice?.kind).toBe('error');
    expect(state().notice?.text).toContain('No space left on device.');
    expect(editor.load).toHaveBeenCalledTimes(1); // the editor content was never replaced
  });

  it('a failed engine save is reported the same way', async () => {
    const { controller, files, editor, edit, state } = setup();
    files.chooseSavePath.mockResolvedValue({ path: '/docs/x.docx', name: 'x.docx' });
    editor.save.mockRejectedValue(new Error('invalid form field'));
    edit();
    expect(await controller.saveAs()).toBe(false);
    expect(files.writeDocument).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ info: { name: 'Untitled', path: null }, modified: true });
  });

  it('edits made while a save is in flight stay unsaved', async () => {
    const { controller, files, edit, state } = setup();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    await controller.open();
    edit();
    let finishWrite!: () => void;
    files.writeDocument.mockReturnValue(new Promise<void>((resolve) => (finishWrite = resolve)));
    const saving = controller.save();
    await Promise.resolve();
    await Promise.resolve();
    edit(); // typed during the write
    finishWrite();
    expect(await saving).toBe(true);
    expect(state().modified).toBe(true);
  });

  it('cancelling the Save As dialog changes nothing', async () => {
    const { controller, files, edit, state } = setup();
    edit();
    expect(await controller.saveAs()).toBe(false);
    expect(files.writeDocument).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ info: { name: 'Untitled' }, modified: true, notice: null });
  });

  it('Save As moves the document to the new file', async () => {
    const { controller, files, state } = setup();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    await controller.open();
    files.chooseSavePath.mockResolvedValue({ path: '/other/b.docx', name: 'b.docx' });
    expect(await controller.saveAs()).toBe(true);
    expect(files.chooseSavePath).toHaveBeenCalledWith('a.docx', '/docs/a.docx');
    expect(state().info).toEqual({ name: 'b.docx', path: '/other/b.docx' });
  });
});

describe('Open', () => {
  it('cancelling the Open dialog changes nothing, even with unsaved edits', async () => {
    const { controller, editor, files, askToSave, edit, state } = setup();
    edit();
    const before = state();
    files.openDocument.mockResolvedValueOnce(null);
    expect(await controller.open()).toBe(false);
    expect(askToSave).not.toHaveBeenCalled();
    expect(editor.load).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ info: before.info, modified: true, notice: null });
  });

  it('replaces an unmodified document without asking', async () => {
    const { controller, files, editor, askToSave, state } = setup();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    expect(await controller.open()).toBe(true);
    expect(askToSave).not.toHaveBeenCalled();
    expect(editor.load).toHaveBeenCalledWith(DOCX);
    expect(state()).toMatchObject({ info: { name: 'a.docx', path: '/docs/a.docx' }, modified: false });
  });

  it('asks before replacing a modified document; Cancel keeps it', async () => {
    const { controller, files, editor, askToSave, edit, state } = setup(['cancel']);
    edit();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    expect(await controller.open()).toBe(false);
    expect(askToSave).toHaveBeenCalledWith('Untitled');
    expect(editor.load).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ info: { name: 'Untitled' }, modified: true });
  });

  it('Discard drops the changes and opens', async () => {
    const { controller, files, editor, edit } = setup(['discard']);
    edit();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    expect(await controller.open()).toBe(true);
    expect(editor.load).toHaveBeenCalled();
  });

  it('Save saves first, then opens', async () => {
    const { controller, files, editor, edit } = setup(['save']);
    edit();
    files.chooseSavePath.mockResolvedValue({ path: '/docs/draft.docx', name: 'draft.docx' });
    files.openDocument.mockResolvedValue(doc('a.docx'));
    expect(await controller.open()).toBe(true);
    expect(files.writeDocument).toHaveBeenCalledWith('/docs/draft.docx', expect.any(Uint8Array));
    expect(editor.load).toHaveBeenCalledWith(DOCX);
  });

  it('Save that fails aborts the open, keeping the edits', async () => {
    const { controller, files, editor, edit, state } = setup(['save']);
    files.openDocument.mockResolvedValueOnce(doc('mine.docx'));
    await controller.open();
    edit();
    files.writeDocument.mockRejectedValue(new NativeError('permission-denied', 'Permission denied.'));
    files.openDocument.mockResolvedValue(doc('other.docx'));
    expect(await controller.open()).toBe(false);
    expect(editor.load).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ info: { name: 'mine.docx' }, modified: true });
  });

  it('does not ask about unsaved changes for a file it cannot open', async () => {
    const { controller, files, askToSave, edit, state } = setup(['discard']);
    edit();
    files.openDocument.mockResolvedValue({ ...doc('broken.docx'), bytes: new Uint8Array() });
    expect(await controller.open()).toBe(false);
    expect(askToSave).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ modified: true, notice: { kind: 'error' } });
    expect(state().notice?.text).toContain('broken.docx');
  });

  it('reports read errors', async () => {
    const { controller, files, state } = setup();
    files.openDocument.mockRejectedValue(new NativeError('permission-denied', 'Cannot open /x: Permission denied'));
    expect(await controller.open()).toBe(false);
    expect(state().notice?.text).toContain('Permission denied');
  });

  it('ignores a second request while one is in progress', async () => {
    const { controller, files } = setup();
    let finish!: (d: OpenedDocument | null) => void;
    files.openDocument.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = controller.open();
    expect(await controller.open()).toBe(false);
    finish(null);
    await first;
    expect(files.openDocument).toHaveBeenCalledTimes(1);
  });
});

describe('New', () => {
  it('loads a blank Untitled document', async () => {
    const { controller, files, editor, state } = setup();
    files.openDocument.mockResolvedValue(doc('a.docx'));
    await controller.open();
    expect(await controller.newDocument()).toBe(true);
    expect(editor.load).toHaveBeenLastCalledWith('blank');
    expect(state()).toMatchObject({ info: { name: 'Untitled', path: null }, modified: false });
  });

  it('asks first when there are unsaved changes', async () => {
    const { controller, askToSave, editor, edit } = setup(['cancel']);
    edit();
    expect(await controller.newDocument()).toBe(false);
    expect(askToSave).toHaveBeenCalledOnce();
    expect(editor.load).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('closes immediately when nothing is unsaved', async () => {
    const { controller, askToSave } = setup();
    expect(await controller.requestClose()).toBe(true);
    expect(askToSave).not.toHaveBeenCalled();
  });

  it.each([
    ['cancel', false],
    ['discard', true],
  ] as const)('with unsaved changes, %s → close=%s', async (choice, closes) => {
    const { controller, edit } = setup([choice]);
    edit();
    expect(await controller.requestClose()).toBe(closes);
  });

  it('Save → closes only if the save succeeds', async () => {
    const ok = setup(['save']);
    ok.edit();
    ok.files.chooseSavePath.mockResolvedValue({ path: '/d/x.docx', name: 'x.docx' });
    expect(await ok.controller.requestClose()).toBe(true);

    const cancelled = setup(['save']);
    cancelled.edit(); // Save As dialog cancelled → stay open
    expect(await cancelled.controller.requestClose()).toBe(false);
  });
});
