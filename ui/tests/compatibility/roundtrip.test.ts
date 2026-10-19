// @vitest-environment node
// DOCX compatibility corpus: every fixture goes open → edit → save → reopen through the
// engine and the app's own validation, then the saved file is compared with the original by
// an independent OOXML inspector. One test per fixture × feature, so a regression names
// exactly what was lost.
import { beforeAll, describe, expect, it } from 'vitest';
import { validateDocx } from '../../src/document/validate';
import { EDIT_MARKER, EDIT_TARGET, isMalformed, listFixtures } from './corpus';
import * as engine from './engine';
import { compareFeatures, compareStructure, FEATURE_KEYS, inspectDocx, type Comparison } from './inspect';
import { FIXTURE_REWRITTEN_PARTS, KNOWN_LOSSES, KNOWN_STRESS_LOSSES, REWRITTEN_PARTS } from './known-losses';
import { readFixture, roundTrip, type Trip } from './roundtrip';

const fixtures = listFixtures();
const STRESS_MARKER = ' [+]';

describe.each(fixtures.filter(isMalformed))('%s', (name) => {
  it('is refused by the app before it reaches the editor', async () => {
    expect(validateDocx(await readFixture(name)).ok).toBe(false);
  });

  it('is refused by the engine without crashing', async () => {
    const bytes = await readFixture(name);
    expect(() => engine.open(bytes)).toThrow(/rejected/);
  });
});

describe.each(fixtures.filter((name) => !isMalformed(name)))('%s', (name) => {
  let trip: Trip;
  let comparison: Comparison;

  beforeAll(async () => {
    trip = await roundTrip(name);
    if (!trip.original.ok || !trip.saved.ok) throw new Error('inspector could not read a file');
    const edits = trip.edits ?? { target: EDIT_TARGET, marker: '', bold: null, centred: false };
    comparison = compareFeatures(trip.original.features, trip.saved.features, edits);
  }, 30_000);

  it('applies the edits and reopens with them', () => {
    const hasTarget = trip.original.ok && trip.original.features.paragraphTexts.includes(EDIT_TARGET);
    expect(trip.edits !== null).toBe(hasTarget);
    if (hasTarget) expect(trip.reopenedTexts).toContain(EDIT_TARGET + EDIT_MARKER);
  });

  it('saves without changes when nothing was edited', async () => {
    const host = engine.open(trip.bytes);
    const unedited = await inspectDocx(engine.save(host));
    host.dispose();
    if (!trip.original.ok || !unedited.ok) throw new Error('unreadable');
    expect(unedited.parts).toEqual(trip.original.parts);
  });

  it('keeps every part it does not edit, and adds none', () => {
    if (!trip.original.ok || !trip.saved.ok) throw new Error('unreadable');
    const { parts: before } = trip.original;
    const { parts: after } = trip.saved;
    const allowed = new Set([...REWRITTEN_PARTS, ...Object.keys(FIXTURE_REWRITTEN_PARTS[name] ?? {})]);
    const changed = Object.keys(before).filter((part) => after[part] !== before[part]);
    expect(changed.filter((part) => !allowed.has(part))).toEqual([]);
    expect(Object.keys(after).filter((part) => !(part in before))).toEqual([]);
    // A listed per-fixture change that no longer happens is stale.
    const stale = Object.keys(FIXTURE_REWRITTEN_PARTS[name] ?? {}).filter((part) => !changed.includes(part));
    expect(stale).toEqual([]);
  });

  it('writes nothing Word would refuse', () => {
    if (!trip.saved.ok) throw new Error('unreadable');
    expect(trip.saved.problems).toEqual([]);
  });

  // Edits inside every feature's own paragraph (list items, links, table cells, comment
  // ranges, tracked changes), where a lossy engine would most likely drop something.
  it('keeps the structure when every paragraph is edited', async () => {
    if (!trip.original.ok) throw new Error('unreadable');
    const host = engine.open(trip.bytes);
    const editedCount = engine.editEveryParagraph(host, STRESS_MARKER);
    const saved = await inspectDocx(engine.save(host));
    host.dispose();
    if (!saved.ok) throw new Error(saved.error);

    const texts = saved.features.paragraphTexts;
    expect(texts.filter((t) => t.endsWith(STRESS_MARKER)).length).toBeGreaterThanOrEqual(editedCount);
    expect(saved.problems).toEqual([]);
    const lost = Object.entries(compareStructure(trip.original.features, saved.features)).filter(([, r]) => !r.kept);
    const unexpected = lost.filter(([key]) => !KNOWN_STRESS_LOSSES[name]?.[key]);
    expect(Object.fromEntries(unexpected)).toEqual({});
    const stale = Object.keys(KNOWN_STRESS_LOSSES[name] ?? {}).filter((key) => !lost.some(([k]) => k === key));
    expect(stale, 'listed in KNOWN_STRESS_LOSSES but now kept; remove it').toEqual([]);
  }, 60_000);

  it.each(FEATURE_KEYS)('keeps %s', (key) => {
    const result = comparison[key];
    const knownLoss = KNOWN_LOSSES[name]?.[key];
    if (knownLoss) {
      expect(result.kept, `${name}/${key} is listed in known-losses.ts but is now kept; remove it`).toBe(false);
      return;
    }
    if (!result.kept) expect(result.actual).toEqual(result.expected);
  });
});
