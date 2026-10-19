// Engine-independent DOCX inspector. Reads the OOXML directly (JSZip + xmldom) and
// extracts the features the compatibility corpus exercises, so every candidate's output
// is judged by the same yardstick rather than by its own reader.
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';

const parse = (xml) => new DOMParser({ onError: () => {} }).parseFromString(xml, 'application/xml');
const all = (node, ns, name) => (node ? Array.from(node.getElementsByTagNameNS(ns, name)) : []);
const child = (node, name) => Array.from(node?.childNodes ?? []).find((n) => n.namespaceURI === W && n.localName === name);
const wval = (node) => node?.getAttributeNS(W, 'val') ?? node?.getAttribute('w:val') ?? null;
const isOn = (prop) => prop != null && !['0', 'false', 'none'].includes(wval(prop) ?? 'true');

function paragraphText(p) {
  let text = '';
  for (const n of all(p, W, '*')) {
    if (n.localName === 't') text += n.textContent;
    else if (n.localName === 'tab' && n.parentNode?.localName === 'r') text += '\t';
  }
  return text;
}

/** Text of each run carrying a run property, in document order. Robust to run splitting. */
function markedText(body, pred) {
  let out = '';
  for (const r of all(body, W, 'r')) {
    const rPr = child(r, 'rPr');
    if (pred(rPr)) out += all(r, W, 't').map((t) => t.textContent).join('');
  }
  return out;
}

async function readXml(zip, name) {
  const file = zip.file(name);
  return file ? parse(await file.async('string')) : null;
}

async function relationships(zip, part) {
  const dir = part.slice(0, part.lastIndexOf('/') + 1);
  const relsDoc = await readXml(zip, `${dir}_rels/${part.slice(dir.length)}.rels`);
  const rels = new Map();
  for (const rel of all(relsDoc, PKG_R, 'Relationship')) {
    const target = rel.getAttribute('Target');
    const external = rel.getAttribute('TargetMode') === 'External';
    rels.set(rel.getAttribute('Id'), {
      type: rel.getAttribute('Type').split('/').pop(),
      target: external ? target : new URL(target, `http://x/${dir}`).pathname.slice(1),
      external,
    });
  }
  return rels;
}

/** numId → ilvl → numFmt, so lists compare by kind and level rather than by internal ids. */
async function listFormats(zip) {
  const numbering = await readXml(zip, 'word/numbering.xml');
  const abstract = new Map();
  for (const a of all(numbering, W, 'abstractNum')) {
    const levels = new Map(all(a, W, 'lvl').map((l) => [l.getAttributeNS(W, 'ilvl'), wval(child(l, 'numFmt'))]));
    abstract.set(a.getAttributeNS(W, 'abstractNumId'), levels);
  }
  const nums = new Map();
  for (const n of all(numbering, W, 'num')) {
    nums.set(n.getAttributeNS(W, 'numId'), abstract.get(wval(child(n, 'abstractNumId'))) ?? new Map());
  }
  return nums;
}

/**
 * @returns {Promise<{ok: true, features: Record<string, unknown>} | {ok: false, error: string}>}
 */
