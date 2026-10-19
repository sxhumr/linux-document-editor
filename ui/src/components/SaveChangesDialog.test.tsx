import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SaveChangesDialog } from './SaveChangesDialog';

beforeAll(() => {
  // jsdom lacks showModal/close; give them the minimal behaviour the component relies on.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(cleanup);

describe('SaveChangesDialog', () => {
  it('names the document', () => {
    render(<SaveChangesDialog docName="report.docx" onChoice={() => {}} />);
    expect(screen.getByRole('heading')).toHaveProperty('textContent', 'Save changes to “report.docx”?');
  });

  it.each([
    ["Don't Save", 'discard'],
    ['Cancel', 'cancel'],
    ['Save', 'save'],
  ])('%s answers %s', (label, choice) => {
    const onChoice = vi.fn();
    render(<SaveChangesDialog docName="a.docx" onChoice={onChoice} />);
    fireEvent.click(screen.getByText(label));
    expect(onChoice).toHaveBeenCalledWith(choice);
  });

  it('Escape cancels', () => {
    const onChoice = vi.fn();
    const { container } = render(<SaveChangesDialog docName="a.docx" onChoice={onChoice} />);
    fireEvent(container.ownerDocument.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(onChoice).toHaveBeenCalledWith('cancel');
  });
});
