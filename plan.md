# PageLite — Lightweight Linux DOCX Editor

## Project Overview

Build a minimal Linux desktop application for opening, editing, and saving Microsoft Word `.docx` documents.

The goal is to provide a fast, uncluttered alternative for everyday document edits without recreating the extensive features of LibreOffice or Microsoft Word.

**Core principle:** Build a custom, lightweight user interface around an existing document-editing engine. Do not implement a DOCX parser, serializer, or document-layout engine from scratch.

## Instructions for the Coding Agent

1. Inspect the existing repository before making changes.
2. Use an established document-editing engine or library.
3. Validate DOCX import, editing, export, and formatting preservation before building the full interface.
4. Use current official documentation to verify library capabilities, APIs, licensing, and compatibility.
5. Implement incrementally, with tests for every milestone.
6. Preserve user data and handle file errors safely.
7. Do not claim compatibility or performance improvements without testing them.
8. Keep the application small in scope and avoid unnecessary dependencies.
9. Document architectural decisions and known limitations.
10. At the end of each task, report changes, tests, results, limitations, and the next step.

## 1. Goals

- Open and edit existing `.docx` files.
- Save documents and use Save As.
- Provide essential rich-text formatting.
- Offer a clean, minimal desktop interface.
- Support common keyboard shortcuts.
- Protect unsaved changes.
- Preserve supported document formatting.
- Package the application for Linux.
- Create a polished, demonstrable software engineering portfolio project.

## 2. Non-Goals

The initial release will not include:

- Spreadsheets or presentations.
- Collaboration or cloud synchronization.
- User accounts.
- AI writing tools.
- Macros or mail merge.
- PDF editing.
- Full compatibility with every Microsoft Word feature.
- A custom DOCX parsing and rendering engine.

## 3. Architecture

Evaluate the following stack:

- **Desktop framework:** Tauri.
- **Frontend:** React and TypeScript.
- **Rich-text editing:** Tiptap/ProseMirror or another suitable established editor.
- **DOCX handling:** An established import/export solution or a more complete document engine.
- **Testing:** Frameworks appropriate to the selected stack.
- **Packaging:** AppImage or `.deb`, depending on the final architecture.

These are candidates, not mandatory decisions. Confirm compatibility before committing.

### Candidate engine evaluation

Investigate:

1. Tiptap/ProseMirror with a DOCX conversion solution.
2. ONLYOFFICE or another mature document-editing engine.
3. Other established DOCX libraries with suitable editing and round-trip capabilities.

Compare:

- DOCX formatting preservation.
- Editing existing documents.
- Offline operation.
- Linux support.
- Application size and startup time.
- Custom UI integration.
- Maintenance and documentation.
- Licensing and distribution restrictions.
- Automated testing support.

Document the findings in `docs/ENGINE_EVALUATION.md`.

## 4. MVP Requirements

### File operations

- Open DOCX.
- Create a blank document.
- Save.
- Save As.
- Track unsaved changes.
- Warn before discarding edits.
- Handle read/write errors.
- Preserve edits in memory if saving fails.

### Editing

- Plain text editing.
- Bold, italic, underline.
- Headings.
- Paragraph alignment.
- Bulleted and numbered lists.
- Undo and redo.
- Find text.
- Basic font controls where supported.

### User interface

- Minimal File, Edit, Format, and Help menus.
- Compact formatting toolbar.
- Readable document canvas.
- Current filename in the window title.
- Visible modified-state indicator.
- Keyboard-first workflow.
- No unnecessary panels, ribbons, or animations.

### Linux integration

- Native desktop window.
- Reproducible development environment.
- Application icon and desktop entry.
- Installable Linux package.
- File-manager integration where practical.
- Offline operation for ordinary editing wherever possible.

## 5. DOCX Compatibility

DOCX compatibility is the project's highest technical risk.

Create synthetic test documents covering:

- Paragraphs and headings.
- Bold, italic, and underline.
- Different fonts and sizes.
- Bulleted and numbered lists.
- Nested lists.
- Tables.
- Images.
- Page breaks and sections.
- Headers and footers.
- Hyperlinks.
- Unicode text.
- Long documents.
- Empty and malformed documents.

For each document:

1. Open the original.
2. Edit a paragraph.
3. Save to a new file.
4. Reopen the saved file.
5. Verify the edit persisted.
6. Check whether supported formatting was retained.
7. Record any lost or altered content.

Never use private documents as committed test fixtures.

Never treat a successful save as proof of formatting compatibility.

## 6. Reliability and Data Safety

- Only mark a document as saved after the save succeeds.
- Never silently discard unsaved changes.
- Provide Save, Discard, and Cancel options when closing a modified document.
- Preserve the editor state if saving fails.
- Handle read-only files, missing directories, permission errors, and cancelled dialogs.
- Avoid overwriting the original during compatibility testing.
- Use safe file-writing techniques supported by the selected framework.
- Avoid logging document contents or sending them to remote services.

## 7. Development Milestones

### Milestone 0 — Repository inspection

Inspect the project, tooling, dependencies, and tests. Report findings before making major changes.

### Milestone 1 — Engine evaluation

Compare candidate engines, review licensing, and build an open/edit/save/reopen proof of concept.

