// Engine-independent DOCX inspector. Reads the OOXML directly (JSZip + xmldom) and extracts
// the features the compatibility corpus exercises, so the engine's output is judged by a
// separate yardstick rather than by its own reader. Ported from the Milestone 1 PoC
// (poc/engine-eval/lib/inspect.mjs) and extended in Milestone 6.
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser, type Document as XmlDocument, type Element } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';

type Node = Element | XmlDocument;
type Rel = { type: string; target: string; external: boolean };

const parse = (xml: string) => new DOMParser({ onError: () => {} }).parseFromString(xml, 'application/xml');
const all = (node: Node | null | undefined, ns: string, name: string): Element[] =>
  node ? Array.from(node.getElementsByTagNameNS(ns, name)) : [];
const child = (node: Element | null | undefined, name: string): Element | undefined =>
  Array.from(node?.childNodes ?? []).find(
    (n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === W && (n as Element).localName === name,
  );
const wattr = (node: Element | null | undefined, name: string) =>
  node?.getAttributeNS(W, name) || node?.getAttribute(`w:${name}`) || null;
const wval = (node: Element | null | undefined) => wattr(node, 'val');
const isOn = (prop: Element | undefined) => prop != null && !['0', 'false', 'none'].includes(wval(prop) ?? 'true');
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

function paragraphText(p: Element) {
  let text = '';
  for (const n of all(p, W, '*')) {
    if (n.localName === 't') text += n.textContent;
    else if (n.localName === 'tab' && (n.parentNode as Element | null)?.localName === 'r') text += '\t';
  }
  return text;
}

/** Text of each run carrying a run property, in document order. Robust to run splitting. */
function markedText(body: Element, pred: (rPr: Element | undefined) => boolean) {
  let out = '';
  for (const r of all(body, W, 'r')) {
    if (pred(child(r, 'rPr')))
      out += all(r, W, 't')
        .map((t) => t.textContent)
        .join('');
  }
  return out;
}

async function readXml(zip: JSZip, name: string) {
  const file = zip.file(name);
  return file ? parse(await file.async('string')) : null;
}

async function relationships(zip: JSZip, part: string) {
  const dir = part.slice(0, part.lastIndexOf('/') + 1);
  const relsDoc = await readXml(zip, `${dir}_rels/${part.slice(dir.length)}.rels`);
  const rels = new Map<string, Rel>();
  for (const rel of all(relsDoc, PKG_R, 'Relationship')) {
    const target = rel.getAttribute('Target') ?? '';
    const external = rel.getAttribute('TargetMode') === 'External';
    rels.set(rel.getAttribute('Id') ?? '', {
      type: (rel.getAttribute('Type') ?? '').split('/').pop() ?? '',
      target: external ? target : new URL(target, `http://x/${dir}`).pathname.slice(1),
      external,
    });
  }
  return rels;
}

/** numId → ilvl → numFmt, so lists compare by kind and level rather than by internal ids. */
async function listFormats(zip: JSZip) {
  const numbering = await readXml(zip, 'word/numbering.xml');
  const abstract = new Map<string, Map<string, string | null>>();
  for (const a of all(numbering, W, 'abstractNum')) {
    const levels = new Map(all(a, W, 'lvl').map((l) => [wattr(l, 'ilvl') ?? '', wval(child(l, 'numFmt'))]));
    abstract.set(wattr(a, 'abstractNumId') ?? '', levels);
  }
  const nums = new Map<string, Map<string, string | null>>();
  for (const n of all(numbering, W, 'num')) {
    nums.set(wattr(n, 'numId') ?? '', abstract.get(wval(child(n, 'abstractNumId')) ?? '') ?? new Map());
  }
  return nums;
}

/** Note texts of one kind, skipping Word's separator notes, keyed by the order they are referenced. */
async function noteTexts(zip: JSZip, rels: Map<string, Rel>, body: Element, kind: 'footnote' | 'endnote') {
  const rel = [...rels.values()].find((r) => r.type === `${kind}s`);
  const part = rel && (await readXml(zip, rel.target));
  const byId = new Map(
    all(part, W, kind)
      .filter((n) => !wattr(n, 'type'))
      .map((n) => [wattr(n, 'id'), all(n, W, 'p').map(paragraphText).join('\n').trim()]),
  );
  return all(body, W, `${kind}Reference`).map((ref) => byId.get(wattr(ref, 'id')) ?? '(missing)');
}

/** `author: text` per comment, with replies marked by their parent's text. */
async function commentTexts(zip: JSZip, rels: Map<string, Rel>) {
  const find = (type: string) => [...rels.values()].find((r) => r.type === type)?.target;
  const comments = await readXml(zip, find('comments') ?? 'word/comments.xml');
  const extended = await readXml(zip, find('commentsExtended') ?? 'word/commentsExtended.xml');
  const parentOf = new Map(
    all(extended, W15, 'commentEx').map((c) => [
      c.getAttributeNS(W15, 'paraId'),
      c.getAttributeNS(W15, 'paraIdParent'),
    ]),
  );
  const textOfPara = new Map<string, string>();
  const entries = all(comments, W, 'comment').map((c) => {
    const paras = all(c, W, 'p');
    const text = paras.map(paragraphText).join('\n').trim();
    for (const p of paras) textOfPara.set(p.getAttributeNS(W14, 'paraId') ?? '', text);
    return { author: wattr(c, 'author') ?? '?', text, paraId: paras.at(-1)?.getAttributeNS(W14, 'paraId') ?? '' };
  });
  return entries.map(({ author, text, paraId }) => {
    const parent = parentOf.get(paraId);
    return parent ? `${author}: ${text} (reply to: ${textOfPara.get(parent) ?? '?'})` : `${author}: ${text}`;
  });
}

const XMLNS = 'http://www.w3.org/2000/xmlns/';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
/**
 * Paragraph identity stamps. The engine adds them to paragraphs that lack one, as Word does;
 * they carry no content. Reply threading, which does depend on them, is checked separately
 * through the `comments` feature.
 */
const isIdentityStamp = (a: { namespaceURI: string | null; localName: string | null }) =>
  a.namespaceURI === W14 && (a.localName === 'paraId' || a.localName === 'textId');
/** Text a reader would change if xml:space="preserve" were missing. */
const needsPreserve = (text: string) => /^\s|\s$|\s\s|[\t\n\r]/.test(text);

/**
 * XML content with serialization choices removed, so two parts with the same canonical form
 * say the same thing to any conforming reader. Ignored: the declaration, namespace prefixes
 * and declaration order, attribute order, `mc:Ignorable` token order, whitespace-only text
 * between elements, `xml:space="preserve"` on text that has no whitespace to preserve, and
 * paragraph identity stamps.
 */
function canonicalXml(node: Element): string {
  const ownText = Array.from(node.childNodes)
    .filter((n) => n.nodeType === 3 || n.nodeType === 4)
    .map((n) => n.nodeValue ?? '')
    .join('');
  const hasElements = Array.from(node.childNodes).some((n) => n.nodeType === 1);
  const attrs = Array.from(node.attributes)
    .filter((a) => a.namespaceURI !== XMLNS && !isIdentityStamp(a))
    .filter((a) => !(a.namespaceURI === XML_NS && a.localName === 'space' && !needsPreserve(ownText)))
    .map((a) => {
      const value = a.namespaceURI === MC ? a.value.trim().split(/\s+/).sort().join(' ') : a.value;
      return `{${a.namespaceURI ?? ''}}${a.localName}=${JSON.stringify(value)}`;
    })
    .sort();
  const children = Array.from(node.childNodes)
    .map((n) => {
      if (n.nodeType === 1) return canonicalXml(n as Element);
      if (n.nodeType !== 3 && n.nodeType !== 4) return '';
      const text = n.nodeValue ?? '';
      return hasElements && text.trim() === '' ? '' : JSON.stringify(text);
    })
    .join('');
  return `<{${node.namespaceURI ?? ''}}${node.localName} ${attrs.join(' ')}>${children}</>`;
}

/**
 * `mc:Ignorable` / `mc:ProcessContent` prefixes with no namespace declaration in scope.
 * Word refuses such a file as unreadable, so a serializer that drops "unused" declarations
 * breaks documents even though the XML is otherwise well-formed.
 */
function undeclaredIgnorablePrefixes(root: Element): string[] {
  const missing: string[] = [];
  const walk = (el: Element) => {
    for (const name of ['Ignorable', 'ProcessContent']) {
      const value = el.getAttributeNS(MC, name);
      for (const prefix of value ? value.trim().split(/\s+/) : []) {
        if (!el.lookupNamespaceURI(prefix.split(':')[0])) missing.push(`${el.localName}@${name}: ${prefix}`);
      }
    }
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 1) walk(n as Element);
  };
  walk(root);
  return missing;
}

