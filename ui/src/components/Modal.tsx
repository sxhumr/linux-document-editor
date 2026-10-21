import { useEffect, useId, useRef, type ReactNode } from 'react';

/** A modal native <dialog>: focus is trapped, the page is inert, Escape closes. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="tool" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
