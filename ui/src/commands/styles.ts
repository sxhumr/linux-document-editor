// Finding built-in paragraph styles in an arbitrary document. Word writes ids such as
// "Heading1"; other producers (or localised Word) may use different ids but keep the
// built-in *name* ("heading 1"), so ids are tried first and names second.

export interface StyleOption {
  styleId: string;
  name: string;
}

export type BuiltinStyle = 'normal' | 'title' | 'heading1' | 'heading2' | 'heading3';

const IDS: Record<BuiltinStyle, string> = {
  normal: 'Normal',
  title: 'Title',
  heading1: 'Heading1',
  heading2: 'Heading2',
  heading3: 'Heading3',
};

const NAMES: Record<BuiltinStyle, RegExp> = {
  normal: /^normal$/i,
  title: /^title$/i,
  heading1: /^heading\s*1$/i,
  heading2: /^heading\s*2$/i,
  heading3: /^heading\s*3$/i,
};

/** The document's style id for a built-in style, or null if the document lacks it. */
export function builtinStyleId(options: readonly StyleOption[], style: BuiltinStyle): string | null {
  return (
    options.find((o) => o.styleId === IDS[style])?.styleId ??
    options.find((o) => NAMES[style].test(o.name.trim()))?.styleId ??
    null
  );
}
