// Minimal 16px stroke icons for the toolbar, drawn inline (no icon font or network).
const PATHS = {
  undo: 'M4 7h6a3 3 0 0 1 0 6H8 M4 7l3-3 M4 7l3 3',
  redo: 'M12 7H6a3 3 0 0 0 0 6h2 M12 7 9 4 M12 7 9 10',
  alignLeft: 'M2 3h12 M2 6.5h8 M2 10h12 M2 13.5h8',
  alignCenter: 'M2 3h12 M4 6.5h8 M2 10h12 M4 13.5h8',
  alignRight: 'M2 3h12 M6 6.5h8 M2 10h12 M6 13.5h8',
  alignJustify: 'M2 3h12 M2 6.5h12 M2 10h12 M2 13.5h12',
  bullets: 'M6 4h8 M6 8h8 M6 12h8 M2.5 4h.01 M2.5 8h.01 M2.5 12h.01',
  numbering: 'M6 4h8 M6 8h8 M6 12h8 M2 3h1v3 M2 6h2 M2 10h2l-2 2.5h2',
  indent: 'M7 4h7 M7 8h7 M7 12h7 M2 5.5 4.5 8 2 10.5',
  outdent: 'M7 4h7 M7 8h7 M7 12h7 M4.5 5.5 2 8l2.5 2.5',
  clear: 'M3 13h6 M6 3l-2 10 M4.5 3H11 M10 9l4 4 M14 9l-4 4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
