#!/usr/bin/env bash
# Installs the .deb on a clean Ubuntu 24.04 container and checks that it works there:
# dependencies resolve from the archive, nothing is missing at runtime, the desktop entry
# and metadata validate, the app opens a document under a virtual display, and removing the
# package leaves no files behind.
#
#   packaging/test-deb.sh [path/to/pagelite_*.deb]    needs Docker; downloads ~300 MB once
set -euo pipefail
# A package path given as an argument is relative to where the script was run from.
deb_arg="${1:+$(realpath -- "$1")}"
cd "$(dirname "$0")/.."

deb="${deb_arg:-$(ls "$PWD"/build/package/dist/pagelite_*_amd64.deb 2>/dev/null | head -1)}"
[[ -f "$deb" ]] || { echo "No package. Build it: cmake --preset package && cmake --build --preset package && cpack --preset deb" >&2; exit 1; }
image=ubuntu:24.04

echo "Testing $deb on a clean $image"
docker run --rm -i \
  -v "$deb:/tmp/pagelite.deb:ro" \
  -v "$PWD/fixtures/docx:/tmp/fixtures:ro" \
  "$image" bash -euo pipefail -s <<'EOF'
export DEBIAN_FRONTEND=noninteractive
step() { printf '\n== %s\n' "$*"; }

step "Install the package; apt must resolve every dependency from the archive"
apt-get update -qq
apt-get install -y -qq --no-install-recommends /tmp/pagelite.deb >/dev/null
dpkg -s pagelite | grep -E '^(Status|Version):'

step "No library is missing at runtime"
if ldd /usr/bin/pagelite | grep 'not found'; then exit 1; fi
echo "all $(ldd /usr/bin/pagelite | wc -l) libraries resolve"

step "Desktop entry, metadata and icon"
apt-get install -y -qq --no-install-recommends desktop-file-utils appstream xvfb xauth >/dev/null
desktop-file-validate /usr/share/applications/io.github.sxhumr.PageLite.desktop
appstreamcli validate --no-net /usr/share/metainfo/io.github.sxhumr.PageLite.metainfo.xml | tail -1
grep -q 'io.github.sxhumr.PageLite.desktop' /usr/share/applications/mimeinfo.cache
echo ".docx is registered in the desktop MIME cache"
test -s /usr/share/icons/hicolor/scalable/apps/io.github.sxhumr.PageLite.svg
test -s /usr/share/doc/pagelite/THIRD_PARTY_NOTICES.md && test -s /usr/share/doc/pagelite/copyright
echo "icon, copyright and notices installed"

step "The installed app opens a document"
# Containers cannot create WebKit's bubblewrap sandbox; this switch exists for exactly
# this case and is used only inside the test container.
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
out=$(PAGELITE_MEASURE=1 timeout 90 xvfb-run -a pagelite /tmp/fixtures/basic-formatting.docx 2>&1 || true)
grep '"phase"' <<<"$out" || { echo "$out" | tail -20; exit 1; }
grep -q '"phase":"document-opened"' <<<"$out"

step "Removal leaves nothing behind"
apt-get remove -y -qq pagelite >/dev/null
left=$(ls /usr/bin/pagelite /usr/share/applications/io.github.sxhumr.PageLite.desktop \
  /usr/share/icons/hicolor/scalable/apps/io.github.sxhumr.PageLite.svg /usr/share/doc/pagelite 2>/dev/null || true)
[[ -z "$left" ]] || { echo "left behind: $left"; exit 1; }
if grep -q 'io.github.sxhumr.PageLite' /usr/share/applications/mimeinfo.cache; then echo "MIME cache still lists PageLite"; exit 1; fi
echo "binary, desktop entry, icon, docs and MIME registration removed"

printf '\nPASS\n'
EOF
