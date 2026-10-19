// One open → edit → save → reopen trip per fixture, shared by the test files.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateDocx } from '../../src/document/validate';
import { BOLD_WORD, EDIT_MARKER, EDIT_TARGET, FIXTURE_DIR } from './corpus';
import * as engine from './engine';
import { inspectDocx, type AppliedEdits, type Inspection } from './inspect';

export interface Trip {
  bytes: Uint8Array;
  original: Inspection;
  edits: AppliedEdits | null;
  output: Uint8Array;
  saved: Inspection;
  /** Body paragraph texts as the engine reads the saved file back. */
  reopenedTexts: string[];
}

export const readFixture = async (name: string) =>
  new Uint8Array(await readFile(path.join(FIXTURE_DIR, `${name}.docx`)));

export async function roundTrip(name: string): Promise<Trip> {
  const bytes = await readFixture(name);
  const validation = validateDocx(bytes);
  if (!validation.ok) throw new Error(`the app would refuse this file: ${validation.reason}`);

  const host = engine.open(bytes);
  const edits = engine.editTarget(host, EDIT_TARGET, EDIT_MARKER, BOLD_WORD);
  const output = engine.save(host);
  host.dispose();

  // The saved file must pass the app's own open path again, then load in the engine.
  const revalidation = validateDocx(output);
  if (!revalidation.ok) throw new Error(`the app would refuse its own output: ${revalidation.reason}`);
  const reopened = engine.open(output);
  const reopenedTexts = engine.paragraphs(reopened).map((p) => p.text);
  reopened.dispose();

  return { bytes, original: await inspectDocx(bytes), edits, output, saved: await inspectDocx(output), reopenedTexts };
}