const isXmlPart = (name: string) => /\.(xml|rels)$/i.test(name);

/**
 * Every package part and a hash of its content: canonical XML for XML parts, raw bytes
 * otherwise. Plus any part that would make Word reject the file.
 */
async function partInventory(zip: JSZip) {
  const parts: Record<string, string> = {};
  const problems: string[] = [];
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    let content: string | Buffer = await file.async('nodebuffer');
    if (isXmlPart(file.name)) {
      const root = parse(content.toString('utf8')).documentElement;
      if (!root) {
        problems.push(`${file.name}: not well-formed XML`);
        continue;
      }
      content = canonicalXml(root);
      problems.push(...undeclaredIgnorablePrefixes(root).map((p) => `${file.name}: undeclared ${p}`));
    }
    parts[file.name] = createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
  return { parts, problems };
}

export interface Features {
  paragraphTexts: string[];
  emptyParagraphs: number;
  headings: string[];
  boldText: string;
  italicText: string;
  underlineText: string;
  fonts: string[];
  sizes: string[];
  colors: string[];
  alignment: string[];
  listItems: string[];
  tables: string[][];
  mergedCells: string[];
  images: string[];
  floatingObjects: number;
  textBoxes: string[];
  pageBreaks: number;
  sections: string[];
  headers: string[];
  footers: string[];
  hyperlinks: string[];
  bookmarks: string[];
  footnotes: string[];
  endnotes: string[];
  comments: string[];
  commentRanges: string[];
  revisions: string[];
  fields: string[];
  paragraphStyles: string[];
  characterStyles: string[];
  rightToLeft: string[];
}

