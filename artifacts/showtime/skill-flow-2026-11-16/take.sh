#!/bin/bash
set -euo pipefail
showtime="$HOME/showtime"
py="$showtime/.venv/bin/python"
simulator=70B169BC-1696-4395-B23A-02AA6E8ACDA7
take="$1"
stage=(--preparation-preview)
if [[ "$take" == raw ]]; then stage=(--prepared-content prepared-content.json); fi

node fixture.mjs лиза &
fixture=$!
"$py" "$showtime/scripts/record_simulator.py" "${stage[@]}" --simulator "$simulator" --output "$take.mp4" --scenario scenario.json --approval-dir approvals --tail-sentinel &
recorder=$!
trap 'kill -INT "$recorder" 2>/dev/null || true; kill "$fixture" 2>/dev/null || true' EXIT
for i in {1..80}; do
  if /usr/bin/plutil -extract ready_ms raw "$take.clock.json" >/dev/null 2>&1; then break; fi
  sleep .2
done
sleep 1
action() {
  "$py" "$showtime/scripts/native_action.py" --axe "$PWD/tools/axe" --clock "$take.clock.json" --journal "$take-actions.json" --id "$1" --type tap --viewport 402 874 --point 200 "$2" --step "tap -x 200 -y $2"
}
action answer 438
sleep 1
action submit 580
sleep 20
kill -INT "$recorder"
wait "$recorder"
