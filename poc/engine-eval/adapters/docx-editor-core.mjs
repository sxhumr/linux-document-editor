// Candidate: @docx-editor.dev/core (Apache-2.0). Edits the canonical OOXML tree in place and
// re-serialises only the parts it models; everything else passes through byte-for-byte.
import {
  TreePackageStore,
  bodyStoryRoot,
  paragraphTextOf,
  readOoxmlPackage,
  storyParagraphs,
  writeOoxmlPackage,
} from '@docx-editor.dev/core/store';

export const id = 'docx-editor-core';
export const label = '@docx-editor.dev/core 2.30.0';
export const pkgName = '@docx-editor.dev/core';

export async function open(bytes) {
  const result = readOoxmlPackage(new Uint8Array(bytes));
  if (!result.ok) throw new Error(`rejected: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`);
  const pkg = result.package;
  const main = pkg.parts.get(pkg.mainDocumentPart);
  if (!main) throw new Error('rejected: no main document tree');
  return new TreePackageStore(pkg, main);
}

export function appendToParagraph(store, target, marker) {
  const part = store.partFor({ kind: 'body' });
  const paragraph = storyParagraphs(bodyStoryRoot(part)).find((p) => paragraphTextOf(part, p.id) === target);
  if (!paragraph) return false;
  const result = store.transact({ kind: 'body' }, (ctx) => {
    ctx.apply({ op: 'insertText', paragraphId: paragraph.id, offset: target.length, text: marker });
  });
  return result.ok !== false;
}

export function paragraphCount(store) {
  return storyParagraphs(bodyStoryRoot(store.partFor({ kind: 'body' }))).length;
}

export async function save(store) {
  return writeOoxmlPackage(store.currentPackage());
}