/** Every key of Features, in a stable order: the suite makes one test per key. */
export const FEATURE_KEYS = [
  'paragraphTexts',
  'emptyParagraphs',
  'headings',
  'boldText',
  'italicText',
  'underlineText',
  'fonts',
  'sizes',
  'colors',
  'alignment',
  'listItems',
  'tables',
  'mergedCells',
  'images',
  'floatingObjects',
  'textBoxes',
  'pageBreaks',
  'sections',
  'headers',
  'footers',
  'hyperlinks',
  'bookmarks',
  'footnotes',
  'endnotes',
  'comments',
  'commentRanges',
  'revisions',
  'fields',
  'paragraphStyles',
  'characterStyles',
  'rightToLeft',
] as const satisfies readonly (keyof Features)[];

export type Inspection =
  | {
      ok: true;
      features: Features;
      /** Part name → hash of its canonical content. */
      parts: Record<string, string>;
      /** Defects that would make Word refuse the file. */
      problems: string[];
    }
  | { ok: false; error: string };

export async function inspectDocx(bytes: Uint8Array): Promise<Inspection> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    return { ok: false, error: `not a zip: ${(e as Error).message}` };
  }
  const rootRels = await relationships(zip, '');
  const main = [...rootRels.values()].find((r) => r.type === 'officeDocument')?.target ?? 'word/document.xml';
  const doc = await readXml(zip, main);
  const body = all(doc, W, 'body')[0];
  if (!body) return { ok: false, error: `no w:body in ${main}` };

  const rels = await relationships(zip, main);
  const formats = await listFormats(zip);
  const paragraphs = all(body, W, 'p');
  const pPr = (p: Element) => child(p, 'pPr');
  const styleOf = (p: Element) => wval(child(pPr(p), 'pStyle')) ?? '';

  const stories = async (kind: 'header' | 'footer') => {
    const roots: Element[] = [];
    for (const ref of all(body, W, `${kind}Reference`)) {
      const rel = rels.get(ref.getAttributeNS(R, 'id') ?? '');
      const story = rel && (await readXml(zip, rel.target));
      if (story?.documentElement) roots.push(story.documentElement);
    }
    return roots;
  };
  const headerRoots = await stories('header');
  const footerRoots = await stories('footer');
  const storyText = (roots: Element[]) =>
    sorted(roots.map((root) => all(root, W, 'p').map(paragraphText).join('\n').trim())).filter(Boolean);

  // Image identity (content hash) plus displayed size in EMU, so a re-embedded image that
  // lost its size or crop is not mistaken for a preserved one.
  const images: string[] = [];
  for (const drawing of all(body, W, 'drawing')) {
    const blip = all(drawing, A, 'blip')[0];
    const rel = blip && rels.get(blip.getAttributeNS(R, 'embed') ?? '');
    const file = rel && zip.file(rel.target);
    const extent = all(drawing, WP, 'extent')[0];
    const size = extent ? `${extent.getAttribute('cx')}x${extent.getAttribute('cy')}` : '?';
    const hash = file
      ? createHash('sha256')
          .update(await file.async('nodebuffer'))
          .digest('hex')
          .slice(0, 12)
      : 'missing';
    images.push(`${hash}@${size}`);
  }

  // Field codes from simple fields and complex-field instructions, in body and furniture.
  const fieldRoots = [body, ...headerRoots, ...footerRoots];
  const fields = fieldRoots
    .flatMap((root) => [
      ...all(root, W, 'fldSimple').map((f) => wattr(f, 'instr') ?? ''),
      ...all(root, W, 'instrText').map((t) => t.textContent ?? ''),
    ])
    .map((code) => code.trim().split(/\s+/)[0])
    .filter(Boolean)
    .sort();

  const features: Features = {
    // Empty paragraphs are counted separately: engines legitimately add or drop them around
    // section breaks, and that should not mask whether real text survived.
    paragraphTexts: paragraphs.map(paragraphText).filter((t) => t !== ''),
    emptyParagraphs: paragraphs.filter((p) => paragraphText(p) === '').length,
    headings: paragraphs
      .filter((p) => /heading|title/i.test(styleOf(p)))
      .map((p) => `${styleOf(p)}: ${paragraphText(p)}`),
    boldText: markedText(body, (rPr) => isOn(child(rPr, 'b'))),
    italicText: markedText(body, (rPr) => isOn(child(rPr, 'i'))),
    underlineText: markedText(body, (rPr) => isOn(child(rPr, 'u'))),
    fonts: sorted(all(body, W, 'rFonts').map((f) => wattr(f, 'ascii') ?? '')).filter(Boolean),
    sizes: sorted(all(body, W, 'sz').map((s) => wval(s) ?? '')),
    colors: sorted(all(body, W, 'color').map((c) => wval(c) ?? '')),
    alignment: paragraphs
      .filter((p) => child(pPr(p), 'jc'))
      .map((p) => `${wval(child(pPr(p), 'jc'))}: ${paragraphText(p)}`),
    listItems: paragraphs
      .filter((p) => child(pPr(p), 'numPr'))
      .map((p) => {
        const numPr = child(pPr(p), 'numPr');
        const ilvl = wval(child(numPr, 'ilvl')) ?? '0';
        const fmt = formats.get(wval(child(numPr, 'numId')) ?? '')?.get(ilvl) ?? '?';
        return `${fmt}@${ilvl}: ${paragraphText(p)}`;
      }),
    tables: all(body, W, 'tbl').map((t) =>
      all(t, W, 'tr').map((tr) => all(tr, W, 'tc').map(paragraphText).join(' | ')),
    ),
    mergedCells: all(body, W, 'tc')
      .map((tc) => {
        const tcPr = child(tc, 'tcPr');
        const span = wval(child(tcPr, 'gridSpan'));
        const vMerge = child(tcPr, 'vMerge');
        const kind = [span && span !== '1' ? `span ${span}` : '', vMerge ? `vMerge ${wval(vMerge) ?? 'continue'}` : '']
          .filter(Boolean)
          .join(', ');
        return kind ? `${kind}: ${all(tc, W, 'p').map(paragraphText).join(' ')}` : '';
      })
      .filter(Boolean),
    images,
    floatingObjects: all(body, WP, 'anchor').length,
    textBoxes: all(body, W, 'txbxContent').map((t) => all(t, W, 'p').map(paragraphText).join('\n').trim()),
    pageBreaks:
      all(body, W, 'br').filter((br) => wattr(br, 'type') === 'page').length +
      all(body, W, 'pageBreakBefore').filter(isOn).length,
    sections: all(body, W, 'sectPr').map((s) => wattr(child(s, 'pgSz'), 'orient') || 'portrait'),
    headers: storyText(headerRoots),
    footers: storyText(footerRoots),
    hyperlinks: all(body, W, 'hyperlink').map((h) => {
      const rel = rels.get(h.getAttributeNS(R, 'id') ?? '');
      return `${rel?.target ?? '#' + (wattr(h, 'anchor') ?? '')} -> ${paragraphText(h)}`;
    }),
    // _GoBack and _Toc* bookmarks are editor bookkeeping, not author content.
    bookmarks: sorted(all(body, W, 'bookmarkStart').map((b) => wattr(b, 'name') ?? '')).filter(
      (n) => n && !n.startsWith('_'),
    ),
    footnotes: await noteTexts(zip, rels, body, 'footnote'),
    endnotes: await noteTexts(zip, rels, body, 'endnote'),
    comments: await commentTexts(zip, rels),
    commentRanges: all(body, W, 'commentRangeStart').map((start) => {
      const id = wattr(start, 'id');
      const end = all(body, W, 'commentRangeEnd').find((e) => wattr(e, 'id') === id);
      const ref = all(body, W, 'commentReference').find((e) => wattr(e, 'id') === id);
      return `${end ? 'closed' : 'open'}${ref ? '+ref' : ''}`;
    }),
    revisions: [
      ...all(body, W, 'ins').map(
        (n) =>
          `ins ${wattr(n, 'author')}: ${all(n, W, 't')
            .map((t) => t.textContent)
            .join('')}`,
      ),
      ...all(body, W, 'del').map(
        (n) =>
          `del ${wattr(n, 'author')}: ${all(n, W, 'delText')
            .map((t) => t.textContent)
            .join('')}`,
      ),
      ...all(body, W, 'rPrChange').map((n) => `format ${wattr(n, 'author')}`),
    ],
    fields,
    // Style ids as applied, in document order (headings are also covered by `headings`).
    paragraphStyles: paragraphs.map(styleOf).filter(Boolean),
    characterStyles: all(body, W, 'rStyle').map((s) => wval(s) ?? ''),
    rightToLeft: [
      ...paragraphs.filter((p) => isOn(child(pPr(p), 'bidi'))).map((p) => `bidi: ${paragraphText(p)}`),
      ...all(body, W, 'r')
        .filter((r) => isOn(child(child(r, 'rPr'), 'rtl')))
        .map(
          (r) =>
            `rtl: ${all(r, W, 't')
              .map((t) => t.textContent)
              .join('')}`,
        ),
    ],
  };
  return { ok: true, features, ...(await partInventory(zip)) };
}

