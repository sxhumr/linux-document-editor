// Generates the synthetic DOCX compatibility corpus into fixtures/docx/.
// Every fixture is built from scratch here, so no private document is ever committed.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import JSZip from 'jszip';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { EDIT_TARGET, FIXTURE_DIR as outDir } from '../lib/corpus.mjs';

const editTarget = () => new Paragraph({ children: [new TextRun(EDIT_TARGET)] });

/** A tiny valid RGB PNG, built by hand so fixtures need no binary assets. */
function png(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill([r, g, b]).flat())]);
  const raw = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: ['•', '◦', '▪'][level],
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    },
    {
      reference: 'numbers',
      levels: [0, 1, 2].map((level) => ({
        level,
        format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level],
        text: `%${level + 1}.`,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    },
  ],
};

const doc = (children, extra = {}) =>
  new Document({ numbering, ...extra, sections: extra.sections ?? [{ children: [editTarget(), ...children] }] });

const fixtures = {
  'basic-formatting': doc([
    new Paragraph({ text: 'Heading One', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Heading Two', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: 'Heading Three', heading: HeadingLevel.HEADING_3 }),
    new Paragraph({
      children: [
        new TextRun('Plain, '),
        new TextRun({ text: 'bold', bold: true }),
        new TextRun(', '),
        new TextRun({ text: 'italic', italics: true }),
        new TextRun(', '),
        new TextRun({ text: 'underline', underline: {} }),
        new TextRun(', '),
        new TextRun({ text: 'all three', bold: true, italics: true, underline: {} }),
        new TextRun('.'),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: 'Times New Roman 14pt', font: 'Times New Roman', size: 28 })] }),
    new Paragraph({ children: [new TextRun({ text: 'Courier New 9pt', font: 'Courier New', size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: 'Arial 20pt red', font: 'Arial', size: 40, color: 'C00000' })] }),
    new Paragraph({ text: 'Centred paragraph.', alignment: AlignmentType.CENTER }),
    new Paragraph({ text: 'Right-aligned paragraph.', alignment: AlignmentType.RIGHT }),
    new Paragraph({
      text: 'Justified paragraph with enough words to wrap across more than one line on a standard page width.',
      alignment: AlignmentType.JUSTIFIED,
    }),
  ]),

  lists: doc([
    new Paragraph({ text: 'Bullet one', numbering: { reference: 'bullets', level: 0 } }),
    new Paragraph({ text: 'Bullet nested', numbering: { reference: 'bullets', level: 1 } }),
    new Paragraph({ text: 'Bullet nested deeper', numbering: { reference: 'bullets', level: 2 } }),
    new Paragraph({ text: 'Bullet two', numbering: { reference: 'bullets', level: 0 } }),
    new Paragraph({ text: 'Between lists.' }),
    new Paragraph({ text: 'Number one', numbering: { reference: 'numbers', level: 0 } }),
    new Paragraph({ text: 'Number nested a', numbering: { reference: 'numbers', level: 1 } }),
    new Paragraph({ text: 'Number nested b', numbering: { reference: 'numbers', level: 1 } }),
    new Paragraph({ text: 'Number two', numbering: { reference: 'numbers', level: 0 } }),
  ]),

  tables: doc([
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        ['Name', 'Qty', 'Price'],
        ['Apples', '3', '1.20'],
        ['Pears', '5', '0.80'],
      ].map(
        (cells, r) =>
          new TableRow({
            children: cells.map(
              (text) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text, bold: r === 0 })] })],
                }),
            ),
          }),
      ),
    }),
    new Paragraph({ text: 'After the table.' }),
  ]),

  images: doc([
    new Paragraph({
      children: [
        new TextRun('Inline image: '),
        new ImageRun({ type: 'png', data: png(32, 16, [30, 90, 200]), transformation: { width: 64, height: 32 } }),
      ],
    }),
    new Paragraph({
      children: [new ImageRun({ type: 'png', data: png(8, 8, [200, 60, 30]), transformation: { width: 48, height: 48 } })],
    }),
  ]),

  'layout-sections': doc([], {
    sections: [
      {
        headers: { default: new Header({ children: [new Paragraph('Header text section one')] }) },
        footers: { default: new Footer({ children: [new Paragraph('Footer text section one')] }) },
        children: [
          editTarget(),
          new Paragraph({
            children: [
              new TextRun('Visit '),
              new ExternalHyperlink({
                link: 'https://example.com/pagelite',
                children: [new TextRun({ text: 'example.com', style: 'Hyperlink' })],
              }),
              new TextRun(' for details.'),
            ],
          }),
          new Paragraph({ children: [new TextRun('Before page break.'), new PageBreak()] }),
          new Paragraph('After page break.'),
        ],
      },
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        headers: { default: new Header({ children: [new Paragraph('Header text section two')] }) },
        children: [new Paragraph('Landscape section body.')],
      },
    ],
  }),

  unicode: doc([
    new Paragraph('Accents: café, naïve, façade, Ångström.'),
    new Paragraph('Greek: αβγδ; Cyrillic: Привет мир.'),
    new Paragraph('CJK: 日本語のテキスト, 中文文本, 한국어.'),
    new Paragraph('RTL: שלום עולם, مرحبا بالعالم.'),
    new Paragraph('Emoji: 📄✏️✅ and symbols: ≤ ≥ ≠ € £ ©.'),
  ]),

  'long-document': doc(
    Array.from({ length: 2000 }, (_, i) =>
      i % 50 === 0
        ? new Paragraph({ text: `Section ${i / 50 + 1}`, heading: HeadingLevel.HEADING_2 })
        : new Paragraph({
            children: [
              new TextRun(`Paragraph ${i}. `),
              new TextRun({ text: 'Lorem ipsum dolor sit amet, ', bold: i % 3 === 0 }),
              new TextRun({ text: 'consectetur adipiscing elit.', italics: i % 5 === 0 }),
            ],
          }),
    ),
  ),

  'empty-document': new Document({ sections: [{ children: [] }] }),
};

/** Hand-built broken inputs: the editor must reject them cleanly, never crash or hang. */
async function malformedFixtures() {
  const missingDocument = new JSZip();
  missingDocument.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  const valid = await Packer.toBuffer(fixtures['basic-formatting']);
  return {
    'malformed-not-a-zip': Buffer.from('This is plain text with a .docx extension.\n'),
    'malformed-truncated': valid.subarray(0, Math.floor(valid.length / 2)),
    'malformed-missing-document': await missingDocument.generateAsync({ type: 'nodebuffer' }),
  };
}

await mkdir(outDir, { recursive: true });
for (const [name, document] of Object.entries(fixtures)) {
  await writeFile(path.join(outDir, `${name}.docx`), await Packer.toBuffer(document));
}
for (const [name, bytes] of Object.entries(await malformedFixtures())) {
  await writeFile(path.join(outDir, `${name}.docx`), bytes);
}
console.log(`Wrote ${Object.keys(fixtures).length + 3} fixtures to ${path.relative(process.cwd(), outDir)}`);
