import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindBar } from './FindBar';
import { keepingFocus } from './keepFocus';
import { matchCountLabel } from './findLabel';

afterEach(cleanup);

const match = { blockId: 'b', start: 0, length: 1 } as never;

describe('matchCountLabel', () => {
  const base = { query: 'x', isPending: false, matches: [], activeIndex: -1, truncated: false };
  it('describes each state', () => {
    expect(matchCountLabel({ ...base, query: '' })).toBe('');
    expect(matchCountLabel({ ...base, isPending: true })).toBe('Searching…');
    expect(matchCountLabel(base)).toBe('No results');
    expect(matchCountLabel({ ...base, matches: [match, match], activeIndex: 1 })).toBe('2 of 2');
    expect(matchCountLabel({ ...base, matches: [match], activeIndex: -1 })).toBe('1 found');
    expect(matchCountLabel({ ...base, matches: [match], activeIndex: 0, truncated: true })).toBe('1 of 1+');
  });
});

function fakeSearch(overrides = {}) {
  return {
    query: 'cat',
    setQuery: vi.fn(),
    find: vi.fn(),
    matchCase: false,
    setMatchCase: vi.fn(),
    wholeWord: false,
    setWholeWord: vi.fn(),
    matches: [match, match, match],
    truncated: false,
    activeIndex: 0,
    activeMatch: match,
    goTo: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    clear: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

describe('FindBar', () => {
  it('focuses the box and shows the count', () => {
    render(<FindBar search={fakeSearch()} focusToken={1} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Find' }));
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });

  it('Enter goes forward, Shift+Enter back, Escape closes', () => {
    const search = fakeSearch();
    const onClose = vi.fn();
    render(<FindBar search={search} focusToken={1} onClose={onClose} />);
    const box = screen.getByRole('searchbox', { name: 'Find' });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(search.next).toHaveBeenCalledOnce();
    expect(search.previous).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('jumps to the first match when results arrive', () => {
    const search = fakeSearch({ activeIndex: -1 });
    render(<FindBar search={search} focusToken={1} onClose={() => {}} />);
    expect(search.goTo).toHaveBeenCalledWith(0);
  });

  it('passes typing and options through', () => {
    const search = fakeSearch();
    render(<FindBar search={search} focusToken={1} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find' }), { target: { value: 'dog' } });
    fireEvent.click(screen.getByLabelText('Match case'));
    expect(search.setQuery).toHaveBeenCalledWith('dog');
    expect(search.setMatchCase).toHaveBeenCalledWith(true);
  });
});

// In WebKit, selecting a match puts the DOM selection inside the editable page, and keyboard
// focus follows it. The next keys meant for the Find box would then edit the document.
describe('FindBar keeps typing in the box when a match is selected', () => {
  function stealingSearch(overrides = {}) {
    const page = document.createElement('div');
    page.contentEditable = 'true';
    page.tabIndex = 0;
    document.body.append(page);
    const steal = vi.fn(() => {
      page.focus();
      return true;
    });
    return { page, search: fakeSearch({ goTo: steal, next: steal, previous: steal, ...overrides }) };
  }

  afterEach(() => document.querySelectorAll('[contenteditable]').forEach((el) => el.remove()));

  it('after jumping to the first match while typing', () => {
    const { search } = stealingSearch({ query: 'be' });
    const { rerender } = render(<FindBar search={search} focusToken={1} onClose={() => {}} />);
    const box = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Find' });
    box.setSelectionRange(2, 2); // the caret after "be", as the user left it
    // Results for the new query arrive: the bar jumps to the first match.
    rerender(<FindBar search={{ ...search, activeIndex: -1 }} focusToken={1} onClose={() => {}} />);
    expect(search.goTo).toHaveBeenCalledWith(0);
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([2, 2]);
  });

  it('after Enter and Shift+Enter', () => {
    const { search } = stealingSearch();
    render(<FindBar search={search} focusToken={1} onClose={() => {}} />);
    const box = screen.getByRole('searchbox', { name: 'Find' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(document.activeElement).toBe(box);
    box.focus();
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(search.previous).toHaveBeenCalled();
    expect(document.activeElement).toBe(box);
  });

  it('after the next and previous buttons', () => {
    const { search } = stealingSearch();
    render(<FindBar search={search} focusToken={1} onClose={() => {}} />);
    const nextButton = screen.getByRole('button', { name: 'Next match' });
    nextButton.focus(); // keyboard users reach it with Tab
    fireEvent.click(nextButton);
    expect(search.next).toHaveBeenCalled();
    expect(document.activeElement).toBe(nextButton);
  });

  it('but not when focus was already in the document (F3 from the page)', () => {
    const { page, search } = stealingSearch();
    render(<FindBar search={search} focusToken={1} onClose={() => {}} />);
    page.focus();
    keepingFocus(() => search.next());
    expect(document.activeElement).toBe(page);
  });
});
