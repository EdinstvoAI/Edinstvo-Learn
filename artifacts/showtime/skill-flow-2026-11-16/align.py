import json
from pathlib import Path

journal = json.loads(Path("raw-actions.json").read_text())
for event, response in zip(journal["events"], (7.0667, 8.0167), strict=True):
    event["original_dispatch_start"] = event["source_start"]
    event["original_dispatch_end"] = event["source_end"]
    event["source_start"] = response - 0.06
    event["source_end"] = response
    event["alignment"] = "Estimated contact using the first observed button response; raw AXe dispatch retained separately"
Path("aligned-actions.json").write_text(json.dumps(journal, indent=2) + "\n")