export async function inspectDocx(bytes) {
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    return { ok: false, error: `not a zip: ${e.message}` };
  }
  const rootRels = await relationships(zip, '');
  const main = [...rootRels.values()].find((r) => r.type === 'officeDocument')?.target ?? 'word/document.xml';
  const doc = await readXml(zip, main);
  const body = all(doc, W, 'body')[0];
  if (!body) return { ok: false, error: `no w:body in ${main}` };

  const rels = await relationships(zip, main);
  const formats = await listFormats(zip);
  const paragraphs = all(body, W, 'p');
  const pPr = (p) => child(p, 'pPr');
  const styleOf = (p) => wval(child(pPr(p), 'pStyle')) ?? '';

  const storyText = async (kind) => {
    const texts = [];
    for (const ref of all(body, W, `${kind}Reference`)) {
      const rel = rels.get(ref.getAttributeNS(R, 'id'));
      const story = rel && (await readXml(zip, rel.target));
      if (story) texts.push(all(story, W, 'p').map(paragraphText).join('\n').trim());
    }
    return [...new Set(texts)].filter(Boolean).sort();
  };

  // Image identity (content hash) plus displayed size in EMU, so a re-embedded image that
  // lost its size or crop is not mistaken for a preserved one.
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const mediaHashes = [];
  for (const drawing of all(body, W, 'drawing')) {
    const blip = all(drawing, 'http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
    const rel = blip && rels.get(blip.getAttributeNS(R, 'embed'));
    const file = rel && zip.file(rel.target);
    const extent = all(drawing, WP, 'extent')[0];
    const size = extent ? `${extent.getAttribute('cx')}x${extent.getAttribute('cy')}` : '?';
    const hash = file ? createHash('sha256').update(await file.async('nodebuffer')).digest('hex').slice(0, 12) : 'missing';
    mediaHashes.push(`${hash}@${size}`);
  }

  const features = {
    // Empty paragraphs are counted separately: engines legitimately add or drop them around
    // section breaks, and that should not mask whether real text survived.
    paragraphTexts: paragraphs.map(paragraphText).filter((t) => t !== ''),
    emptyParagraphs: paragraphs.filter((p) => paragraphText(p) === '').length,
    headings: paragraphs.filter((p) => /heading|title/i.test(styleOf(p))).map((p) => `${styleOf(p)}: ${paragraphText(p)}`),
    boldText: markedText(body, (rPr) => isOn(child(rPr, 'b'))),
    italicText: markedText(body, (rPr) => isOn(child(rPr, 'i'))),
    underlineText: markedText(body, (rPr) => isOn(child(rPr, 'u'))),
    fonts: [...new Set(all(body, W, 'rFonts').map((f) => f.getAttributeNS(W, 'ascii')).filter(Boolean))].sort(),
    sizes: [...new Set(all(body, W, 'sz').map(wval))].sort(),
    colors: [...new Set(all(body, W, 'color').map(wval))].sort(),
    alignment: paragraphs
      .filter((p) => child(pPr(p), 'jc'))
      .map((p) => `${wval(child(pPr(p), 'jc'))}: ${paragraphText(p)}`),
    listItems: paragraphs
      .filter((p) => child(pPr(p), 'numPr'))
      .map((p) => {
        const numPr = child(pPr(p), 'numPr');
        const ilvl = wval(child(numPr, 'ilvl')) ?? '0';
        const fmt = formats.get(wval(child(numPr, 'numId')))?.get(ilvl) ?? '?';
        return `${fmt}@${ilvl}: ${paragraphText(p)}`;
      }),
    tables: all(body, W, 'tbl').map((t) => all(t, W, 'tr').map((tr) => all(tr, W, 'tc').map(paragraphText).join(' | '))),
    images: mediaHashes,
    pageBreaks: all(body, W, 'br').filter((br) => br.getAttributeNS(W, 'type') === 'page').length +
      all(body, W, 'pageBreakBefore').filter(isOn).length,
    sections: all(body, W, 'sectPr').map((s) => child(s, 'pgSz')?.getAttributeNS(W, 'orient') || 'portrait'),
    headers: await storyText('header'),
    footers: await storyText('footer'),
    hyperlinks: all(body, W, 'hyperlink').map((h) => {
      const rel = rels.get(h.getAttributeNS(R, 'id'));
      return `${rel?.target ?? '#' + (h.getAttributeNS(W, 'anchor') ?? '')} -> ${paragraphText(h)}`;
    }),
  };
  return { ok: true, features };
}

/**
 * Compares an engine's output with the original, after applying the one edit we asked for.
 * Each feature is 'kept' only on an exact match; anything else is reported with both values.
 */
export function compareFeatures(original, output, { target, marker }) {
  const expected = structuredClone(original);
  const edited = target + marker;
  const swap = (s) => (typeof s === 'string' ? s.split(target).join(edited) : s);
  expected.paragraphTexts = expected.paragraphTexts.map((t) => (t === target ? edited : t));
  for (const key of ['headings', 'alignment', 'listItems', 'hyperlinks']) expected[key] = expected[key].map(swap);
  expected.tables = expected.tables.map((rows) => rows.map(swap));

  const result = {};
  for (const key of Object.keys(expected)) {
    const a = JSON.stringify(expected[key]);
    const b = JSON.stringify(output[key]);
    result[key] = a === b ? { kept: true } : { kept: false, expected: expected[key], actual: output[key] };
  }
  result.editPersisted = { kept: output.paragraphTexts.includes(edited) };
  return result;
}
