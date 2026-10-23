"""Exercise rejection paths in disposable file copies. No service or environment reads."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
RELATIVE = EVIDENCE.relative_to(ROOT)
original = json.loads((EVIDENCE / "manifest.json").read_text())
results = []
for case in ["changed-runtime-source", "lost-prior-coverage", "failed-suite", "changed-output-log"]:
    with tempfile.TemporaryDirectory(prefix="lhl-evidence-rejection-") as directory:
        copied_root = Path(directory)
        for item in original["files"]:
            target = copied_root / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / item["path"], target)
        copied = copied_root / RELATIVE
        manifest = json.loads(json.dumps(original))
        if case == "changed-runtime-source":
            path = copied_root / "back-end/src/lib/w0-manifest-builder.ts"
            path.write_text(path.read_text() + "\n// Synthetic corruption in disposable copy.\n")
            expected = "Hash mismatch: back-end/src/lib/w0-manifest-builder.ts"
        elif case == "lost-prior-coverage":
            manifest["files"] = [item for item in manifest["files"] if item["path"] != "back-end/src/lib/books/gelato-api-client.ts"]
            expected = "AssertionError"
        elif case == "failed-suite":
            path = copied / "checks.json"
            checks = json.loads(path.read_text())
            checks["suites"][0]["exitCode"] = 1
            path.write_text(json.dumps(checks))
            next(item for item in manifest["files"] if item["path"] == str(RELATIVE / "checks.json"))["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            expected = "Failed suite: test-w0-character-handoff.ts"
        else:
            path = copied / "logs/test-w1-frozen-manifest-handoff.ts.txt"
            path.write_text("Synthetic changed output\n")
            expected = "Hash mismatch: " + str(RELATIVE / "logs/test-w1-frozen-manifest-handoff.ts.txt")
        (copied / "manifest.json").write_text(json.dumps(manifest))
        result = subprocess.run([sys.executable, str(copied / "verify.py"), "--source"], cwd=copied_root,
                                capture_output=True, text=True, timeout=30, check=False)
        assert result.returncode != 0 and expected in result.stderr, (case, result.stdout, result.stderr)
        results.append({"case": case, "rejected": True, "exitCode": result.returncode})
record = {"schema": "lhl.controlled-evidence-verifier-tests@1", "cases": results,
          "scope": "Disposable copies only; repository source and retained evidence untouched"}
(EVIDENCE / "verifier-negative-cases.json").write_text(json.dumps(record, indent=2) + "\n")
print("PASS: source drift, prior coverage loss, failed suite and altered output rejected")
