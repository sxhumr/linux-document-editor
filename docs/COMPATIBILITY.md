# DOCX compatibility

What PageLite keeps, changes and refuses when it opens, edits and saves a `.docx` file. Every row below comes from the automated compatibility suite (`ui/tests/compatibility/`, see [TESTING.md](TESTING.md)), last run on 2026-10-19 with `@docx-editor.dev/core` 2.30.0.

> PageLite is not certified by Microsoft and makes no claim of full Word compatibility. "Kept" means the saved file says the same thing as the original, checked structurally by an independent OOXML reader. It is not a visual comparison, and it has not been checked in Microsoft Word itself (see [Not yet verified](#not-yet-verified)).

## How it was tested

- **Corpus.** 31 well-formed documents and 4 malformed ones, all synthetic (no private documents):
  - 17 built with [docx.js](https://docx.js.org) by `ui/tests/compatibility/fixtures/make-fixtures.ts`.
  - 14 of those re-saved by LibreOffice Writer 26.2, which writes OOXML differently (styles, numbering, sections and fields).
- **Edits.** Each well-formed document goes through the engine's own open → edit → save path, then is opened again:
  - **Standard edit:** append text to the first paragraph, bold one word in it and centre it.
  - **Stress edit:** append text to *every* paragraph that has words in it, including list items, table cells, link paragraphs, commented text and tracked changes.
  - **No edit:** open and save straight away.
- **Comparison.** An inspector that does not share code with the engine (JSZip + xmldom) reads 31 features from the original and the saved file and compares them exactly. It also compares every package part by content.
- **Second reader.** Every saved file is opened by LibreOffice, which must show the edit.

## Results

All 31 documents keep every feature after the standard edit (30 are edited; `empty-document` has nothing to edit). Opening and saving with no edit changes nothing. One formatting difference shows up under the stress edit (see [Differences](#differences)).

| Feature | Fixtures | Result |
| --- | --- | --- |
| Paragraph text, empty paragraphs | all | Kept |
| Headings (Heading 1–3, Title) | basic-formatting, long-document, hyperlinks, fields-toc | Kept |
| Bold, italic, underline | basic-formatting, tables, hyperlinks, tracked-changes, long-document | Kept |
| Fonts, sizes, colours | basic-formatting, custom-styles | Kept |
| Paragraph alignment (left, centre, right, justified) | basic-formatting | Kept |
| Bulleted and numbered lists, 3 levels, mixed formats | lists | Kept (format and level of every item) |
| Tables | tables, nested-tables | Kept |
| Merged cells (horizontal and vertical), nested tables | nested-tables | Kept |
| Inline images (content and displayed size) | images | Kept |
| Floating images and text boxes | text-boxes-shapes | Kept |
| Page breaks; portrait and landscape sections | layout-sections | Kept |
| Headers and footers, per section | layout-sections, fields-toc | Kept |
| External, `mailto:` and internal (bookmark) hyperlinks | hyperlinks, layout-sections | Kept (target and text) |
| Bookmarks | hyperlinks | Kept |
| Footnotes and endnotes | footnotes-endnotes | Kept (text and order) |
| Comments, including replies and ranges | comments | Kept (author, text, reply threading) |
| Tracked insertions, deletions and formatting changes | tracked-changes | Kept, not accepted or rejected |
| Fields: TOC, PAGE, NUMPAGES, PAGEREF | fields-toc | Kept (field codes) |
| Custom paragraph and character styles | custom-styles | Kept |
| Right-to-left paragraphs and runs (Hebrew, Arabic) | rtl-mixed, unicode | Kept |
| Unicode: accents, Greek, Cyrillic, CJK, emoji | unicode | Kept |
| Long documents (2,000 paragraphs) | long-document | Kept |
| Everything the engine does not model (theme, settings, font table, numbering, media, custom XML) | all | Same content after save |

### How the engine writes the file

The engine re-serializes every XML part on save, even parts no edit touched. In these documents the content stays the same, but the bytes do not. It:

- leaves out the `<?xml … standalone="yes"?>` declaration, which is optional for UTF-8;
- sorts namespace declarations and `mc:Ignorable` prefixes, which are order-independent;
- drops `xml:space="preserve"` from text with no leading, trailing or repeated whitespace, where it has no effect;
- adds `w14:paraId` / `w14:textId` identity stamps to paragraphs that lack them, as Word does.

Binary parts such as images are copied unchanged. Only `word/document.xml` changes in content when the body is edited. No part is added or removed, and every namespace prefix in `mc:Ignorable` is still declared (a missing one makes Word reject a file).

## Differences

| What | Where | Effect | Decision |
| --- | --- | --- | --- |
| Text typed at the end of a paragraph that ends in a link takes on the link's character style | hyperlinks, LibreOffice hyperlinks and table of contents | The new text is *outside* the link (the link's target and text are unchanged) but looks like a link: blue and underlined, not clickable. | Accepted and recorded in `known-losses.ts`. It's how the engine carries formatting forward, not data loss. Worth raising with the engine project if it turns out to happen when typing in the app too. |

Differences that come from LibreOffice's own conversion, not from PageLite, show up only in the LibreOffice fixtures and are already in the input: LibreOffice drops comment reply threading, fills in field results ("Page 1 of 1"), and adds explicit left alignment to right-to-left paragraphs.

## Display differences

The suite checks what is saved, not how it looks. These on-screen differences were seen while making the screenshots (2026-10-19). None of them changes the saved file.

- **Tables without cell widths** (only a percentage width for the table, as docx.js writes them) are laid out by content, so columns can be uneven where LibreOffice makes them equal. Tables with cell widths, which Word always writes, match.
- **Thin borders on 1× screens.** 0.5 pt table borders are under one pixel at 100% scaling, and some can disappear on screen. At 200% scaling, as on most laptops, they all show.

## Refused files

The app checks every file with the engine's bounded package reader before it replaces the open document. These are refused with a readable message, and the open document is left alone:

| Input | Fixture | Message |
| --- | --- | --- |
| Not a ZIP (plain text renamed `.docx`) | malformed-not-a-zip | "…it is damaged or not a Word document." |
| Truncated ZIP | malformed-truncated | "…it is damaged or not a Word document." |
| ZIP without a main document part | malformed-missing-document | "…it has no document body." |
| Decompression bomb: 18 KB that expands to 8 MB (over the engine's 200:1 ratio limit) | malformed-zip-bomb | "…it is too large to open safely." |
| Empty file | (unit test) | "The file is empty." |

The engine also refuses archives over 512 MB uncompressed. The native shell refuses to read files over 256 MB.

## Not yet verified

- **Microsoft Word.** Saved files have not been opened in Word; there is no Word on Linux. The structural checks cover the known causes of Word's "unreadable content" error (undeclared `mc:Ignorable` prefixes, missing parts, broken relationships), but only opening the files in Word would confirm it.
- **Real-world documents.** The corpus is synthetic. Documents from Word, Google Docs and older producers will contain things it does not: content controls, SmartArt, charts, equations, embedded objects, macros (`.docm` is not supported) and complex fields.
- **Visual layout.** Nothing compares how pages look before and after a save.
- **Editing inside every feature.** The editor UI has not been driven inside footnotes, comments, headers or text boxes. The engine supports this, but PageLite does not test it.
- **Theme fonts.** docx.js cannot write theme font references, so they are tested only through the LibreOffice fixtures' theme part, which comes out unchanged.
