#!/usr/bin/env bash
# Captures the README screenshots and demo animation from the real, installed app.
#
#   scripts/capture-media.sh [path/to/pagelite_*.deb]    needs Docker
#
# Installs the package on a clean Ubuntu 24.04 container with a virtual display, opens
# docs/media/demo.docx, drives the app with xdotool and writes docs/media/*.png and demo.gif.
# Reproducible: the same package and document always give the same pictures.
set -euo pipefail
# A package path given as an argument is relative to where the script was run from.
deb_arg="${1:+$(realpath -- "$1")}"
cd "$(dirname "$0")/.."

deb="${deb_arg:-$(ls "$PWD"/build/package/dist/pagelite_*_amd64.deb 2>/dev/null | head -1)}"
[[ -f "$deb" ]] || { echo "No package. Build it: cmake --preset package && cmake --build --preset package && cpack --preset deb" >&2; exit 1; }
[[ -f docs/media/demo.docx ]] || { echo "No demo document. Run: (cd ui && npm run demo-document)" >&2; exit 1; }

docker run --rm -i \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$deb:/tmp/pagelite.deb:ro" \
  -v "$PWD/docs/media:/media" \
  ubuntu:24.04 bash -euo pipefail -s <<'EOF'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends /tmp/pagelite.deb \
  xvfb xdotool imagemagick ffmpeg fonts-liberation fonts-noto-core fonts-dejavu-core \
  adwaita-icon-theme >/dev/null

# 2x scale like a HiDPI laptop: crisp images, and 0.5 pt table borders (under one pixel at
# 1x) are drawn instead of rounding away.
export DISPLAY=:99 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 NO_AT_BRIDGE=1 GDK_SCALE=2
W=2560 H=1640
Xvfb :99 -screen 0 ${W}x${H}x24 -dpi 192 -nolisten tcp &
sleep 1

cp /media/demo.docx /tmp/demo.docx
pagelite /tmp/demo.docx 2>/dev/null &
win=""
for _ in $(seq 60); do win=$(xdotool search --onlyvisible --class io.github.sxhumr.PageLite 2>/dev/null | head -1 || true); [[ -n "$win" ]] && break; sleep 0.5; done
[[ -n "$win" ]] || { echo "window never appeared"; exit 1; }
xdotool windowmove "$win" 0 0 windowsize "$win" $W $H
sleep 6 # engine load, fonts and first layout

shot() { import -window root -strip "/media/$1.png"; echo "captured $1.png"; }
key() { xdotool key --clearmodifiers "$@"; sleep 1; }
click() { xdotool mousemove "$1" "$2" click 1; sleep 0.8; }
type_slowly() { xdotool type --delay 70 "$1"; sleep 0.6; }
park_mouse() { xdotool mousemove $((W - 4)) $((H - 4)); }

# Everything is driven by keyboard, with the app's own Find to place the caret: search, then
# Escape leaves the match selected in the document. Nothing depends on layout or scrolling.
goto_text() { # select the first match of $1 in the document
  key ctrl+f
  xdotool type --delay 40 "$1"
  sleep 1.2
  key Escape
}

scroll_to_top() { xdotool mousemove 120 $((H / 2)) click --repeat 15 --delay 30 4; sleep 0.8; park_mouse; }

click 120 $((H / 2)) # focus the window from the grey margin (the page centre is a table border)
goto_text "working"
key Right # caret just after "working": the toolbar shows its italic formatting
scroll_to_top
shot hero

key shift+ctrl+Left # select "working"
scroll_to_top
key alt+o
shot format-menu
key Escape Escape

# Typed at human speed: selecting a match must not pull focus into the page, or "ed" would
# overwrite the document (the regression test for keepingFocus, in a real WebKit).
key ctrl+f
xdotool type --delay 250 "bed"
sleep 1
key Return
shot find
key Escape

key F1
shot shortcuts
key Escape
key ctrl+Home
sleep 1

# ---- demo: add a list item, make two words bold, find, save ------------------------------
ffmpeg -nostdin -loglevel error -y -f x11grab -video_size ${W}x${H} -framerate 15 -i :99 \
  -c:v libx264 -preset ultrafast -crf 18 /tmp/demo.mp4 </dev/null &
rec=$!
sleep 1.5
goto_text "food bank."
key End Return
type_slowly "Plant a pollinator strip along the fence."
key Home ctrl+Right ctrl+Right
key shift+ctrl+Right shift+ctrl+Right
key ctrl+b
key End
sleep 0.8
key ctrl+f
xdotool type --delay 250 "harvest"
sleep 0.6
key Return
key Return
sleep 0.8
key Escape
key ctrl+s
sleep 2.5
kill -INT $rec
wait $rec || true

ffmpeg -nostdin -loglevel error -y -i /tmp/demo.mp4 -vf \
  "fps=10,scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  /media/demo.gif
echo "captured demo.gif"

chown "$HOST_UID:$HOST_GID" /media/*.png /media/*.gif
EOF
