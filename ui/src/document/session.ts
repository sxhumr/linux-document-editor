// What PageLite knows about the open document, independent of the engine.

export interface DocumentInfo {
  /** File name shown to the user ("report.docx"), or "Untitled" for a new document. */
  name: string;
  /** Absolute path once the document has a file; null for a new, never-saved document. */
  path: string | null;
}

export const UNTITLED: DocumentInfo = { name: 'Untitled', path: null };

export function windowTitle(doc: DocumentInfo): string {
  return `${doc.name} — PageLite`;
}

/** Name pre-filled in the Save As dialog. */
export function suggestedSaveName(doc: DocumentInfo): string {
  if (doc.path === null) return 'Untitled.docx';
  return /\.docx$/i.test(doc.name) ? doc.name : `${doc.name}.docx`;
}
