import { describe, expect, it } from 'vitest';
import { suggestedSaveName, UNTITLED, windowTitle } from './session';

describe('document session', () => {
  it('titles the window with the file name', () => {
    expect(windowTitle(UNTITLED)).toBe('Untitled — PageLite');
    expect(windowTitle({ name: 'report.docx', path: '/home/u/report.docx' })).toBe('report.docx — PageLite');
  });

  it('suggests a .docx name for Save As', () => {
    expect(suggestedSaveName(UNTITLED)).toBe('Untitled.docx');
    expect(suggestedSaveName({ name: 'report.docx', path: '/a/report.docx' })).toBe('report.docx');
    expect(suggestedSaveName({ name: 'REPORT.DOCX', path: '/a/REPORT.DOCX' })).toBe('REPORT.DOCX');
    expect(suggestedSaveName({ name: 'notes', path: '/a/notes' })).toBe('notes.docx');
  });
});
