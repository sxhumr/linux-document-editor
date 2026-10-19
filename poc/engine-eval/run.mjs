// DOCX round-trip harness: for every fixture × candidate engine
//   open → append a marker to the edit-target paragraph → save to a NEW file → reopen
// then compare the output against the original with the engine-independent inspector.
// Originals are never written to. Usage: node run.mjs [adapterId ...]
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { EDIT_MARKER, EDIT_TARGET, FIXTURE_DIR } from './lib/corpus.mjs';
import { compareFeatures, inspectDocx } from './lib/inspect.mjs';

// ---- Offline guard: record and block every outbound network attempt. -------------------
const networkAttempts = [];
const block = (kind) => (...args) => {
  networkAttempts.push({ kind, target: String(args[0]?.href ?? args[0]?.host ?? args[0]).slice(0, 120) });
  throw new Error(`network blocked by harness (${kind})`);
};
globalThis.fetch = block('fetch');
http.request = block('http.request');
https.request = block('https.request');
net.connect = net.createConnection = block('net.connect');
globalThis.XMLHttpRequest = class {
  open(_method, url) {
    networkAttempts.push({ kind: 'XMLHttpRequest', target: String(url).slice(0, 120) });
  }
  send() {
    throw new Error('network blocked by harness (XMLHttpRequest)');
  }
};
globalThis.navigator ??= {};

const ADAPTERS = ['docx-editor-core', 'superdoc', 'mammoth-docx'];
const selected = process.argv.slice(2).length ? process.argv.slice(2) : ADAPTERS;
const OUT_DIR = path.resolve('.work/out');
const RESULTS_DIR = path.resolve('results');
const TIMEOUT_MS = 30_000;
const TIMING_RUNS = 5;

const withTimeout = (promise, label) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), TIMEOUT_MS))]);

async function listFixtures() {
  const names = [];
  for (const dir of ['', 'libreoffice']) {
    for (const f of (await readdir(path.join(FIXTURE_DIR, dir))).sort()) {
      if (f.endsWith('.docx')) names.push(path.join(dir, f.replace(/\.docx$/, '')));
    }
  }
  return names;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function roundTrip(adapter, name, bytes) {
  const t0 = performance.now();
  const handle = await withTimeout(adapter.open(bytes), 'open');
  const t1 = performance.now();
  const edited = adapter.appendToParagraph(handle, EDIT_TARGET, EDIT_MARKER);
  const out = await withTimeout(adapter.save(handle), 'save');
  const t2 = performance.now();
  return { out, edited, openMs: t1 - t0, saveMs: t2 - t1 };
}

async function runFixture(adapter, name) {
  const bytes = await readFile(path.join(FIXTURE_DIR, `${name}.docx`));
  const original = await inspectDocx(bytes);
  const malformed = name.startsWith('malformed');
  const row = { fixture: name };

  let trip;
  try {
    trip = await roundTrip(adapter, name, bytes);
  } catch (e) {
    row.status = malformed ? 'rejected' : 'open-or-save-failed';
    row.error = e.message.slice(0, 200);
    return row;
  }
  if (malformed) {
    // Accepting garbage is only acceptable if what comes out is still a readable DOCX.
    row.status = 'accepted-malformed';
    row.outputReadable = (await inspectDocx(trip.out)).ok;
    return row;
  }

  const outPath = path.join(OUT_DIR, adapter.id, `${name}.docx`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, trip.out);
  row.outFile = path.relative(process.cwd(), outPath);
  row.openMs = trip.openMs;
  row.saveMs = trip.saveMs;
  row.editApplied = trip.edited;

  // Reopen with the same engine: the saved file must be loadable by the app that wrote it.
  try {
    const reopened = await withTimeout(adapter.open(await readFile(outPath)), 'reopen');
    row.reopenedParagraphs = adapter.paragraphCount(reopened);
  } catch (e) {
    row.reopenError = e.message.slice(0, 200);
  }

  const output = await inspectDocx(trip.out);
  if (!original.ok || !output.ok) {
    row.status = output.ok ? 'original-unreadable' : 'output-unreadable';
    row.error = output.error ?? original.error;
    return row;
  }
  const comparison = compareFeatures(original.features, output.features, { target: EDIT_TARGET, marker: EDIT_MARKER });
  const hasTarget = original.features.paragraphTexts.includes(EDIT_TARGET);
  if (!hasTarget) delete comparison.editPersisted;
  row.lost = Object.entries(comparison)
    .filter(([key, v]) => !v.kept && key !== 'emptyParagraphs')
    .map(([key]) => key);
  row.emptyParagraphsDelta = output.features.emptyParagraphs - original.features.emptyParagraphs;
  row.diffs = Object.fromEntries(Object.entries(comparison).filter(([, v]) => !v.kept && v.expected !== undefined));
  row.status = row.reopenError ? 'reopen-failed' : row.lost.length ? 'lossy' : 'kept';
  return row;
}

async function timeLongDocument(adapter) {
  const bytes = await readFile(path.join(FIXTURE_DIR, 'long-document.docx'));
  const opens = [];
  const saves = [];
  for (let i = 0; i < TIMING_RUNS; i++) {
    const trip = await roundTrip(adapter, 'long-document', bytes);
    opens.push(trip.openMs);
    saves.push(trip.saveMs);
  }
  return { runs: TIMING_RUNS, openMsMedian: median(opens), saveMsMedian: median(saves) };
}

/** Third-party check: every output must open in LibreOffice and show the edit. */
function validateWithLibreOffice(rows, adapterId) {
  const soffice = ['soffice', 'libreoffice'].find((bin) => {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!soffice) return null;
  const files = rows.filter((r) => r.outFile).map((r) => r.outFile);
  const txtDir = path.join(OUT_DIR, adapterId, 'libreoffice-txt');
  execFileSync(soffice, ['--headless', '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', txtDir, ...files], { stdio: 'ignore', timeout: 180_000 });
  return Object.fromEntries(
    rows
      .filter((r) => r.outFile)
      .map((r) => {
        const txt = path.join(txtDir, path.basename(r.outFile).replace(/\.docx$/, '.txt'));
        if (!existsSync(txt)) return [r.fixture, 'did-not-open'];
        return [r.fixture, 'opened'];
      }),
  );
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(RESULTS_DIR, { recursive: true });
const fixtures = await listFixtures();
const report = { node: process.version, platform: `${process.platform}-${process.arch}`, adapters: {} };

for (const adapterId of selected) {
  const adapter = await import(`./adapters/${adapterId}.mjs`);
  const before = networkAttempts.length;
  const rows = [];
  for (const name of fixtures) {
    rows.push(await runFixture(adapter, name));
    process.stdout.write(`${adapterId} ${name}: ${rows.at(-1).status}\n`);
  }
  const libreoffice = validateWithLibreOffice(rows, adapterId);
  for (const row of rows) {
    if (libreoffice?.[row.fixture]) row.libreoffice = libreoffice[row.fixture];
    if (row.libreoffice === 'opened') {
      const txt = await readFile(path.join(OUT_DIR, adapterId, 'libreoffice-txt', `${path.basename(row.fixture)}.txt`), 'utf8');
      row.libreofficeSeesEdit = txt.includes(EDIT_TARGET + EDIT_MARKER);
    }
  }
  report.adapters[adapterId] = {
    label: adapter.label,
    rows,
    longDocumentTiming: await timeLongDocument(adapter),
    networkAttempts: networkAttempts.slice(before),
  };
}

await writeFile(path.join(RESULTS_DIR, 'results.json'), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.join('results', 'results.json')}; run \`node report.mjs\` for the summary table.`);
