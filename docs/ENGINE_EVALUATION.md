# Engine Evaluation (Milestone 1)

**Date:** 2026-10-15 · **Status:** round trip validated in Node; webview integration not yet validated

## Summary

PageLite needs an existing engine that can open a `.docx`, apply an edit, and save it without dropping content it does not understand. Three engines were tested on a synthetic corpus of 17 documents, and two more were assessed from their documentation only.

| Candidate | Licence | Round trip (14 valid docs) | Verdict |
| --- | --- | --- | --- |
| **@docx-editor.dev/core 2.30.0** | Apache-2.0 | 14/14 kept | **Recommended** |
| SuperDoc 1.47.2 (1.x line) | AGPL-3.0 | 11/14 kept, 3 with font changes | Fallback |
| SuperDoc 2.x | AGPL-3.0 + proprietary engine | not tested | Rejected (licence) |
| mammoth + docx (Tiptap route) | BSD-2 / MIT | 6/14 kept | Rejected (lossy) |
| ONLYOFFICE Docs | AGPL-3.0 + 7(b) logo terms | not tested | Rejected (needs a server) |
| Tiptap Pro DOCX import/export | Commercial | not tested | Rejected (cloud import) |

**Recommendation:** build PageLite on `@docx-editor.dev/core`, kept behind a small `document/` interface so the engine can be swapped. Keep SuperDoc 1.x as the fallback.

**Do not start the full UI yet.** First, render the engine's editor inside a Tauri WebKitGTK window and check typing, IME input, selection and save. This evaluation only exercised the engines in Node, never in a webview. That check is the first task of Milestone 2.

## Requirements used to judge

These come from `plan.md`:

1. **Real round trip.** Open an existing DOCX, edit it, and save it again. Content the engine does not understand must survive.
2. **Fully offline.** No network calls and no telemetry.
3. **Distributable.** Licensing must allow an open-source Linux package (AppImage or `.deb`).
4. **Lightweight.** Small enough to embed in a Tauri webview, with no server or Docker container.
5. **Custom UI.** PageLite supplies its own menus and toolbar.
6. **Testable.** Load, edit and save can be driven from automated tests.

## Candidates and licensing

### @docx-editor.dev/core (EigenPal): recommended

- **Model.** It reads the DOCX into a canonical OOXML tree, applies edits to that tree, and writes it back out. Only the parts it models are rewritten; media, fonts, macros and unknown parts are copied byte for byte. This is documented in its README ("Fidelity") and in the `writeOoxmlPackage` doc comment.
- **Licence.** Apache-2.0. Its direct runtime dependencies are MIT or Apache-2.0: `prosemirror-*`, `fflate`, `fast-xml-parser`, `harfbuzzjs`, `bidi-js`, `utif2`, `emf-converter`. These were checked in `node_modules`.
- **Paid tier.** These packages use the "EigenPal Pro" licence: `@docx-editor.dev/pro` (comments and tracked changes), `@docx-editor.dev/editor-api` (Office.js-style automation), `docx-to-pdf` and `telemetry`. **PageLite must not depend on them.** The PoC uses only the Apache-2.0 core (`@docx-editor.dev/core/store`).
- **Network.** None. The only `fetch` in the bundle is the Emscripten loader for the bundled `harfbuzz.wasm`, a local, same-origin file. The harness recorded 0 network attempts.
- **Untrusted input.** The README says zip, XML-entity and nesting limits are enforced, and that external relationships are never fetched automatically. All three malformed fixtures were rejected with typed reasons such as `inflate-error` and `no-main-document`.
- **Size.** `dist` is 8.4 MB unminified, including a 417 KB `harfbuzz.wasm`. The final bundle size is unmeasured until Milestone 2.
- **Risks.**
  - **Young project.** The repo was created in February 2026 and the package has been renamed twice: `@eigenpal/docx-js-editor`, then `@eigenpal/docx-editor-react`, now `@docx-editor.dev/*`.
  - **Breaking changes.** Both renames came with breaking API changes.
  - **Mitigation.** Pin exact versions and keep engine calls behind PageLite's own interface.

### SuperDoc: fallback, 1.x line only

- **SuperDoc 2.x.** Every 2.x release since 2.3.0 (2026-07-28) depends on `@superdoc/docx-engine`, which has a separate **proprietary** licence ("SuperDoc DOCX Engine Proprietary License", 2026-07-14).
  - That licence says installing it means accepting it.
  - It forbids redistributing the package.
  - It forbids benchmarking or validating the engine, and analysing it with AI tools.
  - A redistributable open-source app cannot meet those terms, so **2.x was uninstalled without being run**. Note: npm's `superdoc@2.1.0` and `2.2.0` are unrelated packages from 2016–2017.
