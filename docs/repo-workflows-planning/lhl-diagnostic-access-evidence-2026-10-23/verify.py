"""Offline integrity checks. No credentials, service calls, or execution authority."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
PRIOR = "controlled-character-handoff-evidence-2026-10-22"
SUITES = [
    ("test-gelato-protected-runner.ts", 75),
    ("test-gelato-protected-launch.ts", 16),
    ("test-gelato-protected-runner-crashes.ts", 7),
    ("test-gelato-credential-auth.ts", 12),
    ("test-gelato-runtime-key-proof.ts", 98),
]
REQUIRED = {
    ".github/workflows/check-gelato-local-launch.yml",
    ".github/workflows/check-gelato-ordinary-release.yml",
    "back-end/scripts/helpers/gelato-protected-runner-adapter.ts",
    "back-end/scripts/helpers/gelato-protected-launch-context.ts",
    "back-end/scripts/helpers/gelato-protected-launcher.ts",
    "back-end/scripts/helpers/gelato-protected-runner-fixture.ts",
    *("back-end/scripts/" + name for name, _ in SUITES),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_file(root, relative):
    assert isinstance(relative, str) and relative and not Path(relative).is_absolute() and ".." not in Path(relative).parts, "Unsafe path"
    path = root / relative
    assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root), "Unsafe file"
    return path


def verify(root=ROOT, evidence=EVIDENCE, source=False):
    relative = evidence.relative_to(root)
    manifest = json.loads((evidence / "manifest.json").read_text())
    assert manifest["schema"] == "lhl.diagnostic-access-source-manifest@1"
    assert manifest["supersedesSourceCoverage"] == PRIOR
    assert manifest["canExecute"] is False and manifest["canInstall"] is False
    entries = manifest["files"]
    assert len(entries) == len({item["path"] for item in entries}), "Duplicate entry"
    assert entries == sorted(entries, key=lambda item: item["path"])
    # Validate every path even when historical source hashes are not asserted.
    for item in entries:
        assert item["kind"] in ["source", "evidence"]
        relative_path = item["path"]
        assert isinstance(relative_path, str) and relative_path and not Path(relative_path).is_absolute() and ".." not in Path(relative_path).parts, "Unsafe path"
        if item["kind"] == "evidence" or source:
            path = safe_file(root, relative_path)
            assert sha(path.read_bytes()) == item["sha256"], "Hash mismatch: " + relative_path
    evidence_paths = {item["path"] for item in entries if item["kind"] == "evidence"}
    assert {str(relative / name) for name in ["README.md", "run.py", "verify.py", "test-verifier.py",
            "required-source-paths.json", "checks.json"]} <= evidence_paths
    prior_dir = evidence.parent / PRIOR
    assert {str((prior_dir / name).relative_to(root)) for name in ["manifest.json", "verify.py"]} <= evidence_paths
    sources = [item for item in entries if item["kind"] == "source"]
    source_paths = {item["path"] for item in sources}
    prior = json.loads((prior_dir / "manifest.json").read_text())
    assert {item["path"] for item in prior["files"] if item["kind"] == "source"} <= source_paths, "Lost prior source coverage"
    required = json.loads((evidence / "required-source-paths.json").read_text())
    assert len(required) == len(set(required)) and REQUIRED <= set(required) <= source_paths, "Missing required source"
    checks = json.loads((evidence / "checks.json").read_text())
    assert checks["schema"] == "lhl.diagnostic-access-local-checks@1"
    assert checks["canExecute"] is False and checks["canInstall"] is False and checks["liveAcceptanceRenewed"] is False
    assert checks["environmentKeys"] == ["NODE_ENV", "PATH"]
    assert checks["sourceSnapshotSha256"] == sha(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode())
    assert len(checks["suites"]) == len(SUITES)
    for result, (name, count) in zip(checks["suites"], SUITES):
        assert result["name"] == name and result["cwd"] == "back-end"
        assert result["command"] == ["node", "--import", "tsx", "scripts/" + name]
        assert result["exitCode"] == 0, "Failed suite: " + name
        log = "outputs/" + name + ".txt"
        assert result["log"] == log and str(relative / log) in evidence_paths
        data = safe_file(root, str(relative / log)).read_bytes()
        assert sha(data) == result["logSha256"], "Changed suite output"
        summary = json.loads(data.decode().strip().splitlines()[-1])
        assert summary == result["summary"] and summary["checks"] == count
        assert summary["externalRequests"] == 0
        for field in ["providerCalls", "productionOrderReads", "orderReads", "liveOrderReads", "liveOrderWrites", "hostedCalls", "deployments", "customerMessages", "credentialFilesRead"]:
            if field in summary:
                assert summary[field] == 0, "Unexpected live effect"
    # Preserve the complete retained chain; never apply historical hashes to current source.
    subprocess.run([sys.executable, str(prior_dir / "verify.py")], check=True, cwd=root)
    return len(sources)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", action="store_true")
    args = parser.parse_args()
    count = verify(source=args.source)
    print("PASS: five actual synthetic suites; preserved historical evidence; " +
          (str(count) + " current source bindings" if args.source else "retained local evidence") +
          "; no live acceptance, credentials or execution authority.")
