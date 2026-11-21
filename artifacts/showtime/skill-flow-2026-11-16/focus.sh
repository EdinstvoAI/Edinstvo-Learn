#!/bin/bash
set -euo pipefail

# Keep the camera still through the answer and ease into a smaller focus.
in_t="clip((on-${3:-350})/144,0,1)"
out_t="clip((on-${4:-1200})/132,0,1)"
curve() { printf '(%s*%s*%s*(10+%s*(-15+6*%s)))' "$1" "$1" "$1" "$1" "$1"; }
zoom="1+.34*($(curve "$in_t")-$(curve "$out_t"))"
input="${1:-composed.mp4}"
output="${2:-skill-flow.mp4}"
duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$input")"
fade_at="$(awk -v duration="$duration" 'BEGIN { printf "%.6f", duration - 0.4 }')"
ffmpeg -hide_banner -loglevel error -n -i "$input" \
  -filter_complex_threads 2 \
  -filter_complex "[0:v]split=2[base][head];[base]scale=2880:2880,zoompan=z='$zoom':x='iw/2-iw/zoom/2':y='clip(ih*.55-ih/zoom/2,0,ih-ih/zoom)':d=1:s=1920x1920:fps=60,setsar=1[focus];[head]trim=duration=0.4,settb=1/60,setpts=PTS-STARTPTS[loop];[focus][loop]xfade=transition=fade:duration=0.4:offset=$fade_at,format=yuv420p[out]" \
  -map '[out]' -an -c:v libx264 -threads 5 -preset veryfast -crf 18 -movflags +faststart "$output"