/** What the suite did to the document, so the comparison knows what to expect. */
export interface AppliedEdits {
  target: string;
  marker: string;
  /** A word inside `target` that was made bold, or null if not applied. */
  bold: string | null;
  /** The target paragraph was centred. */
  centred: boolean;
}

export type Comparison = Record<keyof Features, { kept: true } | { kept: false; expected: unknown; actual: unknown }>;

/**
 * Compares the output with the original after applying the edits we asked for. Each feature
 * is 'kept' only on an exact match; anything else is reported with both values.
 */
export function compareFeatures(original: Features, output: Features, edits: AppliedEdits): Comparison {
  const expected = structuredClone(original);
  const { target, marker } = edits;
  const edited = target + marker;
  const swap = (s: string) => s.split(target).join(edited);
  expected.paragraphTexts = expected.paragraphTexts.map((t) => (t === target ? edited : t));
  for (const key of ['headings', 'listItems', 'hyperlinks', 'textBoxes'] as const) {
    expected[key] = expected[key].map(swap);
  }
  expected.alignment = expected.alignment.map(swap);
  expected.tables = expected.tables.map((rows) => rows.map(swap));
  expected.rightToLeft = expected.rightToLeft.map(swap);
  // The edit target is always the document's first paragraph, so its edits come first.
  if (edits.bold) expected.boldText = edits.bold + expected.boldText;
  if (edits.centred) {
    expected.alignment = [`center: ${edited}`, ...expected.alignment.filter((a) => !a.endsWith(`: ${edited}`))];
  }

  return compareKeys(expected, output, FEATURE_KEYS);
}

