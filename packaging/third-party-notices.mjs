// Writes THIRD_PARTY_NOTICES.md for the installed package: the licence of every piece of
// third-party code compiled or embedded into the pagelite binary.
//
//   node third-party-notices.mjs <ui dir> <webview LICENSE> <output file>
//
// Covers the UI's production npm dependencies (from package-lock.json; a superset of what
// the bundle actually reaches), the notices the engine ships for code it vendors, and the
// webview/webview header. GTK and WebKitGTK are linked dynamically from the system and are
// not redistributed. Fails on any licence outside ALLOWED, so a new dependency is reviewed
// before it ships.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set(['MIT', 'ISC', 'Apache-2.0', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Zlib']);
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i; // NOTICE: Apache-2.0 §4(d)
const VENDORED_NOTICES = 'THIRD_PARTY_NOTICES.md';

const [uiDir, webviewLicense, outFile] = process.argv.slice(2);
if (!outFile) {
  console.error('usage: node third-party-notices.mjs <ui dir> <webview LICENSE> <output file>');
  process.exit(2);
}

/** The SPDX ids in a licence expression such as "(MIT AND Zlib)". */
const spdxIds = (expression) => expression.replace(/[()]/g, ' ').split(/\s+(?:AND|OR)\s+|\s+/).filter(Boolean);

const authorOf = (pkg) => (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name) ?? `the ${pkg.name} authors`;

/** MIT requires its notice to travel with the code; used when a package ships no licence file. */
const mitText = (holder) => `Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const fence = (text) => '```\n' + text.trim() + '\n```';

const lock = JSON.parse(readFileSync(path.join(uiDir, 'package-lock.json'), 'utf8'));
const entries = [];
const refused = [];

for (const [where, meta] of Object.entries(lock.packages)) {
  if (!where || meta.dev || meta.devOptional) continue; // the root project, or build-time only
  const dir = path.join(uiDir, where);
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'UNKNOWN');
  const unknown = spdxIds(license).filter((id) => !ALLOWED.has(id));
  if (unknown.length) refused.push(`${pkg.name}@${pkg.version}: ${license}`);

  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
  const sections = files.map((f) => fence(readFileSync(path.join(dir, f), 'utf8')));
  if (sections.length === 0) {
    if (license !== 'MIT') refused.push(`${pkg.name}@${pkg.version}: ${license} with no licence file`);
    sections.push(`The package ships no licence file; it declares MIT in package.json. Standard MIT text:\n\n${fence(mitText(authorOf(pkg)))}`);
  }
  // Code a package copied into its own bundle, with the licences it ships for it.
  if (existsSync(path.join(dir, VENDORED_NOTICES))) {
    sections.push(`#### Code bundled inside ${pkg.name}\n\n${readFileSync(path.join(dir, VENDORED_NOTICES), 'utf8').replace(/^#+ /gm, '##### ')}`);
  }
  if (existsSync(path.join(dir, 'licenses'))) {
    for (const f of readdirSync(path.join(dir, 'licenses')).sort()) {
      sections.push(`#### ${pkg.name}: licenses/${f}\n\n${fence(readFileSync(path.join(dir, 'licenses', f), 'utf8'))}`);
    }
  }
  entries.push({ name: pkg.name, version: pkg.version, license, url: pkg.homepage ?? '', sections });
}

entries.push({
  name: 'webview/webview',
  version: '0.12.0',
  license: 'MIT',
  url: 'https://github.com/webview/webview',
  sections: [fence(readFileSync(webviewLicense, 'utf8'))],
});

if (refused.length) {
  console.error(`Licences not on the allowlist; review before shipping:\n  ${refused.join('\n  ')}`);
  process.exit(1);
}

entries.sort((a, b) => a.name.localeCompare(b.name));
const out = [
  '# Third-party notices',
  '',
  'PageLite is licensed under Apache-2.0 (see `/usr/share/doc/pagelite/copyright`). The `pagelite` binary embeds the third-party code listed here, each under its own licence, reproduced below. GTK, WebKitGTK and their dependencies are system libraries installed separately by the package manager.',
  '',
  '| Component | Version | Licence |',
  '| --- | --- | --- |',
  ...entries.map((e) => `| ${e.name} | ${e.version} | ${e.license} |`),
  '',
  ...entries.flatMap((e) => ['---', '', `## ${e.name} ${e.version}`, '', `Licence: ${e.license}${e.url ? ` (${e.url})` : ''}`, '', ...e.sections.flatMap((s) => [s, ''])]),
].join('\n');
writeFileSync(outFile, out);
console.log(`Wrote notices for ${entries.length} components to ${outFile}`);
