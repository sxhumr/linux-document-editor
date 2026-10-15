// Candidate: SuperDoc 1.x (AGPL-3.0), headless. ProseMirror editor over OOXML-derived nodes.
// The 2.x line is deliberately NOT used: it pulls in the proprietary @superdoc/docx-engine
// (see docs/ENGINE_EVALUATION.md, "Licensing").
import { Editor } from 'superdoc/super-editor';

export const id = 'superdoc';
export const label = 'superdoc 1.47.2 (headless)';
export const pkgName = 'superdoc';

export async function open(bytes) {
  // Telemetry is on by default, even headless; PageLite must be fully offline.
  return Editor.open(Buffer.from(bytes), { telemetry: { enabled: false } });
}

export function appendToParagraph(editor, target, marker) {
  let pos = null;
  editor.state.doc.descendants((node, offset) => {
    if (pos !== null) return false;
    if (node.isTextblock && node.textContent === target) pos = offset + 1 + node.content.size;
  });
  if (pos === null) return false;
  editor.dispatch(editor.state.tr.insertText(marker, pos));
  return true;
}

export function paragraphCount(editor) {
  let n = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') n++;
  });
  return n;
}

export async function save(editor) {
  const bytes = await editor.exportDocx();
  editor.destroy();
  return new Uint8Array(bytes);
}
