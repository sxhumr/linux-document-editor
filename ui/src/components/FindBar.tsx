import { useEffect, useRef } from 'react';
import { matchCountLabel, type Search } from './findLabel';
import { keepingFocus } from './keepFocus';

/**
 * Find bar under the toolbar. Typing searches incrementally and selects the first match;
 * Enter / Shift+Enter (or F3 / Shift+F3 anywhere) move between matches; Escape closes and
 * returns to the document. `focusToken` changes each time Find is invoked, re-focusing
 * and selecting the box.
 */
export function FindBar({ search, focusToken, onClose }: { search: Search; focusToken: number; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusToken]);

  // Jump to the first match once results arrive, like incremental search in Word/gedit.
  const { matches, activeIndex, goTo } = search;
  useEffect(() => {
    if (matches.length > 0 && activeIndex < 0) keepingFocus(() => goTo(0));
  }, [matches, activeIndex, goTo]);

  return (
    <div className="findbar" role="search" aria-label="Find in document">
      <input
        ref={input}
        type="search"
        className="find-input"
        placeholder="Find in document"
        aria-label="Find"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            keepingFocus(() => (e.shiftKey ? search.previous() : search.next()));
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="find-count" aria-live="polite">
        {matchCountLabel(search)}
      </span>
      <button
        type="button"
        className="tool"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        disabled={search.matches.length === 0}
        onClick={() => keepingFocus(() => search.previous())}
      >
        ↑
      </button>
      <button
        type="button"
        className="tool"
        title="Next match (Enter)"
        aria-label="Next match"
        disabled={search.matches.length === 0}
        onClick={() => keepingFocus(() => search.next())}
      >
        ↓
      </button>
      <label className="find-option">
        <input type="checkbox" checked={search.matchCase} onChange={(e) => search.setMatchCase(e.target.checked)} />
        Match case
      </label>
      <label className="find-option">
        <input type="checkbox" checked={search.wholeWord} onChange={(e) => search.setWholeWord(e.target.checked)} />
        Whole words
      </label>
      <span className="spacer" />
      <button type="button" className="tool" title="Close (Escape)" aria-label="Close find" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
