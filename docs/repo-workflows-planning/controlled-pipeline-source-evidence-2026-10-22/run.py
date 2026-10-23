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
    "test-gelato-credential-auth.ts",
    "test-gelato-runtime-key-proof.ts",
    "test-gelato-protected-runner.ts",
    "test-gelato-protected-runner-crashes.ts",
    "test-gelato-protected-launch.ts",
    "test-gelato-local-window.ts",
    "test-gelato-incident-safeguards.ts",
    "test-gelato-submission-runtime.ts",
    "test-access-boundary.ts",
    "test-gelato-ordinary-release.ts",
    "test-gelato-ordinary-router.ts",
    "test-gelato-native-queue.ts",
    "test-w0-deployed-selection.ts",
    "test-w0-manifest-freeze.ts",
    "test-w0-legacy-rollout.ts",
    "test-w1-frozen-manifest-handoff.ts",
    "test-w2a-base-input.ts",
    "test-w2a-pose-input.ts",
    "test-w2a-frozen-generation-input.ts",
    "test-w2-workflow-contracts.ts",
    "test-publish-book-config-immutability.ts",
    "test-checkout-validation.ts",
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
    result = [(name, "back-end", ["node", "--import", "tsx", "scripts/" + name]) for name in SCRIPTS]
    for folder in ["gelato-draft-approval-evidence-2026-10-22", "gelato-auth-attestation-evidence-2026-10-22"]:
        result.append((folder + "-probes", ".", ["node", "docs/repo-workflows-planning/" + folder + "/test-probes.mjs"]))
    for folder in ["gelato-local-launch-evidence-2026-10-21", "gelato-incident-safeguards-evidence-2026-10-21", "gelato-draft-approval-evidence-2026-10-22", "gelato-auth-attestation-evidence-2026-10-22"]:
        result.append((folder + "-historical", ".", ["python3", "docs/repo-workflows-planning/" + folder + "/verify.py"]))
    result.append(("activation-migration", "back-end", ["bash", "scripts/test-book-config-activation-migration.sh"]))
    return result


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
    result = {"schema": "lhl.controlled-pipeline-local-checks@1", "sourceSnapshotSha256": snapshot,
              "environmentKeys": sorted(environment), "canExecute": False, "canInstall": False,
              "scope": "Synthetic services, VM fixtures, loopback workers, and disposable local PostgreSQL only",
              "liveAcceptanceRenewed": False, "suites": results}
    (EVIDENCE / "checks.json").write_text(json.dumps(result, indent=2) + "\n")
    return 0 if all(item["exitCode"] == 0 for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
