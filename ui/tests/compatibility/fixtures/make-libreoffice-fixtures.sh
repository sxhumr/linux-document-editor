#!/usr/bin/env bash
# Re-saves a subset of the corpus through LibreOffice Writer so the suite also sees OOXML
# written by a second producer (different style, numbering and section idioms).
# Run after make-fixtures.ts: `npm run fixtures`.
set -euo pipefail
ui="$(cd "$(dirname "$0")/../../.." && pwd)"
corpus="$ui/../fixtures/docx"
work="$ui/node_modules/.cache/pagelite-lo" # under $HOME: the LibreOffice snap cannot see /tmp
soffice_bin="$(command -v soffice || command -v libreoffice || true)"
if [[ -z "$soffice_bin" ]]; then
  echo "LibreOffice not found; keeping the committed fixtures/docx/libreoffice/ files." >&2
  exit 0
fi

rm -rf "$work" "$corpus/libreoffice" && mkdir -p "$work/out" "$corpus/libreoffice"
for name in basic-formatting lists tables images layout-sections unicode \
  hyperlinks footnotes-endnotes comments tracked-changes fields-toc custom-styles nested-tables rtl-mixed; do
  cp "$corpus/$name.docx" "$work/lo-$name.docx"
done
"$soffice_bin" --headless --convert-to 'docx:MS Word 2007 XML' --outdir "$work/out" "$work"/lo-*.docx >/dev/null
cp "$work"/out/*.docx "$corpus/libreoffice/"
echo "Wrote $(ls "$corpus/libreoffice" | wc -l) LibreOffice fixtures"
