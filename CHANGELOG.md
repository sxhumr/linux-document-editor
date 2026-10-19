# Changelog

## 0.1.0 (2026-10-19)

First release.

### Editing

- Open, edit and save Word `.docx` files; create new documents.
- Paragraph styles and headings, font and size, bold, italic, underline and strikethrough, alignment, bulleted and numbered lists, indent, and clear formatting.
- Undo and redo, cut, copy and paste, and incremental Find with match case, whole words and next or previous match.
- File, Edit, Format and Help menus that work from the keyboard, Word-style shortcuts, and a list of every shortcut (F1).

### Your work is safe

- Atomic saves: a crash or full disk never leaves a half-written file.
- A failed save keeps every edit, and the document stays marked as modified.
- Save / Discard / Cancel before New, Open, Quit or closing the window.
- Files are checked before they replace the open document. Damaged files and decompression bombs are refused with a readable message.
- Works offline; documents are never sent anywhere.

### Compatibility

- Content PageLite does not edit is kept as it was, including comments, tracked changes, footnotes and endnotes, fields, bookmarks, images, text boxes, sections, headers and footers. This is verified on every change by a 35-document test suite; see `docs/COMPATIBILITY.md`.

### Linux

- A `.deb` package for Ubuntu 24.04 and later, with a desktop entry, an icon, AppStream metadata and **Open With** for `.docx` files.

### Fixed before release

- Typing into Find at normal speed could move keyboard focus into the document, so the next keys replaced the selected match. Focus now stays in the Find box (`keepingFocus`).

### Known limitations

- Ubuntu 24.04+ on amd64 only, and not yet checked in Microsoft Word.
- The font size picker is blank when the size is inherited from the document's styles.
- Text typed at the end of a paragraph that ends in a link takes on the link's style (outside the link itself).
- More in `docs/ARCHITECTURE.md` and `docs/COMPATIBILITY.md`.
