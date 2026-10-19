# Testing

## Test layers

| Layer | What it covers | Command | In CI |
| --- | --- | --- | --- |
| C++ unit tests (Catch2) | File I/O and atomic saves, path grants, navigation policy, embedded assets, bridge JSON | `ctest --preset debug` | Yes |
| UI unit tests (Vitest, jsdom) | Document lifecycle (`DocumentController`), unsaved-change protection, validation, bridge, shortcut and command tables, menu bar, find bar, dialogs | `cd ui && npm test` | Yes |
| DOCX compatibility suite (Vitest, Node) | Round trips of the whole fixture corpus through the engine; see below | `cd ui && npm test` (runs with the unit tests) | Yes |
| LibreOffice cross-check | Every saved file opens in LibreOffice and shows the edit | `cd ui && npm run test:compat` | No (needs LibreOffice) |
| Package install test (Docker) | The `.deb` installs on a clean Ubuntu 24.04, every library resolves, the desktop entry and metadata validate, `.docx` is registered, the installed app opens a document, and removal leaves nothing behind | `packaging/test-deb.sh` | Yes |
| Static checks | oxlint, Prettier, TypeScript; clang-format, clang-tidy | see the README | Yes, except clang-tidy |
| Manual checklist | Things only a person at the window can judge | [below](#manual-checklist) | No |

At the Milestone 6 commit: 29 C++ tests and 1,205 UI tests (81 unit, 1,124 compatibility) pass. The 31 LibreOffice tests also pass when run with `npm run test:compat`.

## DOCX compatibility suite

Code: `ui/tests/compatibility/`. Results and their meaning: [COMPATIBILITY.md](COMPATIBILITY.md).

| File | Role |
| --- | --- |
| `fixtures/make-fixtures.ts` | Builds the synthetic corpus in `fixtures/docx/` with docx.js. Never uses real documents. |
| `fixtures/make-libreoffice-fixtures.sh` | Re-saves 14 of them through LibreOffice into `fixtures/docx/libreoffice/` (a second producer) |
| `engine.ts` | Drives `@docx-editor.dev/core` headlessly: open, edit, save |
| `inspect.ts` | Independent OOXML reader: 31 features, canonical part hashes, Word-breaking defects |
| `roundtrip.ts` / `roundtrip.test.ts` | The trip and the assertions |
| `known-losses.ts` | Every accepted difference, with its reason |
| `libreoffice.test.ts` | The LibreOffice cross-check |

**What each well-formed document goes through:**

1. **Validate** with the app's own `validateDocx`, as the Open command does.
2. **Open** in the engine's headless automation host. This is the engine's DOM-free twin of the editor the app embeds, with the same package reader, edit operations and serializer.
3. **Edit** like separate user actions: append a marker to the first paragraph, bold a word in it, centre it.
4. **Save**, validate the output again, and reopen it in the engine.
5. **Compare** with the original:
   - one test per feature (31 features);
   - every package part must have the same canonical content unless it is listed as rewritten (only `word/document.xml` is);
   - no part may be added;
   - no `mc:Ignorable` prefix may be left undeclared.
6. **No-edit save:** open and save without editing; every part must be unchanged.
7. **Stress edit:** append to every paragraph that has words in it, then compare the document's structure without its text: list formats, link targets, comments, revisions, notes, fields, styles, merges, images and sections.

Malformed documents must be refused both by `validateDocx` and by the engine, without throwing anything other than a rejection.

**Known losses are explicit.** A difference fails the suite unless it is listed in `known-losses.ts` with a reason. A listed difference that stops happening also fails, so the list cannot go stale.

**The suite was checked to catch real losses.** Two defects were planted temporarily: skipping the bold edit, and deleting footnote references from the saved file. The suite failed on exactly the affected documents and features: `boldText` in all 22 edited documents, and `footnotes` and `characterStyles` in the footnote document.

**Gap.** The suite tests the engine headlessly. The app saves through the browser editor's `save()`, which the engine documents as the same serializer, but the full in-app path (editor → bridge → atomic write) is covered only by the manual check below and the C++ file I/O tests.

### Regenerating fixtures

```bash
cd ui
npm run fixtures     # docx.js corpus, then the LibreOffice re-saves (skipped if LibreOffice is missing)
npm run test:compat  # compatibility suite + LibreOffice cross-check
```

Regenerating rewrites every fixture (docx.js stamps the creation time), so commit the fixtures together with the change that needed them.

## Performance

### Procedure

`scripts/measure.sh [--cold] [runs]` launches the release binary `runs` times (default 10, after one discarded warm-up) for each of three cases, and reports the median, p90, min and max.

- **Timing.** Each launch runs with `PAGELITE_MEASURE=1`. The shell then binds `pagelite_mark`, and the UI calls it two animation frames after the editor first renders (`ui-ready`) and after a command-line document has loaded (`document-opened`), so the frame has been painted. The shell prints a JSON line for each phase and quits after the last one.
- **What the times include.** They run from just before launch to the painted frame, so they include loading the binary and its libraries.
- **Cold starts.** `--cold` drops the page cache before every launch using `sudo`; the app itself is not run as root. Without it, runs are warm.
- **Don't touch the windows while it runs.** A keystroke makes the empty editor "modified", the app then asks before opening the file, and the run is counted as failed.

### Results

Measured 2026-10-19 with a release build of `526982a` plus the Milestone 6 changes:

- **Machine:** Intel Core i7-8565U @ 1.80 GHz, 15 GB RAM, Ubuntu 24.04.2 LTS, kernel 7.0.0-38, Wayland session.
- **Libraries:** GTK 3.24.41, WebKitGTK 2.52.6.
- **Build and cache:** 5.0 MB binary, warm page cache.

| Launch to painted frame (ms) | Median | p90 | Min | Max | Failed runs |
| --- | --- | --- | --- | --- | --- |
| Empty editor | 936 | 1000 | 884 | 1211 | 0 |
| Small document (basic-formatting.docx, 10 KB) | 1502 | 1653 | 1402 | 1794 | 0 |
| Long document (long-document.docx, 2,000 paragraphs) | 2761 | 3307 | 2577 | 3475 | 0 |

**Against the plan's targets (§10):**

- **Startup under 2 s:** met warm, median 0.94 s.
- **Small document open under 2 s:** met warm, median 1.50 s and p90 1.65 s from launch, which includes startup.

**Variance.** Results vary between sessions on this laptop. Two earlier sessions the same day gave medians of 1,169 and 1,485 ms for the empty editor, 1,479 and 1,921 ms for the small document, and 2,044 ms for the long document. Treat differences under about 30% as noise.

**Not measured yet:** cold starts (`--cold`), and any other machine.

**Headless engine cost** (from the compatibility suite, no rendering): about 3.4 ms per single-paragraph edit in the 2,000-paragraph document, and about 0.8 s to open and save it.

## Package

`packaging/test-deb.sh` runs these steps in a fresh `ubuntu:24.04` container:

1. **Install** with `apt-get install ./pagelite_*.deb`, so apt has to resolve every dependency from the archive.
2. **Libraries.** `ldd` must find all of them.
3. **Metadata.** `desktop-file-validate` and `appstreamcli validate` must pass, and the `.docx` MIME type must appear in the desktop MIME cache.
4. **Launch** the installed `/usr/bin/pagelite` under `xvfb-run` with a fixture, in timing mode. It must report `document-opened`. WebKit's bubblewrap sandbox cannot start in a container, so the test sets `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`, inside the container only.
5. **Remove** the package. The binary, desktop entry, icon, docs and MIME registration must all be gone.

Result on 2026-10-19: passed. Docker pulled `ubuntu:24.04` (sha256:68ee2200…), apt installed the package and its dependencies, and all 129 libraries resolved. The app reported `document-opened` 2.2 s after `main()` on the virtual display.

What the container cannot show, a person checks after installing on a real desktop (checklist item 7).

## Screenshots and demo

`scripts/capture-media.sh` installs the package on a clean container with a 2× virtual display and opens `docs/media/demo.docx` (made by `ui/scripts/make-demo-document.ts`). It then drives the app with `xdotool` and writes the README images and `demo.gif`. Every step uses the keyboard, with the app's own Find placing the cursor, so the run does not depend on layout.

The run is also an end-to-end check in real WebKit. While making the screenshots, it found that typing into Find at normal speed moved keyboard focus into the document, so the next keys overwrote the selected match. The fix is `keepingFocus`, which has unit tests in `FindBar.test.tsx`. The capture now types into Find at 250 ms per key and must leave the document unmodified.

## Manual checklist

Run before a release, with `./build/release/native/pagelite`:

1. **Round trip in the app.** Open `fixtures/docx/comments.docx`, `tracked-changes.docx` and `hyperlinks.docx` in turn. For each, edit a paragraph, Save As a new file, then open the result in LibreOffice: the comments, tracked changes and links must still be there.
2. **Find while typing.** Press Ctrl+F and type a word slowly, then press Enter and Shift+Enter. Every key must go into the Find box, and the document must not show "Edited".
3. **Typing after a link.** In `hyperlinks.docx`, put the caret at the end of "jump to appendix" and type. Note whether the new text looks like a link (see [COMPATIBILITY.md](COMPATIBILITY.md#differences)).
4. **Refused files.** Open each `fixtures/docx/malformed-*.docx`. A readable error must appear, and the open document must stay as it was.
5. **Save failures.** Save into a read-only folder. An error must appear, the document must stay marked modified, and the edits must stay.
6. **Unsaved changes.** Edit, then press Ctrl+Q, Ctrl+N and Ctrl+O, and click the window's ×. Each must offer Save, Discard and Cancel.
7. **Installed package on the desktop.** After `sudo apt install ./pagelite_*.deb`:
   - PageLite appears in the app grid with its icon.
   - Its running window shows the PageLite icon and name in the dock, not a generic one.
   - Right-clicking a `.docx` in the file manager offers **Open With → PageLite**, and that opens the file.
   - Help → About shows the licence.
   - `sudo apt remove pagelite` removes it from the app grid.
