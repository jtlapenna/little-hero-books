"""Reject corrupted disposable copies. Never alter repository source or retained evidence."""
from pathlib import Path
import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
RELATIVE = EVIDENCE.relative_to(ROOT)
original = json.loads((EVIDENCE / "manifest.json").read_text())
subprocess.run([sys.executable, str(EVIDENCE / "verify.py"), "--source"], cwd=ROOT, check=True)
results = []
cases = ["changed-adapter", "changed-workflow", "lost-prior-coverage", "failed-suite", "changed-output", "nonzero-live-writes", "unsafe-path"]
for case in cases:
    with tempfile.TemporaryDirectory(prefix="lhl-diagnostic-evidence-rejection-") as directory:
        copied_root = Path(directory)
        for item in original["files"]:
            target = copied_root / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / item["path"], target)
        copied = copied_root / RELATIVE
        manifest = copy.deepcopy(original)
        if case in ["changed-adapter", "changed-workflow"]:
            relative = ("back-end/scripts/helpers/gelato-protected-runner-adapter.ts" if case == "changed-adapter"
                        else ".github/workflows/check-gelato-local-launch.yml")
            path = copied_root / relative
            path.write_text(path.read_text() + "\n# Synthetic changed copy\n")
            expected = "Hash mismatch: " + relative
        elif case == "lost-prior-coverage":
            manifest["files"] = [item for item in manifest["files"] if item["path"] != "back-end/src/lib/books/gelato-api-client.ts"]
            expected = "Lost prior source coverage"
        elif case == "failed-suite":
            path = copied / "checks.json"
            checks = json.loads(path.read_text())
            checks["suites"][0]["exitCode"] = 1
            path.write_text(json.dumps(checks))
            next(item for item in manifest["files"] if item["path"] == str(RELATIVE / "checks.json"))["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            expected = "Failed suite: test-gelato-protected-runner.ts"
        elif case == "changed-output":
            path = copied / "outputs/test-gelato-protected-runner.ts.txt"
            path.write_text("Synthetic altered output\n")
            expected = "Hash mismatch: " + str(RELATIVE / "outputs/test-gelato-protected-runner.ts.txt")
        elif case == "nonzero-live-writes":
            checks_path = copied / "checks.json"
            checks = json.loads(checks_path.read_text())
            launch = next(item for item in checks["suites"] if item["name"] == "test-gelato-protected-launch.ts")
            path = copied / launch["log"]
            lines = path.read_text().splitlines()
            summary = json.loads(lines[-1])
            summary["liveOrderWrites"] = 1
            lines[-1] = json.dumps(summary)
            path.write_text("\n".join(lines) + "\n")
            launch["summary"] = summary
            launch["logSha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            checks_path.write_text(json.dumps(checks))
            for changed in [path, checks_path]:
                next(item for item in manifest["files"] if item["path"] == str(changed.relative_to(copied_root)))["sha256"] = hashlib.sha256(changed.read_bytes()).hexdigest()
            expected = "Unexpected live effect"
        else:
            manifest["files"].append({"path": "/etc/passwd", "kind": "source", "sha256": "0" * 64})
            manifest["files"].sort(key=lambda item: item["path"])
            expected = "Unsafe path"
        (copied / "manifest.json").write_text(json.dumps(manifest))
        result = subprocess.run([sys.executable, str(copied / "verify.py"), "--source"], cwd=copied_root,
                                capture_output=True, text=True, timeout=30, check=False)
        assert result.returncode != 0 and expected in result.stderr, (case, result.stdout, result.stderr)
        results.append({"case": case, "rejected": True})
print(json.dumps({"checks": len(results), "cases": results, "externalRequests": 0,
                  "scope": "Disposable copies only; source and retained evidence unchanged"}))
