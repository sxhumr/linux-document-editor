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
│  ├─ GTK file dialogs (non-blocking)       ├─ src/commands/: one command table → menus,
│  │                                        │    toolbar, shortcuts, Help (ADR-8)
│  │                                        ├─ src/document/: DocumentController (New, Open,
│  ├─ PathGrants: user-chosen paths only    │    Save, Save As, close; unsaved-change guard),
│  │                                        │    session, pre-load validation
│  └─ file_io: bounded read, atomic write   └─ bytes cross the bridge as base64
```

### File lifecycle

`ui/src/document/controller.ts` (`DocumentController`) owns New, Open, Save, Save As and close. It is plain TypeScript: the editor, native file access and the "save changes?" prompt are injected, so every workflow is unit-tested without a window (`controller.test.ts`). `App.tsx` only wires it up.

1. **Open (Ctrl+O).** Calls `pagelite_openDocument`. The shell shows `GtkFileChooserNative`, records the path in `PathGrants`, reads the file (`file_io::read_file`, 256 MB limit) and replies with `{path, name, data}`, where `data` is base64.
   - **Validate first.** The controller checks the bytes with the engine's bounded package reader (`validateDocx`). A file that fails is reported without asking anything, and the open document is untouched.
   - **Then ask.** Only then does it ask about unsaved changes and replace the document.
2. **Save (Ctrl+S).** Writes to the current path with `pagelite_writeDocument`. An untitled document goes through Save As instead.
3. **Save As (Ctrl+Shift+S).** Calls `pagelite_chooseSavePath`.
   - **Dialog.** It opens in the current file's folder and asks before overwriting. If `.docx` had to be added to the name, that path is refused rather than silently overwritten.
   - **Write.** The controller then saves through the engine and writes atomically.
4. **New (Ctrl+N).** Loads Word's blank template as "Untitled".
5. **Close.** The window's × arrives through ADR-4's hook, and the controller decides.
6. **Command line.** `pagelite file.docx` is granted and opened the same way at startup.

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

The Save / Don't Save / Cancel prompt (ADR-7) is built on this hook.

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

### ADR-7: How unsaved changes are tracked

- **Revisions.** The engine numbers every edit with a revision that only ever rises, and resets it to 0 on each load. An experiment in the app confirmed that every load emits a change with `source: "load"`.
- **Rule.** A document is *modified* when its current revision differs from the revision last written to disk.
- **Clean baseline.** That baseline resets on each load and on each successful save.
- **Saving in flight.** The revision is captured *before* the engine serialises the document, so edits typed while a save is in progress stay marked as unsaved.
- **Undo.** Undoing back to the saved text still counts as modified, because the revision does not go back. This matches Word.

These rules guard every action that would lose work:

- **When the prompt appears.** New, Open and close all go through one check. If the document is modified, the user gets a native `<dialog>`: Save / Don't Save / Cancel. Save is the default button, and Escape cancels.
- **Save in the prompt.** Choosing Save runs Save, or Save As for an untitled document. The original action continues only if the save succeeded, so a cancelled or failed save keeps the document open with every edit.
- **Concurrency.** File actions run one at a time, and a second request while a dialog is open is ignored.
- **Where it shows.** The modified state appears as "• " in the window title and "• Edited" next to the file name in the toolbar.

### ADR-8: One command table drives menus, toolbar, shortcuts and Help

- **Problem.** The same action (say, Center) is reachable from the Format menu, a toolbar button, Ctrl+E and the Keyboard Shortcuts screen. If each of those had its own label, key and enabled logic, they would drift apart.
- **Decision.** Two tables, both in `ui/src/commands/`:
  - **`shortcuts.ts`** maps each `CommandId` to its keys and a scope. It is pure and unit-tested, including a check that no key combination is bound twice.
  - **`useCommands.ts`** builds every command's label, action, enabled state and checked state from the `DocumentController` and the engine's headless hooks (`useEditorCommand`, `useParagraphStyle`).
  - Menus, the toolbar, the global key handler and the Shortcuts dialog all read from these tables, so they cannot disagree.
- **Shortcut scopes.**
  - **`app`** keys (file, find, help) work wherever focus is.
  - **`document`** keys (formatting, undo) are skipped while focus is in one of PageLite's own fields, so Ctrl+Z in the Find box undoes the typing in the box.
  - **`native`** keys (cut, copy, paste, select all) are left to the editor, because paste needs the real clipboard event. They are listed only so menus and Help show them.
- **Key choices.** Shortcuts follow Word and LibreOffice: Ctrl+E/L/R/J for alignment, Ctrl+Alt+0–3 for Normal and Heading 1–3, F3 for the next match. While a modal dialog is open, it owns the keyboard.
- **Styles in any document.** Heading commands look the style up by Word's id (`Heading1`) first, then by its built-in name (`heading 1`), so they work in documents from other producers (`commands/styles.ts`). If a document lacks the style, the command is disabled instead of doing nothing silently.
- **Menu bar.** `components/MenuBar.tsx` follows the WAI-ARIA menubar pattern:
  - **Keys:** arrows, Home/End and Escape move around, and Alt+mnemonic opens a menu.
  - **States:** `menuitemcheckbox` with `aria-checked` marks toggles, and `aria-disabled` items are skipped.
  - **Focus:** running a command returns focus to the document first, so it acts on the user's selection.

## Repository layout

| Path | Contents |
| --- | --- |
| `CMakeLists.txt`, `CMakePresets.json` | Top-level build; `debug` and `release` presets (Ninja) |
| `native/src/` | Shell and bindings (`shell.cpp`), GTK dialogs (`file_dialogs.*`), file I/O (`file_io.*`), path grants (`path_grants.*`), JSON replies (`bridge_json.*`), embedded assets (`assets.*`), navigation policy (`navigation.*`), `main.cpp` |
| `native/tests/` | Catch2 unit tests for the platform-free code (`pagelite_core`) |
| `native/cmake/embed_assets.cmake` | Build-time asset embedding |
| `ui/` | Vite + React + TypeScript UI; Vitest tests; oxlint; Prettier |
| `ui/src/native/` | Typed bridge to the shell (`bridge.ts`), base64 transfer (`base64.ts`) |
| `ui/src/document/` | `DocumentController` (file lifecycle), session state, pre-load validation |
| `ui/src/commands/` | Shortcut table, command table (`useCommands`), built-in style lookup |
| `ui/src/components/` | Menu bar, toolbar, find bar, dialogs (save changes, shortcuts, about), icons |
| `fixtures/docx/` | Synthetic DOCX compatibility corpus (Milestone 1) |
| `poc/engine-eval/` | Engine round-trip harness behind `docs/ENGINE_EVALUATION.md` |

## Known limitations (Milestone 5)

- **Blocking save.** Saving runs on the GTK main thread, so a very large document briefly pauses the window while it is written.
- **Bridge overhead.** Documents cross the bridge as base64 inside JSON, which costs about 33% in size plus a copy.
- **Undo to the saved text.** The document still shows as modified (see ADR-7).
- **No autosave or crash recovery.** If the app or session crashes, unsaved edits are lost.
- **Menu Paste.** Edit → Paste reads the clipboard through `navigator.clipboard.readText()`, so it pastes plain text only. Ctrl+V keeps formatting, because it goes through the native paste event.
- **Fonts.** The font list comes from the engine and the document. Fonts that are not installed render in a substitute face.

## Build

```bash
sudo apt install cmake ninja-build pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
(cd ui && npm ci)
cmake --preset debug && cmake --build --preset debug   # also runs `npm run build`
ctest --preset debug
./build/debug/native/pagelite
```

- **UI hot reload:** run `npm run dev` in `ui/`, then `PAGELITE_DEV_SERVER=http://localhost:5173 ./build/debug/native/pagelite`. This works in Debug builds only.
