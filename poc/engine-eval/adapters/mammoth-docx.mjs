// Candidate: the open-source "Tiptap route" — mammoth (DOCX → HTML) for import and the
// `docx` builder (→ DOCX) for export. The HTML stands in for the editor's document model:
// Tiptap/ProseMirror would sit between the two and could only narrow what survives, so this
// result is an upper bound for that architecture. The HTML → DOCX mapping below is code
// PageLite would have to own.
import mammoth from 'mammoth';
import { parseHTML } from 'linkedom';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

export const id = 'mammoth-docx';
export const label = 'mammoth 1.13.0 + docx 9.11.0';
export const pkgName = 'mammoth';

export async function open(bytes) {
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    // Underline is dropped by default; this is mammoth's documented opt-in.
    { styleMap: ['u => u'] },
  );
  const { document } = parseHTML(`<!doctype html><html><body>${result.value}</body></html>`);
  return { document, warnings: result.messages };
}

export function appendToParagraph({ document }, target, marker) {
  const p = Array.from(document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')).find((el) => el.textContent === target);
  if (!p) return false;
  p.appendChild(document.createTextNode(marker));
  return true;
}

export function paragraphCount({ document }) {
  return document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li').length;
}

const HEADINGS = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };

function runs(node, marks = {}) {
  const out = [];
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent) out.push(new TextRun({ text: n.textContent, ...marks }));
    } else if (n.nodeType === 1) {
      const tag = n.tagName;
      if (tag === 'STRONG' || tag === 'B') out.push(...runs(n, { ...marks, bold: true }));
      else if (tag === 'EM' || tag === 'I') out.push(...runs(n, { ...marks, italics: true }));
      else if (tag === 'U') out.push(...runs(n, { ...marks, underline: {} }));
      else if (tag === 'BR') out.push(new TextRun({ break: 1 }));
      else if (tag === 'A' && /^https?:/.test(n.getAttribute('href') ?? '')) {
        out.push(new ExternalHyperlink({ link: n.getAttribute('href'), children: runs(n, { ...marks, style: 'Hyperlink' }) }));
      } else if (tag === 'IMG') {
        const match = /^data:image\/(png|jpeg|gif);base64,(.*)$/.exec(n.getAttribute('src') ?? '');
        // mammoth does not carry the display size; a fixed box is the honest fallback.
        if (match) out.push(new ImageRun({ type: match[1] === 'jpeg' ? 'jpg' : match[1], data: Buffer.from(match[2], 'base64'), transformation: { width: 64, height: 64 } }));
      } else out.push(...runs(n, marks));
    }
  }
  return out;
}

function blocks(container, listLevel = -1, listRef = null) {
  const out = [];
  for (const el of container.children) {
    const tag = el.tagName;
    if (HEADINGS[tag]) out.push(new Paragraph({ heading: HEADINGS[tag], children: runs(el) }));
    else if (tag === 'P') out.push(new Paragraph({ children: runs(el) }));
    else if (tag === 'UL' || tag === 'OL') out.push(...blocks(el, listLevel + 1, tag === 'UL' ? 'bullets' : 'numbers'));
    else if (tag === 'LI') {
      // An <li> holds inline content followed by optional nested lists.
      const inline = el.cloneNode(true);
      for (const nested of Array.from(inline.querySelectorAll(':scope > ul, :scope > ol'))) nested.remove();
      out.push(new Paragraph({ numbering: { reference: listRef, level: listLevel }, children: runs(inline) }));
      for (const nested of el.querySelectorAll(':scope > ul, :scope > ol')) {
        out.push(...blocks(nested, listLevel + 1, nested.tagName === 'UL' ? 'bullets' : 'numbers'));
      }
    } else if (tag === 'TABLE') {
      const rows = Array.from(el.querySelectorAll('tr')).map(
        (tr) =>
          new TableRow({
            children: Array.from(tr.children).map((td) => {
              const content = blocks(td);
              return new TableCell({ children: content.length ? content : [new Paragraph('')] });
            }),
          }),
      );
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    } else out.push(...blocks(el, listLevel, listRef));
  }
  return out;
}

const listLevels = (formats) =>
  formats.map((format, level) => ({
    level,
    format,
    text: format === LevelFormat.BULLET ? '•' : `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

export async function save({ document }) {
  const doc = new Document({
    numbering: {
      config: [
        { reference: 'bullets', levels: listLevels(Array(9).fill(LevelFormat.BULLET)) },
        // HTML <ol> has no per-level format, so every level comes back decimal.
        { reference: 'numbers', levels: listLevels(Array(9).fill(LevelFormat.DECIMAL)) },
      ],
    },
    sections: [{ children: blocks(document.body) }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
