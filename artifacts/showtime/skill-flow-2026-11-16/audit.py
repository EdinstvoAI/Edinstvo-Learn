import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / "showtime/scripts"))
from render_quality import audit_delivery, audit_tap_rings

output = Path(sys.argv[1] if len(sys.argv) > 1 else "skill-flow.mp4")
render = json.loads(Path(sys.argv[2] if len(sys.argv) > 2 else "composed.render.json").read_text())
report = audit_delivery(output)
report = audit_tap_rings(output, {
    **render["tap"],
    "frames": report["decoded_frame_count"],
    "events": render["events"],
}, report)
report_path = Path(sys.argv[3] if len(sys.argv) > 3 else "render-quality.json")
report_path.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"passed": report["passed"], "failures": report["failures"]}))
raise SystemExit(0 if report["passed"] else 1)