function compareKeys<T extends object>(expected: T, output: T, keys: readonly (keyof T)[]) {
  const result = {} as Record<keyof T, { kept: true } | { kept: false; expected: unknown; actual: unknown }>;
  for (const key of keys) {
    const a = JSON.stringify(expected[key]);
    const b = JSON.stringify(output[key]);
    result[key] = a === b ? { kept: true } : { kept: false, expected: expected[key], actual: output[key] };
  }
  return result;
}

/** The part of a `label: text` entry before the text. */
const label = (entry: string) => entry.split(': ')[0];

/**
 * The document's structure with the text taken out, for edits that change many paragraphs'
 * text: what each list item, link, comment, revision, note and style is, but not what it says.
 */
export function structureOf(f: Features) {
  return {
    paragraphs: f.paragraphTexts.length,
    headings: f.headings.map(label),
    listItems: f.listItems.map(label),
    tables: f.tables.map((rows) => rows.map((row) => row.split(' | ').length)),
    mergedCells: f.mergedCells.map(label),
    alignment: f.alignment.map(label),
    hyperlinks: f.hyperlinks.map((h) => h.split(' -> ')[0]),
    bookmarks: f.bookmarks,
    footnotes: f.footnotes,
    endnotes: f.endnotes,
    comments: f.comments,
    commentRanges: f.commentRanges,
    revisions: f.revisions,
    fields: f.fields,
    images: f.images,
    floatingObjects: f.floatingObjects,
    textBoxes: f.textBoxes,
    pageBreaks: f.pageBreaks,
    sections: f.sections,
    headers: f.headers,
    footers: f.footers,
    paragraphStyles: f.paragraphStyles,
    characterStyles: f.characterStyles,
    rightToLeft: f.rightToLeft.map(label),
    fonts: f.fonts,
    sizes: f.sizes,
    colors: f.colors,
  };
}

export type Structure = ReturnType<typeof structureOf>;

export const compareStructure = (original: Features, output: Features) => {
  const before = structureOf(original);
  return compareKeys(before, structureOf(output), Object.keys(before) as (keyof Structure)[]);
};
