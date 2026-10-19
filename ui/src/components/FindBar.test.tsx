import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindBar } from './FindBar';
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