- **SuperDoc 1.x** (1.47.2, released 2026-10-08) is AGPL-3.0 only and has no proprietary dependency. Its maintenance horizon is unknown, because development has moved to 2.x.
- **Telemetry is on by default, even in headless mode.** One event is sent per document open; see https://docs.superdoc.dev/editor/telemetry. It must be created with `telemetry: { enabled: false }`; the PoC does this and recorded 0 network attempts.
- **AGPL consequence.** Shipping it makes PageLite as a whole AGPL-3.0. That is acceptable for an open-source portfolio project, but it rules out any closed or relicensed version later.
- **Size.** `superdoc.min.js` is 5.9 MB, and it brings Vue, Pinia, Konva and pdf.js along. That is heavier than the recommended engine.

### mammoth + docx: rejected

- **How it works.** This is the route that needs no paid packages: mammoth turns DOCX into HTML, the editor works on that, and `docx` builds a **brand-new** file.
- **What it drops.** Mammoth drops fonts, sizes, colours and table borders on purpose: https://github.com/mwilliamson/mammoth.js. Because `docx` only builds new files, anything mammoth does not model is gone.
- **What PageLite would have to own.** The HTML-to-DOCX mapping (`adapters/mammoth-docx.mjs`, about 100 lines) would be PageLite's own code. That is the kind of hand-built serializer `plan.md` rules out.
- **Why the test flatters it.** Tiptap/ProseMirror would sit between the two libraries and could only lose more, so the PoC result is a best case.

### Tiptap Pro DOCX conversion: rejected

The official `@tiptap-pro/extension-import-docx` needs a paid plan and Tiptap's private registry, and it **uploads the file to Tiptap's cloud conversion service**: https://tiptap.dev/docs/conversion/import/docx/editor-extension. That breaks the offline requirement. The export extension runs client-side but is also Pro-only.

### ONLYOFFICE Docs: rejected

- **Licence.** Community Edition is AGPL-3.0 with added section 7(b) logo-retention terms, and white-labelling requires a paid edition: https://github.com/ONLYOFFICE/DocumentServer.
- **Weight.** It runs as Document Server under Docker, with a recommended 2 cores, 4 GB RAM and 40 GB disk: https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx. That is the opposite of "lightweight".
- **WASM ports.** Only community projects exist, and they are unmaintained or unverified.

### LibreOffice headless: not an engine, used as a validator

`soffice --convert-to` is reliable, but it is a several-hundred-MB external program rather than an embeddable editor. It is used here only as an **independent third-party check** that saved files open and show the edit.

## Method

Everything is in `poc/engine-eval/`. To reproduce:

```bash
cd poc/engine-eval
npm ci
npm run fixtures   # regenerate the corpus (needs LibreOffice for the second set)
npm run eval       # run every round trip, then write results/SUMMARY.md
```

1. **Corpus.** `scripts/make-fixtures.mjs` builds the corpus in `fixtures/docx/`, all synthetic, so no private documents are involved. It covers headings; bold, italic and underline; fonts, sizes and colour; alignment; bulleted, numbered and nested lists; tables; images; hyperlinks; page breaks; two sections (portrait and landscape); headers and footers; Unicode (CJK, RTL, emoji); a 2,000-paragraph document; an empty document; and three malformed files.
2. **Second producer.** `scripts/make-libreoffice-fixtures.sh` re-saves six fixtures through LibreOffice, so the engines also see OOXML written in a different style by another program.
3. **Round trip.** For each engine and fixture, `run.mjs` opens the file, appends a marker to the "Edit target paragraph.", saves to a **new** file under `.work/out/` (originals are never written), and reopens it in the same engine.
4. **Engine-independent comparison.** `lib/inspect.mjs` reads both files' OOXML directly and compares paragraph text, headings, bold/italic/underline text, fonts, sizes, colours, alignment, list kind and level, table cell text, image content hash and display size, page breaks, section orientation, header and footer text, and hyperlink targets.
5. **Third-party check.** Every saved file is converted with LibreOffice, and the result is searched for the edit.
6. **Offline check.** `fetch`, `XMLHttpRequest`, `http`, `https` and `net` are replaced before any engine loads, so every network attempt is recorded and blocked.

## Results

Full output is in [`poc/engine-eval/results/SUMMARY.md`](../poc/engine-eval/results/SUMMARY.md). The machine was an Intel i7-8565U with 15 GB RAM, Ubuntu 24.04.2 and Node 26.5.1. Timings vary by about 50% between runs (an earlier run measured 168 ms and 3,015 ms for the long-document opens), so read them as orders of magnitude.

| Check | docx-editor core | SuperDoc 1.x | mammoth + docx |
| --- | --- | --- | --- |
| Valid fixtures with all features kept | **14/14** | 11/14 | 6/14 |
| Edit persisted after reopen | 14/14 | 14/14 | 14/14 |
| Saved file opens in LibreOffice and shows the edit | 13/13 | 13/13 | 13/13 |
| Malformed files rejected cleanly | 3/3 | 3/3 | 3/3 |
| Network attempts | 0 | 0 (telemetry disabled) | 0 |
| Open time, small fixture (median) | 8 ms | 21 ms | 9 ms |
| Open time, 2,000 paragraphs (median of 5) | 250 ms | **3,128 ms** | 196 ms |
| Save time, 2,000 paragraphs (median of 5) | 147 ms | 311 ms | 67 ms |

