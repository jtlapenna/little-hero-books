"""Capture local synthetic checks. Does not install, deploy, or load service credentials."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
SCRIPTS = [
    "test-w0-character-handoff.ts",
    "test-w0-build-readonly.ts",
    "test-w0-publication-worker.ts",
    "test-w0-manifest-freeze.ts",
    "test-w0-legacy-rollout.ts",
    "test-w0-deployed-selection.ts",
    "test-w1-frozen-manifest-handoff.ts",
    "test-w2a-base-input.ts",
    "test-w2a-pose-input.ts",
    "test-w2a-frozen-generation-input.ts"
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_snapshot():
    manifest = json.loads((EVIDENCE / "manifest.json").read_text())
    sources = [item for item in manifest["files"] if item["kind"] == "source"]
    for item in sources:
        path = ROOT / item["path"]
        assert path.is_file() and not path.is_symlink()
        assert path.resolve().is_relative_to(ROOT)
        assert sha(path.read_bytes()) == item["sha256"], "Source changed: " + item["path"]
    return sha(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode())


def suites():
    return [(name, "back-end", ["node", "--import", "tsx", "scripts/" + name]) for name in SCRIPTS]


def main():
    snapshot = source_snapshot()
    environment = {"HOME": os.environ["HOME"], "PATH": os.environ["PATH"]}
    results = []
    for name, directory, command in suites():
        completed = subprocess.run(command, cwd=ROOT / directory, env=environment,
                                   capture_output=True, timeout=180, check=False)
        log = completed.stdout + completed.stderr
        relative = "logs/" + name + ".txt"
        path = EVIDENCE / relative
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(log)
        results.append({"name": name, "cwd": directory, "command": command,
                        "exitCode": completed.returncode, "log": relative, "logSha256": sha(log)})
        print(name + ": " + str(completed.returncode), flush=True)
    assert snapshot == source_snapshot(), "Source changed during evidence capture"
    result = {"schema": "lhl.controlled-character-handoff-local-checks@1", "sourceSnapshotSha256": snapshot,
              "environmentKeys": sorted(environment), "canExecute": False, "canInstall": False,
              "scope": "Synthetic services, VM fixtures and isolated Workers only",
              "liveAcceptanceRenewed": False, "suites": results}
    (EVIDENCE / "checks.json").write_text(json.dumps(result, indent=2) + "\n")
    return 0 if all(item["exitCode"] == 0 for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
