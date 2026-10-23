"""Reproduce synthetic checks and create a new local evidence snapshot, never live acceptance."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

sys.dont_write_bytecode = True
EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
spec = importlib.util.spec_from_file_location("diagnostic_access_verify", EVIDENCE / "verify.py")
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def source_entries():
    prior = json.loads((EVIDENCE.parent / verifier.PRIOR / "manifest.json").read_text())
    paths = {item["path"] for item in prior["files"] if item["kind"] == "source"} | verifier.REQUIRED
    return [{"path": path, "kind": "source", "sha256": verifier.sha(verifier.safe_file(ROOT, path).read_bytes())}
            for path in sorted(paths)]


def main():
    sources = source_entries()
    (EVIDENCE / "outputs").mkdir(exist_ok=True)
    results = []
    for name, count in verifier.SUITES:
        command = ["node", "--import", "tsx", "scripts/" + name]
        result = subprocess.run(command, cwd=ROOT / "back-end",
                                env={"PATH": os.environ["PATH"], "NODE_ENV": "test"},
                                capture_output=True, text=True, timeout=240, check=False)
        output = result.stdout + result.stderr
        log = "outputs/" + name + ".txt"
        (EVIDENCE / log).write_text(output)
        assert result.returncode == 0, "Failed suite: " + name
        # Successful runners emit a final machine-readable receipt.
        summary = json.loads(output.strip().splitlines()[-1])
        assert summary["checks"] == count and summary["externalRequests"] == 0
        results.append({"name": name, "cwd": "back-end", "command": command,
                        "exitCode": result.returncode, "log": log,
                        "logSha256": verifier.sha(output.encode()), "summary": summary})
        print("PASS: " + name, flush=True)
    assert sources == source_entries(), "Source changed during checks"
    write_json(EVIDENCE / "checks.json", {
        "schema": "lhl.diagnostic-access-local-checks@1", "canExecute": False, "canInstall": False,
        "liveAcceptanceRenewed": False, "environmentKeys": ["NODE_ENV", "PATH"],
        "runtime": subprocess.check_output(["node", "--version"], text=True).strip(),
        "sourceSnapshotSha256": verifier.sha(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode()),
        "suites": results,
    })
    write_json(EVIDENCE / "required-source-paths.json", sorted(verifier.REQUIRED))
    evidence = [path for path in EVIDENCE.rglob("*") if path.is_file() and path.name != "manifest.json" and "__pycache__" not in path.parts]
    evidence += [EVIDENCE.parent / verifier.PRIOR / name for name in ["manifest.json", "verify.py"]]
    entries = sources + [{"path": str(path.relative_to(ROOT)), "kind": "evidence", "sha256": verifier.sha(path.read_bytes())}
                         for path in evidence]
    write_json(EVIDENCE / "manifest.json", {
        "schema": "lhl.diagnostic-access-source-manifest@1",
        "base": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "supersedesSourceCoverage": verifier.PRIOR, "canExecute": False, "canInstall": False,
        "files": sorted(entries, key=lambda item: item["path"]),
    })
    verifier.verify(source=True)
    print("PASS: snapshot recorded; no hosted checks or live acceptance claimed")


if __name__ == "__main__":
    main()
