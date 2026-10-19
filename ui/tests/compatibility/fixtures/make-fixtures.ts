// Generates the synthetic DOCX compatibility corpus into fixtures/docx/.
// Every fixture is built from scratch here, so no private document is ever committed.
// Run with `npm run fixtures` (Node strips the types; no build step).
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import JSZip from 'jszip';
import {
  AlignmentType,
  Bookmark,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  EndnoteReferenceRun,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  Textbox,
  TextRun,
  TextWrappingType,
  WidthType,
} from 'docx';
import { EDIT_TARGET, FIXTURE_DIR as outDir } from '../corpus.ts';

const editTarget = () => new Paragraph({ children: [new TextRun(EDIT_TARGET)] });

/** A tiny valid RGB PNG, built by hand so fixtures need no binary assets. */
function png(width: number, height: number, [r, g, b]: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
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

type DocumentOptions = ConstructorParameters<typeof Document>[0];
type SectionChildren = DocumentOptions['sections'][number]['children'];

const doc = (children: SectionChildren, extra: Partial<DocumentOptions> = {}) =>
  new Document({ numbering, ...extra, sections: extra.sections ?? [{ children: [editTarget(), ...children] }] });

const REVIEWER = { author: 'PageLite Fixture', date: '2026-10-19T09:00:00Z' };
const COMMENTER = { author: REVIEWER.author, date: new Date(REVIEWER.date) };

const fixtures: Record<string, Document> = {
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
      children: [
        new ImageRun({ type: 'png', data: png(8, 8, [200, 60, 30]), transformation: { width: 48, height: 48 } }),
      ],
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

  // ---- Milestone 6 additions ----------------------------------------------------------

  hyperlinks: doc([
    new Paragraph({
      children: [
        new TextRun('External: '),
        new ExternalHyperlink({
          link: 'https://example.com/docs?q=pagelite&lang=en',
          children: [new TextRun({ text: 'query link', style: 'Hyperlink' })],
        }),
        new TextRun('.'),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('Formatted: '),
        new ExternalHyperlink({
          link: 'mailto:someone@example.com',
          children: [new TextRun({ text: 'bold mail link', style: 'Hyperlink', bold: true })],
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('Internal: '),
        new InternalHyperlink({
          anchor: 'appendix',
          children: [new TextRun({ text: 'jump to appendix', style: 'Hyperlink' })],
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new Bookmark({ id: 'appendix', children: [new TextRun('Appendix')] })],
    }),
  ]),

  'footnotes-endnotes': doc(
    [
      new Paragraph({
        children: [
          new TextRun('A sentence with a footnote'),
          new FootnoteReferenceRun(1),
          new TextRun(' and another'),
          new FootnoteReferenceRun(2),
          new TextRun('.'),
        ],
      }),
      new Paragraph({
        children: [new TextRun('A sentence with an endnote'), new EndnoteReferenceRun(1), new TextRun('.')],
      }),
    ],
    {
      footnotes: {
        1: { children: [new Paragraph('First footnote text.')] },
        2: {
          children: [new Paragraph({ children: [new TextRun({ text: 'Second footnote, italic.', italics: true })] })],
        },
      },
      endnotes: { 1: { children: [new Paragraph('Endnote text.')] } },
    },
  ),

  comments: doc(
    [
      new Paragraph({
        children: [
          new TextRun('Some '),
          new CommentRangeStart(0),
          new TextRun('commented text'),
          new CommentRangeEnd(0),
          new TextRun({ children: [new CommentReference(0)] }),
          new TextRun(' in a paragraph.'),
        ],
      }),
      new Paragraph({
        children: [
          new CommentRangeStart(2),
          new TextRun('A second comment range.'),
          new CommentRangeEnd(2),
          new TextRun({ children: [new CommentReference(2)] }),
        ],
      }),
    ],
    {
      comments: {
        children: [
          { id: 0, ...COMMENTER, initials: 'PF', children: [new Paragraph('Is this wording right?')] },
          {
            id: 1,
            parentId: 0,
            author: 'Second Reviewer',
            date: COMMENTER.date,
            initials: 'SR',
            children: [new Paragraph('Yes, keep it.')],
          },
          { id: 2, ...COMMENTER, initials: 'PF', children: [new Paragraph('Standalone comment.')] },
        ],
      },
    },
  ),

  'tracked-changes': doc([
    new Paragraph({
      children: [
        new TextRun('Kept text, '),
        new InsertedTextRun({ text: 'inserted text', id: 1, ...REVIEWER }),
        new TextRun(', more kept text, '),
        new DeletedTextRun({ text: 'deleted text', id: 2, ...REVIEWER }),
        new TextRun('.'),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('Formatting change: '),
        new TextRun({ text: 'now bold', bold: true, revision: { id: 3, ...REVIEWER, bold: false } }),
      ],
    }),
  ]),

  'fields-toc': doc([], {
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })],
              }),
            ],
          }),
        },
        children: [
          editTarget(),
          new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
          new Paragraph({ text: 'Chapter One', heading: HeadingLevel.HEADING_1 }),
          new Paragraph('Chapter one body.'),
          new Paragraph({ text: 'Section One A', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Section body.'),
        ],
      },
    ],
  }),

  'custom-styles': doc(
    [
      new Paragraph({ text: 'A quote in a custom paragraph style.', style: 'PageLiteQuote' }),
      new Paragraph({
        children: [
          new TextRun('Inline '),
          new TextRun({ text: 'code_span()', style: 'PageLiteCode' }),
          new TextRun(' in a character style.'),
        ],
      }),
    ],
    {
      styles: {
        paragraphStyles: [
          {
            id: 'PageLiteQuote',
            name: 'PageLite Quote',
            basedOn: 'Normal',
            quickFormat: true,
            run: { italics: true, color: '555555' },
            paragraph: { indent: { left: 720 } },
          },
        ],
        characterStyles: [{ id: 'PageLiteCode', name: 'PageLite Code', run: { font: 'Courier New', color: '1F4E79' } }],
      },
    },
  ),

  'text-boxes-shapes': doc([
    new Paragraph({
      children: [
        new TextRun('Paragraph with a floating image.'),
        new ImageRun({
          type: 'png',
          data: png(16, 16, [40, 160, 80]),
          transformation: { width: 64, height: 64 },
          floating: {
            horizontalPosition: { offset: 3_000_000 },
            verticalPosition: { offset: 1_000_000 },
            wrap: { type: TextWrappingType.SQUARE },
          },
        }),
      ],
    }),
    new Textbox({ style: { width: '2in', height: '0.75in' }, children: [new Paragraph('Text inside a text box.')] }),
    new Paragraph('After the text box.'),
  ]),

  'nested-tables': doc([
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ columnSpan: 2, children: [new Paragraph('Merged across two columns')] }),
            new TableCell({ rowSpan: 2, children: [new Paragraph('Merged down two rows')] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('Plain cell')] }),
            new TableCell({
              children: [
                new Table({
                  rows: [
                    new TableRow({
                      children: ['Inner A', 'Inner B'].map((t) => new TableCell({ children: [new Paragraph(t)] })),
                    }),
                  ],
                }),
                new Paragraph('Below the inner table.'),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph('After the tables.'),
  ]),

  'rtl-mixed': doc([
    new Paragraph({
      bidirectional: true,
      children: [new TextRun({ text: 'שלום עולם, זו פסקה מימין לשמאל.', rightToLeft: true })],
    }),
    new Paragraph({
      bidirectional: true,
      children: [new TextRun({ text: 'مرحبا بالعالم، هذه فقرة عربية.', rightToLeft: true })],
    }),
    new Paragraph({
      children: [
        new TextRun('Mixed: English then '),
        new TextRun({ text: 'עברית', rightToLeft: true }),
        new TextRun(' then English again.'),
      ],
    }),
  ]),
};

