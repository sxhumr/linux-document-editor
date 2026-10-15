// Shared constants between the fixture generator and the round-trip harness.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURE_DIR = path.join(REPO_ROOT, 'fixtures/docx');

/** Every well-formed fixture starts with this paragraph; the harness edits it. */
export const EDIT_TARGET = 'Edit target paragraph.';
/** Appended to the edit target by every adapter, then looked for after reopening. */
export const EDIT_MARKER = ' [PageLite edit ✓]';
