import { useEffect, useRef } from 'react';
import type { SaveChoice } from '../document/controller';

/**
 * "Save changes?" prompt shown before a modified document is replaced or closed.
 * A native <dialog> opened with showModal(): focus is trapped, the page behind is inert,
 * and Escape cancels. Save has initial focus, so Enter saves.
 */
export function SaveChangesDialog({ docName, onChoice }: { docName: string; onChoice: (c: SaveChoice) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="save-dialog"
      aria-labelledby="save-dialog-title"
      aria-describedby="save-dialog-body"
      onCancel={(e) => {
        e.preventDefault(); // Escape: answer instead of letting the dialog close itself
        onChoice('cancel');
      }}
    >
      <h2 id="save-dialog-title">Save changes to “{docName}”?</h2>
      <p id="save-dialog-body">If you don't save, your changes will be lost.</p>
      <div className="save-dialog-actions">
        <button type="button" className="button" onClick={() => onChoice('discard')}>
          Don't Save
        </button>
        <span className="spacer" />
        <button type="button" className="button" onClick={() => onChoice('cancel')}>
          Cancel
        </button>
        <button type="button" className="button button-primary" autoFocus onClick={() => onChoice('save')}>
          Save
        </button>
      </div>
    </dialog>
  );
}
