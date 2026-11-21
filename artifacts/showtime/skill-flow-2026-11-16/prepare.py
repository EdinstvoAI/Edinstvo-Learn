import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / "showtime/scripts"))
from review_gate import file_sha256, load_manifest, story_materials_sha256

def file(path):
    return {"path": path, "sha256": file_sha256(path)}

scenario = load_manifest("scenario.json")
plan = scenario["manifest"]["content"]["scene_plan"]
roles = ("context", "entry", "action", "correction", "result")
frames = {role: file(f"frames/{role}.png") for role in roles}
profile, geometry, motion = map(file, ("profile.json", "stage/geometry.json", "rehearsal2.mp4"))

def ready(note, *evidence):
    return {"status": "ready", "note": note, "evidence": list(evidence)}

def absent(note):
    return {"status": "not_applicable", "note": note, "evidence": []}

manifest = {
    "schema_version": 2,
    "kind": "prepared-content",
    "scenario_id": scenario["manifest"]["scenario_id"],
    "scenario_sha256": scenario["manifest_sha256"],
    "content": {
        "language": "ru",
        "scene_content": {**plan, "setting": "Local Edinstvo Learn in a WKWebView on iPhone 17 Pro, full simulator capture"},
        "storyboard": [{"id": role, "role": role, "file": item["path"], "description": role}
                       for role, item in frames.items()],
        "preparation": {
            "profile": profile,
            "viewport": {"width": 402, "height": 874},
            "visible_height": 874,
            "keyboard_visible": False,
            "typing_visible": False,
            "framing": [{"layout": "full", "device_id": "iphone-17-pro-silver", "geometry": geometry}],
            "checks": {
                "full_height": ready("Full native viewport through the transition", motion),
                "visible_controls": ready("Answer and submit visible within the phone", frames["entry"]),
                "no_editorial_text": ready("Only the app UI and simulator status bar", *frames.values()),
                "keyboard_suggestions": absent("No keyboard shown"),
                "character_typing": absent("No text entered in the capture"),
            },
        },
    },
    "files": [*frames.values(), profile, geometry, motion],
}
if Path("frame-review.json").is_file():
    review = json.loads(Path("frame-review.json").read_text())
    review["materials_sha256"] = story_materials_sha256(manifest)
    manifest["content"]["story_review"] = review
Path("prepared-content.json").write_text(json.dumps(manifest, indent=2) + "\n")
