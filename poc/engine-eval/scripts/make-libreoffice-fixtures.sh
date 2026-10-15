#!/usr/bin/env bash
# Re-saves a subset of the corpus through LibreOffice Writer so the harness also sees
# OOXML written by a second producer (different style, numbering and section idioms).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
corpus="$here/../../fixtures/docx"
work="$here/.work/lo"   # under $HOME: the LibreOffice snap cannot see /tmp
soffice_bin="$(command -v soffice || command -v libreoffice)"

rm -rf "$work" && mkdir -p "$work/out" "$corpus/libreoffice"
for name in basic-formatting lists tables images layout-sections unicode; do
  cp "$corpus/$name.docx" "$work/lo-$name.docx"
done
"$soffice_bin" --headless --convert-to 'docx:MS Word 2007 XML' --outdir "$work/out" "$work"/lo-*.docx >/dev/null
cp "$work"/out/*.docx "$corpus/libreoffice/"
echo "Wrote $(ls "$corpus/libreoffice" | wc -l) LibreOffice fixtures"
