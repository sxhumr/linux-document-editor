// Every difference the compatibility suite currently accepts, with the reason. A listed loss
// that stops happening fails the suite, so this file stays an accurate record; it is the
// source for docs/COMPATIBILITY.md.

/** fixture → feature → why the saved file differs from the original. */
export const KNOWN_LOSSES: Record<string, Partial<Record<string, string>>> = {};

/**
 * Package parts whose content may change when the edit target is edited. Every other part
 * must come out with identical content (compared as canonical XML, see inspect.ts): that is
 * the engine's pass-through guarantee (docs/ARCHITECTURE.md).
 */
export const REWRITTEN_PARTS: readonly string[] = ['word/document.xml'];

/** fixture → extra parts that change for that fixture only, with the reason. */
export const FIXTURE_REWRITTEN_PARTS: Record<string, Record<string, string>> = {};

const LINK_STYLE_INHERITED =
  'Text appended after a link inherits its character style (outside the link; the link is unchanged).';

/** fixture → structure key → why it changes when every paragraph is edited. */
export const KNOWN_STRESS_LOSSES: Record<string, Partial<Record<string, string>>> = {
  // Text typed at the end of a paragraph that ends in a link lands outside the link (the link
  // itself is unchanged) but inherits the link's character style, so it looks like a link.
  hyperlinks: { characterStyles: LINK_STYLE_INHERITED },
  'libreoffice/lo-hyperlinks': { characterStyles: LINK_STYLE_INHERITED },
  // Same effect on table-of-contents entries, which LibreOffice writes as IndexLink runs.
  'libreoffice/lo-fields-toc': { characterStyles: LINK_STYLE_INHERITED },
};
