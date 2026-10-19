// Shared between the fixture generator and the compatibility suite.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURE_DIR = path.join(REPO_ROOT, 'fixtures/docx');

/** Every well-formed fixture starts with this paragraph; the suite edits it. */
export const EDIT_TARGET = 'Edit target paragraph.';
/** Appended to the edit target, then looked for after reopening. */
export const EDIT_MARKER = ' [PageLite edit ✓]';
/** The word inside the edit target that the suite makes bold. */
export const BOLD_WORD = 'target';

/** Fixture names relative to FIXTURE_DIR without `.docx`: synthetic first, then LibreOffice re-saves. */
export function listFixtures(): string[] {
  return ['', 'libreoffice'].flatMap((dir) =>
    readdirSync(path.join(FIXTURE_DIR, dir))
      .filter((f) => f.endsWith('.docx'))
      .sort()
      .map((f) => path.join(dir, f.replace(/\.docx$/, ''))),
  );
}

export const isMalformed = (name: string) => path.basename(name).startsWith('malformed');