**What was lost:**

- **SuperDoc 1.x, on the three LibreOffice-written files.**
  - **Font flattening.** It copied the inherited default font onto every run as direct formatting.
  - **Font overwrite.** It replaced the East Asian and complex-script font slots: `Noto Serif CJK SC` and `Noto Sans Devanagari` became `Times New Roman`.
  - **Visible effect.** Latin text looks the same, but CJK and Indic text can render in a different fallback font.
  - **Long documents.** Opening a 2,000-paragraph file took about 3 s in Node, above the 2-second target in `plan.md` for this size class.
- **mammoth + docx.**
  - **Formatting:** all fonts, sizes, colours and paragraph alignment.
  - **Page layout:** headers, footers, page breaks and the second (landscape) section.
  - **Lists:** nested numbered-list formats; `a.` became `1.`.
  - **Images:** display sizes.
  - **Same on both producers:** the losses were identical whichever program wrote the file.

## What this evaluation does not prove

- **No webview test.** Every engine was driven headlessly in Node, not in WebKitGTK. Typing, IME, selection, pagination, rendering accuracy and startup time inside Tauri are all untested.
- **Structural, not visual.** The comparison checks XML structure only. No page images were compared.
- **One small edit.** Each test appended a short run of text to one paragraph. Formatting edits, list edits, table edits and paste were not exercised. The core does expose operations for these (`setRunProperties`, `setListLevel`, `insertTableRow`, …), but none were tested.
- **Synthetic corpus only.** The corpus was written by two programs (the `docx` library and LibreOffice). Files saved by Microsoft Word, Google Docs or Pages were not tested. Add synthetic Word-authored files in Milestone 6.
- **Not app-level performance.** The timings measure the engines in Node on one machine. They are not PageLite's startup or open times.

## Proposed architecture

```
Tauri 2 (Rust)                       Webview (React + TypeScript)
├─ file dialogs, read/write          ├─ PageLite UI: menus, toolbar, find, title, dirty marker
│  (atomic write: temp file, then    ├─ src/document/  ← the ONLY code that imports the engine
│  rename)                           │    open(bytes) / save() / commands / onChange
└─ no network permissions            └─ @docx-editor.dev/core (+ React adapter if it supports
                                          a custom toolbar; otherwise PageLite's own adapter
                                          built on the core's public editor contract)
```

- **Rust side.** All file I/O happens in Rust. The webview only ever sees bytes. Saving writes to a temporary file in the same directory, then renames it over the original. The document is marked clean only after the rename succeeds.
- **Engine boundary.** `src/document/` is the only place that knows the engine exists. Swapping in SuperDoc 1.x would be a change to that module alone.
- **Tests.** The harness's inspector (`lib/inspect.mjs`) and the corpus become the start of `tests/compatibility/`.

## Decisions needed from you

1. **PageLite's licence.**
   - **With the recommended engine**, PageLite can be MIT or Apache-2.0. Apache-2.0 matches the engine.
   - **If you ever fall back to SuperDoc 1.x**, PageLite has to be AGPL-3.0.
2. **Engine risk.** Do you accept relying on a young, fast-moving engine (`@docx-editor.dev`), with pinned versions and an engine boundary as the safeguards?

## Next step: start of Milestone 2

1. Scaffold Tauri 2 + React + TypeScript.
   - **Rust is not installed yet.**
   - **Linux packages:** Tauri also needs `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `librsvg2-dev` and `libayatana-appindicator3-dev`; see https://v2.tauri.app/start/prerequisites/.
2. Render the docx-editor editor in the WebKitGTK webview, and check:
   - typing, undo and IME input;
   - selection and scrolling;
   - opening `long-document.docx`;
   - that the Apache-2.0 packages accept a custom toolbar.
3. Go or no-go on the engine before building the UI.

## Sources

- @docx-editor.dev/core: README in the npm package (Architecture, Fidelity, Untrusted input). https://github.com/eigenpal/docx-editor and https://www.docx-editor.dev/docs/2.x/word-fidelity
- `@superdoc/docx-engine` licence: `DOCX-ENGINE-LICENSE.md` in the npm package, also at https://docs.superdoc.dev/resources/docx-engine-license
- SuperDoc licence and telemetry: https://docs.superdoc.dev/resources/license and https://docs.superdoc.dev/editor/telemetry
- mammoth: https://github.com/mwilliamson/mammoth.js
- docx: https://github.com/dolanmiu/docx
- Tiptap DOCX import/export: https://tiptap.dev/docs/conversion/import/docx/editor-extension and https://tiptap.dev/docs/conversion/export/docx/editor-extension
- ONLYOFFICE: https://github.com/ONLYOFFICE/DocumentServer and https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx
- Tauri prerequisites and Linux graphics notes: https://v2.tauri.app/start/prerequisites/ and https://v2.tauri.app/develop/debug/linux-graphics/
- Package versions, licences and dependency lists: `npm view` on 2026-10-15