/** Hand-built broken inputs: the editor must reject them cleanly, never crash or hang. */
async function malformedFixtures() {
  const missingDocument = new JSZip();
  missingDocument.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  const valid = await Packer.toBuffer(fixtures['basic-formatting']);

  // A valid document whose body is padded with 8 MB of spaces: a few KB on disk, far beyond
  // any plausible compression ratio. Stands in for a decompression bomb.
  const bomb = await JSZip.loadAsync(valid);
  const body = await bomb.file('word/document.xml')!.async('string');
  bomb.file('word/document.xml', body.replace('<w:body>', `<w:body><!--${' '.repeat(8 * 1024 * 1024)}-->`));

  return {
    'malformed-not-a-zip': Buffer.from('This is plain text with a .docx extension.\n'),
    'malformed-truncated': valid.subarray(0, Math.floor(valid.length / 2)),
    'malformed-missing-document': await missingDocument.generateAsync({ type: 'nodebuffer' }),
    'malformed-zip-bomb': await bomb.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    }),
  };
}

await mkdir(outDir, { recursive: true });
for (const [name, document] of Object.entries(fixtures)) {
  await writeFile(path.join(outDir, `${name}.docx`), await Packer.toBuffer(document));
}
for (const [name, bytes] of Object.entries(await malformedFixtures())) {
  await writeFile(path.join(outDir, `${name}.docx`), bytes);
}
console.log(
  `Wrote ${Object.keys(fixtures).length + Object.keys(await malformedFixtures()).length} fixtures to ${path.relative(process.cwd(), outDir)}`,
);
