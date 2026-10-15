// Checks a file is a loadable DOCX *before* it replaces the open document, using the
// engine's own bounded package reader (zip-bomb, entity and size limits included).
import { readOoxmlPackage } from '@docx-editor.dev/core/store';

export type Validation = { ok: true } | { ok: false; reason: string };

const FRIENDLY: Record<string, string> = {
  'no-main-document': 'it has no document body',
  'no-content-types': 'it is missing required parts',
  'bad-content-types': 'it is missing required parts',
};

export function validateDocx(bytes: Uint8Array): Validation {
  if (bytes.length === 0) return { ok: false, reason: 'The file is empty.' };
  const result = readOoxmlPackage(bytes);
  if (result.ok) return { ok: true };
  const why =
    FRIENDLY[result.reason] ??
    (result.limit ? 'it is too large to open safely' : 'it is damaged or not a Word document');
  return { ok: false, reason: `This file can't be opened because ${why}.` };
}
