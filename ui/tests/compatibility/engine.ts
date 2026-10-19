// Drives the editing engine headlessly, the way the app drives it through the browser editor:
// open, edit the target paragraph, save. The headless automation host is the engine's own
// DOM-free twin of the editor: the same package reader, operations and serializer.
import { createServerAutomationHost } from '@docx-editor.dev/core/automation';
import type { AppliedEdits } from './inspect';

type Host = Extract<ReturnType<typeof createServerAutomationHost>, { ok: true }>['host'];
type Operation = Parameters<Host['execute']>[0]['operations'][number];
type Value = Extract<ReturnType<Host['execute']>['results'][number], { status: 'ok' }>['value'];
type ParagraphHandle = Extract<Operation, { op: 'getText' }>['target'];

export function open(bytes: Uint8Array): Host {
  const result = createServerAutomationHost(bytes);
  if (!result.ok) throw new Error(`rejected: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`);
  return result.host;
}

/** Runs one batch and returns its values; throws with the engine's reason on any refusal. */
function run(host: Host, operations: Operation[]): Value[] {
  const response = host.execute({ operations });
  return response.results.map((r, i) => {
    if (r.status !== 'ok') {
      const why = r.status === 'error' ? `${r.error.code}: ${r.error.message}` : 'skipped';
      throw new Error(`${operations[i].op} failed (${why})`);
    }
    return r.value;
  });
}

function only<K extends Value['kind']>(value: Value, kind: K): Extract<Value, { kind: K }> {
  if (value.kind !== kind) throw new Error(`expected ${kind}, got ${value.kind}`);
  return value as Extract<Value, { kind: K }>;
}

/** Body paragraph handles and their text, in reading order (including table cells). */
export function paragraphs(host: Host): { handle: ParagraphHandle; text: string }[] {
  const [documentValue] = run(host, [{ op: 'getDocument' }]);
  const [bodyValue] = run(host, [{ op: 'getBody', document: only(documentValue, 'handle').handle }]);
  const [paraValue] = run(host, [{ op: 'getParagraphs', body: only(bodyValue, 'handle').handle }]);
  const handles = only(paraValue, 'handles').handles;
  if (handles.length === 0) return [];
  const texts = run(
    host,
    handles.map((target) => ({ op: 'getText', target, projection: 'model' })),
  );
  return handles.map((handle, i) => ({ handle, text: only(texts[i], 'text').text }));
}

/**
 * Applies the suite's standard edits to the paragraph whose text is `target`: append the
 * marker, bold one word and centre the paragraph. Each is its own batch, like separate
 * user actions in the editor. Returns null when the document has no such paragraph.
 */
export function editTarget(host: Host, target: string, marker: string, boldWord: string): AppliedEdits | null {
  const paragraph = paragraphs(host).find((p) => p.text === target)?.handle;
  if (!paragraph) return null;
  run(host, [{ op: 'insertText', at: { paragraph, at: 'end' }, text: marker }]);
  const [found] = run(host, [{ op: 'search', scope: { paragraph }, text: boldWord, options: { matchCase: true } }]);
  const span = only(found, 'spans').spans[0];
  run(host, [{ op: 'setFont', span, font: { bold: true } }]);
  run(host, [{ op: 'setParagraphFormat', paragraph: { paragraph }, format: { alignment: 'Centered' } }]);
  return { target, marker, bold: boldWord, centred: true };
}

export function save(host: Host): Uint8Array {
  const saved = host.save();
  if (!saved.ok) throw new Error(`save failed (${saved.error.code}: ${saved.error.message})`);
  return saved.bytes;
}

/**
 * Appends `marker` to every body paragraph that has words in it (table cells included), one
 * batch per paragraph like separate keystrokes. Paragraphs holding only an image or a break
 * are skipped: the engine counts the object as text, the inspector does not. Returns how many
 * paragraphs were edited.
 */
export function editEveryParagraph(host: Host, marker: string): number {
  const targets = paragraphs(host).filter((p) => /[\p{L}\p{N}]/u.test(p.text));
  for (const { handle: paragraph } of targets) {
    run(host, [{ op: 'insertText', at: { paragraph, at: 'end' }, text: marker }]);
  }
  return targets.length;
}
