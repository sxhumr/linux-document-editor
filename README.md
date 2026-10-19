# PageLite

A lightweight Linux desktop editor for Microsoft Word `.docx` files: a small C++ GTK shell around an established DOCX engine, with a minimal interface.

> **Status: Milestone 7 of 8.**
> - **Done:** New, Open, Save and Save As with crash-safe saving and unsaved-change protection. File, Edit, Format and Help menus. A formatting toolbar with styles, headings, font, size, bold, italic, underline, alignment, lists and indent. Find, and keyboard shortcuts throughout. A DOCX compatibility suite of 35 documents that runs in CI ([what is kept](docs/COMPATIBILITY.md)). A `.deb` package with a desktop entry, icon and `.docx` file association, install-tested on a clean Ubuntu 24.04 in CI.
> - **Not yet:** the portfolio release (Milestone 8).
>
> See [`plan.md`](plan.md) for the roadmap.

## How it works

- **Native shell (C++23).** It creates a GTK window and hosts a WebKitGTK view through [webview/webview](https://github.com/webview/webview).
- **Built-in UI.** The interface is built at compile time, linked into the binary, and served from memory over a private `pagelite://` scheme, so there is no local server and no network access.
- **UI and engine (React + TypeScript).** The UI drives [`@docx-editor.dev/core`](https://github.com/eigenpal/docx-editor) (Apache-2.0). The engine edits the document's own XML directly, so content it doesn't understand survives a save.

Design decisions are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the engine choice, backed by round-trip tests, is in [`docs/ENGINE_EVALUATION.md`](docs/ENGINE_EVALUATION.md). What survives a save is in [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md), and how it is all tested is in [`docs/TESTING.md`](docs/TESTING.md).

## Install

PageLite is packaged for Ubuntu 24.04 and later (amd64). Build the package (see below), or download `pagelite-deb` from a CI run, then:

```bash
sudo apt install /path/to/pagelite_0.1.0_amd64.deb   # pulls in GTK 3 and WebKitGTK 4.1 if needed
```

Give apt a path that contains a `/` (absolute, or `./` from the package's folder); with a bare file name it looks for a package in the archive instead.

PageLite then appears in the app grid under Office, and in the file manager under **Open With** for `.docx` files. To make it the default for Word documents:

```bash
xdg-mime default io.github.sxhumr.PageLite.desktop application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

Remove it with `sudo apt remove pagelite`.

## Build and run

These steps assume Ubuntu 24.04 or similar, with Node.js 22+.

```bash
sudo apt install cmake ninja-build pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
(cd ui && npm ci)

cmake --preset debug
cmake --build --preset debug     # also builds the UI (npm run build) and embeds it
./build/debug/native/pagelite                 # blank document
./build/debug/native/pagelite report.docx     # open a file directly
```

Common shortcuts follow Word and LibreOffice:

| Shortcut | Action |
| --- | --- |
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | New / Open / Save / Save As |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / Redo |
| Ctrl+B / Ctrl+I / Ctrl+U | Bold / Italic / Underline |
| Ctrl+L / Ctrl+E / Ctrl+R / Ctrl+J | Align left / Center / Align right / Justify |
| Ctrl+Alt+0 … Ctrl+Alt+3 | Normal text, Heading 1–3 |
| Ctrl+Shift+L | Bulleted list |
| Ctrl+Space | Clear formatting |
| Ctrl+F, then F3 / Shift+F3 | Find, next / previous match |
| Alt+F / Alt+E / Alt+O / Alt+H | Open the File / Edit / Format / Help menu |
| F1 or Ctrl+/ | Every shortcut |

To get a release build, use `cmake --preset release && cmake --build --preset release`.

To build the Debian package and test it on a clean Ubuntu 24.04 container (needs Docker):

```bash
cmake --preset package && cmake --build --preset package && cpack --preset deb
packaging/test-deb.sh        # install, run, remove: build/package/dist/pagelite_0.1.0_amd64.deb
```

**UI hot reload (Debug builds only):**

```bash
(cd ui && npm run dev)
PAGELITE_DEV_SERVER=http://localhost:5173 ./build/debug/native/pagelite
```

## Tests and checks

| What | Command |
| --- | --- |
| C++ unit tests (Catch2) | `ctest --preset debug` |
| UI unit tests and DOCX compatibility suite (Vitest) | `cd ui && npm test` |
| Compatibility suite plus LibreOffice cross-check | `cd ui && npm run test:compat` |
| UI lint, formatting, types | `cd ui && npm run lint && npm run format:check && npm run typecheck` |
| C++ formatting, static analysis | `clang-format --dry-run --Werror native/src/* native/tests/*` and `clang-tidy -p build/debug native/src/*.cpp` |
| Regenerate the fixture corpus | `cd ui && npm run fixtures` |
| Startup and file-open timing | `scripts/measure.sh` (release build, graphical session) |
| Package install test on clean Ubuntu 24.04 | `packaging/test-deb.sh` (Docker) |

CI runs everything except the LibreOffice cross-check, clang-tidy and the timing script; see `.github/workflows/ci.yml`. Details are in [`docs/TESTING.md`](docs/TESTING.md).

## Measurements

- **Compatibility.** All 31 well-formed corpus documents keep every checked feature after an edit and save, including lists, tables, images, sections, headers, links, footnotes, comments, tracked changes, fields and right-to-left text. Parts that weren't edited keep the same content. One formatting difference is known: text typed after a link takes on the link's style. See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).
- **Startup (warm, 2026-10-19, i7-8565U).** Medians from launch to the painted frame:
  - empty editor: 0.94 s;
  - 10 KB document: 1.50 s;
  - 2,000-paragraph document: 2.76 s.

  Results vary by up to about 30% between sessions; cold starts are not measured yet. See [`docs/TESTING.md`](docs/TESTING.md#performance).
- **Binary size.** The release binary is 5.0 MB, almost all of it the embedded UI and editor engine. GTK and WebKitGTK are system libraries and aren't counted.

## Licence

PageLite is licensed under the [Apache License 2.0](LICENSE). Copyright 2026 Sohum Ramouthar.

The binary embeds third-party code under MIT, Apache-2.0, 0BSD and Zlib licences. The build collects every component and its licence text into `THIRD_PARTY_NOTICES.md`, installed in `/usr/share/doc/pagelite/` (`packaging/third-party-notices.mjs`). The build fails if a dependency's licence is not on the allowlist.
