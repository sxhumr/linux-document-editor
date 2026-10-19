/**
 * Runs `move` (which selects a match in the document) without taking keyboard focus away
 * from the control the user is in: the Find box, or its next and previous buttons.
 *
 * Selecting a match puts the DOM selection inside the editable page, and WebKit moves focus
 * there with it, even though the engine itself does not ask for focus. Without this, the
 * next keys typed into the Find box would edit the document (replacing the selected match).
 * Focus (and a text box's caret) is put back now, and again after the next frame in case the
 * selection is applied late. If focus was already in the document, nothing is changed.
 */
export function keepingFocus(move: () => void): void {
  const control = document.activeElement;
  if (!(control instanceof HTMLElement) || control === document.body || control.isContentEditable) {
    move();
    return;
  }
  const caret = control instanceof HTMLInputElement ? [control.selectionStart, control.selectionEnd] : null;
  move();
  const restore = () => {
    if (!control.isConnected || document.activeElement === control) return;
    control.focus({ preventScroll: true });
    if (control instanceof HTMLInputElement && caret?.[0] != null && caret[1] != null) {
      control.setSelectionRange(caret[0], caret[1]);
    }
  };
  restore();
  requestAnimationFrame(restore);
}
