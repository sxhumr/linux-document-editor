import type { useDocumentSearch } from '@docx-editor.dev/react';

export type Search = ReturnType<typeof useDocumentSearch>;

/** "3 of 12", "2000+ results" style counter text. */
export function matchCountLabel(s: Pick<Search, 'query' | 'isPending' | 'matches' | 'activeIndex' | 'truncated'>) {
  if (!s.query) return '';
  if (s.isPending) return 'Searching…';
  if (s.matches.length === 0) return 'No results';
  const total = `${s.matches.length}${s.truncated ? '+' : ''}`;
  return s.activeIndex >= 0 ? `${s.activeIndex + 1} of ${total}` : `${total} found`;
}
