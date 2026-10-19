// @vitest-environment node
// Third-party check: every file the engine saves must open in LibreOffice Writer and show the
// edit. Slow (one headless conversion of the whole corpus), so it runs only through
// `npm run test:compat`, and only where LibreOffice is installed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { EDIT_MARKER, EDIT_TARGET, isMalformed, listFixtures } from './corpus';
import { roundTrip } from './roundtrip';

const soffice = ['soffice', 'libreoffice'].find((bin) => {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
const enabled = process.env.PAGELITE_LIBREOFFICE === '1' && soffice !== undefined;

// Under $HOME rather than /tmp: the LibreOffice snap cannot see /tmp.
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/.cache/pagelite-compat');
const flat = (name: string) => name.replaceAll('/', '__');
const fixtures = listFixtures().filter((name) => !isMalformed(name));

describe.skipIf(!enabled)('LibreOffice opens every saved file', () => {
  const edited = new Set<string>();

  beforeAll(async () => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(path.join(OUT, 'txt'), { recursive: true });
    const files: string[] = [];
    for (const name of fixtures) {
      const trip = await roundTrip(name);
      if (trip.edits) edited.add(name);
      const file = path.join(OUT, `${flat(name)}.docx`);
      writeFileSync(file, trip.output);
      files.push(file);
    }
    execFileSync(
      soffice!,
      ['--headless', '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', path.join(OUT, 'txt'), ...files],
      {
        stdio: 'ignore',
        timeout: 240_000,
      },
    );
  }, 300_000);

  it.each(fixtures)('%s', (name) => {
    const txt = path.join(OUT, 'txt', `${flat(name)}.txt`);
    expect(existsSync(txt), 'LibreOffice could not open the saved file').toBe(true);
    if (edited.has(name)) expect(readFileSync(txt, 'utf8')).toContain(EDIT_TARGET + EDIT_MARKER);
  });
});
