"""Verify preserved receipts and current source bindings without service access."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys

sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
PRIOR = "gelato-auth-attestation-evidence-2026-10-22"
parser = argparse.ArgumentParser()
parser.add_argument("--source", action="store_true")
args = parser.parse_args()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_file(relative):
    path = ROOT / relative
    assert not Path(relative).is_absolute() and ".." not in Path(relative).parts
    assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(ROOT)
    return path


manifest = json.loads((EVIDENCE / "manifest.json").read_text())
assert manifest["schema"] == "lhl.controlled-pipeline-source-manifest@1"
assert manifest["supersedesSourceCoverage"] == PRIOR
assert manifest["canExecute"] is False and manifest["canInstall"] is False
entries = manifest["files"]
assert len(entries) == len({item["path"] for item in entries})
assert entries == sorted(entries, key=lambda item: item["path"])
evidence_paths = {item["path"] for item in entries if item["kind"] == "evidence"}
assert {str(EVIDENCE.relative_to(ROOT) / name) for name in [
    "README.md", "run.py", "verify.py", "required-source-paths.json", "checks.json",
    "test-verifier.py", "verifier-negative-cases.json",
]} <= evidence_paths
assert {str((EVIDENCE.parent / PRIOR / name).relative_to(ROOT)) for name in ["manifest.json", "verify.py"]} <= evidence_paths
for item in entries:
    assert item["kind"] in ["source", "evidence"]
    if item["kind"] == "source" and not args.source:
        continue
    assert sha(safe_file(item["path"]).read_bytes()) == item["sha256"], "Hash mismatch: " + item["path"]
sources = [item for item in entries if item["kind"] == "source"]
source_paths = {item["path"] for item in sources}
prior = json.loads((EVIDENCE.parent / PRIOR / "manifest.json").read_text())
assert {item["path"] for item in prior["files"] if item["kind"] == "source"} <= source_paths
required = json.loads((EVIDENCE / "required-source-paths.json").read_text())
assert len(required) == len(set(required)) and set(required) <= source_paths
assert {".github/workflows/check-gelato-local-launch.yml", ".github/workflows/check-gelato-ordinary-release.yml",
        ".github/workflows/check-production-build.yml", "back-end/src/lib/books/w2a-frozen-input.ts",
        "docs/database/migration-activate-book-config-version.sql"} <= set(required)
checks = json.loads((EVIDENCE / "checks.json").read_text())
assert checks["schema"] == "lhl.controlled-pipeline-local-checks@1"
assert checks["canExecute"] is False and checks["canInstall"] is False
assert checks["liveAcceptanceRenewed"] is False and checks["environmentKeys"] == ["HOME", "PATH"]
assert checks["sourceSnapshotSha256"] == sha(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode())
spec = importlib.util.spec_from_file_location("controlled_evidence_run", EVIDENCE / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
expected = runner.suites()
assert len(checks["suites"]) == len(expected) == 29
for result, (name, directory, command) in zip(checks["suites"], expected):
    assert result["name"] == name and result["cwd"] == directory and result["command"] == command
    assert result["exitCode"] == 0, "Failed suite: " + name
    assert result["log"] == "logs/" + name + ".txt"
    assert str(EVIDENCE.relative_to(ROOT) / result["log"]) in evidence_paths
    path = safe_file(str(EVIDENCE.relative_to(ROOT) / result["log"]))
    assert sha(path.read_bytes()) == result["logSha256"]
negative_cases = json.loads((EVIDENCE / "verifier-negative-cases.json").read_text())
assert negative_cases["schema"] == "lhl.controlled-evidence-verifier-tests@1"
assert {item["case"] for item in negative_cases["cases"]} == {
    "changed-runtime-source", "lost-prior-coverage", "failed-suite", "changed-output-log",
}
assert len(negative_cases["cases"]) == 4
assert all(item["rejected"] is True and item["exitCode"] != 0 for item in negative_cases["cases"])
# Retained proof stays historical. This call deliberately omits --source.
subprocess.run([sys.executable, str(EVIDENCE.parent / PRIOR / "verify.py")], check=True, cwd=ROOT)
print("PASS: " + str(len(expected)) + " actual local suite runs; preserved historical receipts; "
      + (str(len(sources)) + " current source bindings" if args.source else "retained local evidence")
      + "; no live acceptance or execution authority.")
