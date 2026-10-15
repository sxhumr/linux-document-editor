# Architecture

## Overview

PageLite is a C++23 GTK application that hosts one WebKitGTK view. The editing engine and the UI are TypeScript running in that view. All file access stays on the C++ side.

```
pagelite (one binary)
├─ C++ shell (native/)                      Web UI (ui/, React + TypeScript)
│  ├─ GTK window, dialogs, close handling   ├─ PageLite chrome: toolbar, menus, title
│  ├─ webview/webview → WebKitGTK view ───► ├─ @docx-editor.dev/react + core (Apache-2.0)
│  ├─ pagelite:// scheme: serves ui/dist    │    DOCX parse → canonical OOXML tree → save
│  │  from memory (linked into the binary)  │
│  ├─ navigation lock: only pagelite://app  └─ src/native/bridge.ts: typed window.pagelite_*
│  ├─ bindings: window.pagelite_* ◄──────────── calls (JSON over WebKit message handler)
│  ├─ GTK file dialogs (non-blocking)       ├─ src/document/: session (name, path), validation
│  ├─ PathGrants: user-chosen paths only    │    before load, Open / Save As actions
│  └─ file_io: bounded read, atomic write   └─ bytes cross the bridge as base64
```

### Open → edit → Save As

1. **Open.** Ctrl+O calls `pagelite_openDocument`. The shell shows `GtkFileChooserNative`, records the chosen path in `PathGrants`, and reads it with `file_io::read_file`, which refuses files over 256 MB. It replies with `{path, name, data}`, where `data` is the file in base64.
2. **Validate and load.** The UI decodes the bytes and runs the engine's bounded package reader (`validateDocx`). Only a file that passes replaces the open document (`editor.load`). A rejected file leaves the current document untouched and shows a readable error.
3. **Save As.** Ctrl+Shift+S (or Ctrl+S, until Milestone 4) calls `pagelite_chooseSavePath`.
   - **Dialog.** It opens in the current file's folder and asks before overwriting. If `.docx` had to be added to the name, that path is refused rather than silently overwritten.
   - **Bytes.** The UI then calls `editor.save()` to get the document bytes.
   - **Write.** It sends them to `pagelite_writeDocument`, which writes atomically.
   - **Result.** On success, the document takes the new name and path. On failure, the editor is untouched and the error is shown, so no edits are lost.
4. **Reopen.** A document passed on the command line (`pagelite file.docx`) is granted and opened the same way at startup.

## Decisions

### ADR-1: C++ with webview/webview instead of Tauri (2026-10-15)