Deliverable: `docs/ENGINE_EVALUATION.md`.

**Do not build the full UI until the DOCX round trip has been validated.**

### Milestone 2 — Application scaffold

Set up the selected framework, TypeScript, linting, formatting, and tests.

Deliverable: a minimal Linux desktop application that launches.

### Milestone 3 — End-to-end document editing

Open a DOCX, edit a paragraph, save a new file, and reopen it.

Deliverable: a working vertical slice.

### Milestone 4 — File lifecycle

Implement New, Open, Save, Save As, dirty-state tracking, and unsaved-change protection.

### Milestone 5 — Core formatting

Implement basic formatting, lists, alignment, undo/redo, find, and keyboard shortcuts.

### Milestone 6 — Compatibility hardening

Expand the test corpus, investigate formatting loss, and document limitations.

### Milestone 7 — Linux packaging

Create and test an installable Linux build.

### Milestone 8 — Portfolio release

Finalise the README, architecture documentation, compatibility notes, screenshots, and demo.

## 8. Testing

Add unit tests for:

- Document state.
- Dirty-state transitions.
- Save success and failure.
- Open/close workflows.
- File-path handling.

Add integration tests for:

- Open, edit, save, and reopen.
- Save failures.
- Cancelled dialogs.
- Closing with unsaved changes.
- Unsupported documents.

Run the DOCX compatibility corpus regularly.

Do not mark features complete until their acceptance criteria and relevant tests pass.

## 9. Suggested Repository Structure

Adapt this to the selected framework.

    pagelite/
    ├── README.md
    ├── LICENSE
    ├── docs/
    │   ├── ENGINE_EVALUATION.md
    │   ├── ARCHITECTURE.md
    │   ├── COMPATIBILITY.md
    │   └── TESTING.md
    ├── fixtures/
    │   └── docx/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── document/
    │   ├── file-operations/
    │   ├── state/
    │   └── styles/
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   └── compatibility/
    └── [desktop framework files]

Do not create empty abstractions or directories without a clear purpose.

## 10. Performance

Measure rather than assume performance.

Initial targets:

- Cold startup under two seconds on the reference machine.
- Opening a small DOCX under two seconds on the reference machine.
- Responsive typing and formatting.
- No loss of in-memory edits following a save failure.

Record the hardware, operating system, measurement procedure, and actual results.

## 11. Licensing and Privacy

- Review the licence of every core dependency.
- Confirm distribution is permitted before publishing binaries.
- Include required notices and attribution.
- Prefer offline operation.
- Avoid unnecessary telemetry and network calls.
- Treat input documents as untrusted files.
- Do not claim official Microsoft Word compatibility certification.

## 12. Portfolio Outcome

The completed project should demonstrate desktop application development, library integration, file handling, testing, document compatibility analysis, Linux packaging, and product-focused engineering.

Possible CV entry after implementation:

**PageLite — Lightweight Linux DOCX Editor | Personal Project**

- Developed a minimal Linux desktop application for editing and saving DOCX documents using a custom interface and an established document-editing engine.
- Implemented essential rich-text formatting and safe document file workflows.
- Added automated round-trip tests to validate persistence and identify formatting compatibility limitations.
- Packaged the application for Linux and documented its architecture and supported features.

Only list technologies and features actually implemented.

## 13. Definition of Done

Status at release 0.1.0 (2026-10-19), with the evidence for each item:

- [x] Application launches on Linux. Checked by hand on Ubuntu 24.04, and the installed package is launched in CI (`packaging/test-deb.sh`).
- [x] User can create a document. File → New (Milestone 4), covered by `controller.test.ts`.
- [x] User can open an existing DOCX. File → Open, the command line and Open With (Milestones 3, 4 and 7).
- [x] User can edit and format text. Toolbar, menus and shortcuts (Milestone 5); see `docs/media/`.
- [x] Save and Save As work. Atomic native writes (ADR-6), `file_io_test.cpp` and `controller.test.ts`.
- [x] Unsaved changes are protected. Save / Discard / Cancel before New, Open, Quit and close (ADR-4, ADR-7).
- [x] Save failures do not silently discard edits. `controller.test.ts`, and manual checklist item 5 in `docs/TESTING.md`.
- [x] Saved files can be reopened. Every compatibility trip reopens its output in the engine and in LibreOffice.
- [x] DOCX compatibility tests have been performed. `ui/tests/compatibility/` (35 documents, in CI); results in `docs/COMPATIBILITY.md`.
- [x] Known limitations are documented. `docs/ARCHITECTURE.md` and `docs/COMPATIBILITY.md`.
- [x] Automated tests pass. CI runs the UI, native and package jobs.
- [x] Linux packaging has been tested. A clean Ubuntu 24.04 container install, run and removal, in CI.
- [x] README includes setup, usage, and limitations.

## 14. Immediate Next Actions

For the first coding session:

1. Inspect the repository.
2. Summarise its current state.
3. Identify two or three viable document engines.
4. Check official documentation and licensing.
5. Build a small DOCX round-trip proof of concept.
6. Write `docs/ENGINE_EVALUATION.md` with evidence and results.
7. Recommend the architecture before building the full application.

**Critical instruction: prove document compatibility before investing in the user interface.**
