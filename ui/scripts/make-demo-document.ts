// Builds docs/media/demo.docx, the made-up sample document shown in the README screenshots
// and demo. Run with `npm run demo-document` (Node strips the types).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/media/demo.docx');

const body = (...runs: (string | TextRun)[]) =>
  new Paragraph({
    spacing: { after: 160, line: 300 },
    children: runs.map((r) => (typeof r === 'string' ? new TextRun(r) : r)),
  });
const bullet = (text: string) => new Paragraph({ text, numbering: { reference: 'bullets', level: 0 } });
const step = (text: string) => new Paragraph({ text, numbering: { reference: 'steps', level: 0 } });

// Explicit widths (in twentieths of a point) the way Word writes them. Without cell widths
// the engine sizes columns by their content (docs/COMPATIBILITY.md).
const COLUMN = 2256;

const cell = (text: string, header = false) =>
  new TableCell({
    width: { size: COLUMN, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header })] })],
  });

const schedule = [
  ['Bed', 'Crop', 'Sow', 'Harvest'],
  ['North 1', 'Spinach', 'Early March', 'Late April'],
  ['North 2', 'Peas', 'Mid March', 'June'],
  ['South 1', 'Tomatoes', 'Late April', 'August'],
  ['South 2', 'Beans', 'May', 'July'],
];

const doc = new Document({
  creator: 'PageLite demo',
  title: 'Riverside Community Garden: Spring Plan',
  styles: {
    default: {
      document: { run: { font: 'Liberation Sans', size: 22 } },
      heading1: { paragraph: { spacing: { before: 120, after: 160 } } },
      heading2: { paragraph: { spacing: { before: 320, after: 120 } } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'steps',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      children: [
        new Paragraph({ text: 'Riverside Community Garden', heading: HeadingLevel.TITLE }),
        new Paragraph({ text: 'Spring Plan', heading: HeadingLevel.HEADING_1 }),
        body(
          'This plan sets out what we will grow this spring, who looks after each bed, and how we share the harvest. It is a ',
          new TextRun({ text: 'working draft', italics: true }),
          ': add comments or suggest changes before the ',
          new TextRun({ text: 'members’ meeting on 14 March', bold: true }),
          '.',
        ),
        new Paragraph({ text: 'Goals', heading: HeadingLevel.HEADING_2 }),
        bullet('Double the vegetable beds in use, from four to eight.'),
        bullet('Start a seed library so members can swap and save seeds.'),
        bullet('Give a third of the harvest to the local food bank.'),
        new Paragraph({ text: 'Planting schedule', heading: HeadingLevel.HEADING_2 }),
        new Table({
          width: { size: COLUMN * 4, type: WidthType.DXA },
          columnWidths: [COLUMN, COLUMN, COLUMN, COLUMN],
          rows: schedule.map((row, i) => new TableRow({ children: row.map((text) => cell(text, i === 0)) })),
        }),
        new Paragraph({ text: 'Before the first sowing', heading: HeadingLevel.HEADING_2 }),
        step('Clear and compost last season’s beds.'),
        step('Repair the north fence and the water butt.'),
        step('Agree the bed rota at the members’ meeting.'),
      ],
    },
  ],
});

await writeFile(out, await Packer.toBuffer(doc));
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
