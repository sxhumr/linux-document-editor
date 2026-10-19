# PageLite

A lightweight Linux desktop editor for Microsoft Word `.docx` files: a small C++ GTK shell around an established DOCX engine, with a minimal interface.

> **Status: Milestone 5 of 8.**
> - **Done:** New, Open, Save and Save As with crash-safe saving and unsaved-change protection. File, Edit, Format and Help menus. A formatting toolbar with styles, headings, font, size, bold, italic, underline, alignment, lists and indent. Find, and keyboard shortcuts throughout.
> - **Not yet:** compatibility hardening and Linux packaging (Milestones 6–7).
>
> See [`plan.md`](plan.md) for the roadmap.

## How it works

- **Native shell (C++23).** It creates a GTK window and hosts a WebKitGTK view through [webview/webview](https://github.com/webview/webview).
- **Built-in UI.** The interface is built at compile time, linked into the binary, and served from memory over a private `pagelite://` scheme, so there is no local server and no network access.
- **UI and engine (React + TypeScript).** The UI drives [`@docx-editor.dev/core`](https://github.com/eigenpal/docx-editor) (Apache-2.0). The engine edits the document's own XML directly, so content it doesn't understand survives a save.

Design decisions are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the engine choice, backed by round-trip tests, is in [`docs/ENGINE_EVALUATION.md`](docs/ENGINE_EVALUATION.md).

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

**UI hot reload (Debug builds only):**

```bash
(cd ui && npm run dev)
PAGELITE_DEV_SERVER=http://localhost:5173 ./build/debug/native/pagelite
```

## Tests and checks

| What | Command |
| --- | --- |
| C++ unit tests (Catch2) | `ctest --preset debug` |
| UI unit tests (Vitest) | `cd ui && npm test` |
| UI lint, formatting, types | `cd ui && npm run lint && npm run format:check && npm run typecheck` |
| C++ formatting, static analysis | `clang-format --dry-run --Werror native/src/* native/tests/*` and `clang-tidy -p build/debug native/src/*.cpp` |
| DOCX round-trip corpus | `cd poc/engine-eval && npm ci && npm run eval` |

CI runs all of these except the corpus; see `.github/workflows/ci.yml`.

## Measurements so far

- **Binary size.** The release binary is 5.1 MB, almost all of it the embedded UI and editor engine. GTK and WebKitGTK are system libraries and aren't counted.
- **Round trip checked by hand (2026-10-15).** A fixture was opened, edited and saved in the app, then compared with `poc/engine-eval/lib/inspect.mjs`. The edits persisted, and the untouched fonts, sizes, colours, bold, italic, lists, sections and headers were unchanged.
- **Not yet measured.** Startup and file-open times will be measured with a repeatable procedure in Milestone 6.

## Licence

Not chosen yet.
