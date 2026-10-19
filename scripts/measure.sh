#!/usr/bin/env bash
# Measures PageLite startup and file-open time with a repeatable procedure (docs/TESTING.md).
#
#   scripts/measure.sh [--cold] [runs] [binary]   defaults: 10 runs, build/release/native/pagelite
#
# Each run launches the app with PAGELITE_MEASURE=1. The app reports when the editor and the
# opened document have been painted, then quits by itself. Times are from just before launch
# (so they include loading the binary and libraries) to that painted frame.
# --cold drops the page cache before every launch (asks for sudo once; the app itself still
# runs as you). Without it, runs are "warm".
# Don't touch the windows while it runs: a keystroke makes the empty editor "modified", and the
# app then (correctly) asks before opening the file, so that run never finishes and is counted
# as failed.
set -euo pipefail
cd "$(dirname "$0")/.."

cold=false
if [[ "${1:-}" == "--cold" ]]; then
  cold=true
  shift
  sudo -v
fi
runs="${1:-10}"
bin="${2:-build/release/native/pagelite}"
[[ -x "$bin" ]] || { echo "No binary at $bin. Build it: cmake --preset release && cmake --build --preset release" >&2; exit 1; }
[[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] || { echo "Needs a graphical session." >&2; exit 1; }

now_ms() { date +%s%3N; }

# Prints the launch-to-phase time in ms for one run.
measure_once() {
  local phase="$1" file="${2:-}" start line
  $cold && sudo sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'
  start=$(now_ms)
  line=$(PAGELITE_MEASURE=1 timeout 60 "$bin" ${file:+"$file"} 2>&1 >/dev/null | grep -m1 "\"phase\":\"$phase\"" || true)
  [[ -n "$line" ]] || return 1
  echo $(($(sed -E 's/.*"unixMs":([0-9]+).*/\1/' <<<"$line") - start))
}

# Prints "median p90 min max" of the numbers on stdin.
stats() {
  sort -n | awk '{ v[NR] = $1 } END {
    p90 = int(NR * 0.9 + 0.999); if (p90 > NR) p90 = NR
    median = NR % 2 ? v[(NR + 1) / 2] : (v[NR / 2] + v[NR / 2 + 1]) / 2
    printf "%d %d %d %d\n", median, v[p90], v[1], v[NR] }'
}

row() {
  local label="$1" phase="$2" file="${3:-}" times=() failed=0 t
  measure_once "$phase" "$file" >/dev/null || true # one discarded warm-up launch
  for _ in $(seq "$runs"); do
    if t=$(measure_once "$phase" "$file"); then times+=("$t"); else failed=$((failed + 1)); fi
  done
  [[ ${#times[@]} -gt 0 ]] || { printf '| %s | – | – | – | – | %s |\n' "$label" "$failed"; return; }
  read -r median p90 min max < <(printf '%s\n' "${times[@]}" | stats)
  printf '| %s | %s | %s | %s | %s | %s |\n' "$label" "$median" "$p90" "$min" "$max" "$failed"
}

cpu=$(lscpu | sed -nE 's/^Model name:\s+//p' | head -1)
ram=$(free -g | awk '/^Mem:/ { print $2 " GB" }')
os=$(. /etc/os-release && echo "$PRETTY_NAME")
echo "PageLite $(git describe --always --dirty 2>/dev/null || echo '?'), $(basename "$(dirname "$(dirname "$bin")")") build, $(du -h "$bin" | cut -f1) binary"
echo "$cpu, $ram RAM; $os, kernel $(uname -r); ${XDG_SESSION_TYPE:-unknown session}"
echo "GTK $(pkg-config --modversion gtk+-3.0), WebKitGTK $(pkg-config --modversion webkit2gtk-4.1)"
echo "$runs runs each after one warm-up launch, $($cold && echo 'cold (page cache dropped)' || echo 'warm page cache')"
echo
echo '| Launch to painted frame (ms) | Median | p90 | Min | Max | Failed runs |'
echo '| --- | --- | --- | --- | --- | --- |'
row 'Empty editor' ui-ready
row 'Small document (basic-formatting.docx, 10 KB)' document-opened fixtures/docx/basic-formatting.docx
row 'Long document (long-document.docx, 2,000 paragraphs)' document-opened fixtures/docx/long-document.docx