- **Context.** `plan.md` listed Tauri as a candidate. The project is meant to show the author's existing skills, and the author knows C++, not Rust. The engine chosen in Milestone 1 runs in JavaScript, so any shell needs a webview anyway.
- **Decision.** The native shell is C++23 using [webview/webview](https://github.com/webview/webview) 0.12.0 (MIT), pinned by commit. PageLite creates the GTK window itself and passes it to webview. That keeps window-close, dialogs and WebKit settings under PageLite's control.
- **Consequences.**
  - The binary stays small: it uses the system WebKitGTK, the same engine Tauri uses on Linux.
  - Things Tauri would have provided now have to be built in C++ and tested: asset serving, the JS↔C++ bridge, file dialogs, safe saving and packaging. That is intended, since it is the C++ work this project exists to show.
  - Linux only. webview supports other platforms, but the GTK-specific code in `shell.cpp` does not.
- **Rejected alternatives.**
  - **Qt with QtWebEngine:** bundles Chromium, about 150 MB+.
  - **Electron:** no native code to show, and heavy.
  - **Tauri:** Rust.

### ADR-2: Serve the UI from a custom `pagelite://` scheme

- **Problem.** webview/webview can load a URL or an HTML string, but it has no way to serve the app's own files. The two usual workarounds both have a cost:
  - **`file://`** depends on the install layout, and WebKit restricts ES modules and WebAssembly from `file://`.
  - **A localhost HTTP server** opens a port that any local process can reach.
- **Decision.** `ui/dist` is linked into the binary at build time (`native/cmake/embed_assets.cmake` generates an `.incbin` assembly file plus a sorted index). The shell registers `pagelite://` with WebKit and answers requests from memory.
  - **Headers:** every response carries a strict Content-Security-Policy and `X-Content-Type-Options: nosniff`.
  - **Scheme registration:** the scheme is registered as secure and CORS-enabled, so ES modules and the engine's HarfBuzz WebAssembly load as they would over HTTPS.
- **Path safety.** Paths are rejected rather than normalised if they contain `..`, `.`, empty segments, backslashes or percent-encoding. Unit tests cover this in `native/tests/assets_test.cpp`.

### ADR-3: The web view may only show the app

- **Threat.** Any page loaded in the view can call the native `window.pagelite_*` bindings. Documents are untrusted, and a clicked hyperlink must not turn into a page that can drive file I/O.
- **Policy.** `decide-policy` therefore refuses every navigation except:
  - `pagelite://app/...`;
  - `about:blank` and `about:srcdoc`;
  - in Debug builds only, the exact origin given in `PAGELITE_DEV_SERVER`.
- **Other protections.**
  - New-window requests are refused.
  - `file://` cross-access is off.
  - Refused URLs are not logged, because they can come from document content.
- **Tests.** The policy is a pure function, `navigation::is_allowed`, tested in `native/tests/navigation_test.cpp`.

### ADR-4: Closing the window always goes through the UI

The GTK `delete-event` never closes the window by itself.

- **After the UI has registered its handler** (`pagelite_registerCloseHandler`), the shell calls `window.__pagelite_requestClose()`. The window closes only when the UI answers with `pagelite_confirmClose`.
- **If the UI never loaded**, there are no edits to lose, so the window closes directly.

Milestone 4 adds the Save / Discard / Cancel prompt on top of this hook.

### ADR-5: The UI can only touch files the user chose

- **Threat.** The bindings take file paths from JavaScript. If the page were ever compromised, for example through an engine bug triggered by a crafted document, an unrestricted `writeDocument(path)` would be an arbitrary file write.
- **Decision.** The shell keeps a `PathGrants` set, and a path joins it only through a user action: the Open dialog, the Save As dialog, or the command line. `pagelite_writeDocument` refuses any other path with `not-granted`.
- **Other limits.**
  - Open needs no path from JavaScript at all, because the dialog and the read happen together.
  - Save As only opens in a folder that is already granted.
- **Tests.** Grants compare absolute, lexically normal paths, so `a/../b` cannot match a granted `b`. This is covered in `native/tests/path_grants_test.cpp`.

### ADR-6: Saves are atomic

`file_io::write_file_atomic` makes sure a crash, power cut or full disk mid-save cannot leave a half-written document.

- **Steps.**
  1. Write a hidden temporary file in the target's folder (`mkstemp`).
  2. `fsync` it.
  3. `rename()` it over the target. The rename is atomic within one filesystem.
  4. `fsync` the folder, so the rename itself survives a crash.
- **Edge cases.**
  - An existing file keeps its permission bits.
  - A read-only file is refused. `rename` would otherwise replace it, because only the folder needs to be writable.
  - A symlink is followed, so the link survives.
  - Any failure removes the temporary file and leaves the original as it was.
- **Error reporting.** Errors map to stable codes (`permission-denied`, `no-space`, `read-only-filesystem`, `directory-missing`, …) that the UI turns into messages. Covered in `native/tests/file_io_test.cpp`.

## Repository layout

| Path | Contents |
| --- | --- |
| `CMakeLists.txt`, `CMakePresets.json` | Top-level build; `debug` and `release` presets (Ninja) |
| `native/src/` | Shell and bindings (`shell.cpp`), GTK dialogs (`file_dialogs.*`), file I/O (`file_io.*`), path grants (`path_grants.*`), JSON replies (`bridge_json.*`), embedded assets (`assets.*`), navigation policy (`navigation.*`), `main.cpp` |
| `native/tests/` | Catch2 unit tests for the platform-free code (`pagelite_core`) |
| `native/cmake/embed_assets.cmake` | Build-time asset embedding |
| `ui/` | Vite + React + TypeScript UI; Vitest tests; oxlint; Prettier |
| `ui/src/native/` | Typed bridge to the shell (`bridge.ts`), base64 transfer (`base64.ts`) |
| `ui/src/document/` | Document session state and pre-load validation; the only code besides `App.tsx` that knows the engine |
| `fixtures/docx/` | Synthetic DOCX compatibility corpus (Milestone 1) |
| `poc/engine-eval/` | Engine round-trip harness behind `docs/ENGINE_EVALUATION.md` |

## Known limitations (Milestone 3)

- **Blocking save.** Saving runs on the GTK main thread, so a very large document briefly pauses the window while it is written.
- **Bridge overhead.** Documents cross the bridge as base64 inside JSON, which costs about 33% in size plus a copy.
- **No plain Save yet.** There is only Save As, and Ctrl+S opens the Save As dialog.
- **No unsaved-changes warning.** Unsaved changes are not tracked, and closing the window does not warn. Both come in Milestone 4.

## Build

```bash
sudo apt install cmake ninja-build pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
(cd ui && npm ci)
cmake --preset debug && cmake --build --preset debug   # also runs `npm run build`
ctest --preset debug
./build/debug/native/pagelite
```

- **UI hot reload:** run `npm run dev` in `ui/`, then `PAGELITE_DEV_SERVER=http://localhost:5173 ./build/debug/native/pagelite`. This works in Debug builds only.
