#!/usr/bin/env python3
"""Extract Semrush Keyword Magic pasted exports to CSV/JSONL."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw"
CSV_OUT = ROOT / "csv" / "keyword_magic_gap_research_rows_2026-06-30.csv"
SUMMARY_OUT = ROOT / "csv" / "keyword_magic_gap_research_summary_2026-06-30.csv"
JSONL_OUT = ROOT / "metadata" / "keyword_magic_gap_research_raw_lines_2026-06-30.jsonl"
MANIFEST_OUT = ROOT / "metadata" / "manifest.json"
CHECKSUMS_OUT = ROOT / "metadata" / "checksums.sha256"

INTENT_TOKENS = {"I", "C", "T", "N", "n/a"}
STOP_TOKENS = {"Page:", "Contact us", "About us", "Blog", "Cookie settings"}


def clean(value: str) -> str:
    return value.replace("\u200b", "").strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_intish(value: str) -> bool:
    return bool(re.fullmatch(r"\d[\d,]*", value))


def is_cpc(value: str) -> bool:
    return bool(re.fullmatch(r"\d+\.\d{2}", value))


def read_metric_after(lines: list[str], label: str) -> str:
    for index, line in enumerate(lines):
        if line == label and index + 1 < len(lines):
            return lines[index + 1]
    return ""


def parse_raw_file(path: Path) -> tuple[dict[str, str], list[dict[str, str]]]:
    lines = [clean(line) for line in path.read_text(encoding="utf-8").splitlines()]
    lines = [line for line in lines if line]

    seed = read_metric_after(lines, "Keyword Magic Tool:")
    summary = {
        "source_file": str(path.relative_to(ROOT)),
        "seed_keyword": seed,
        "all_keywords_reported": read_metric_after(lines, "All keywords:"),
        "total_volume_reported": read_metric_after(lines, "Total Volume:"),
        "average_kd_reported": read_metric_after(lines, "Average KD:"),
        "captured_rows": "0",
    }

    if "Selected:0" not in lines:
        return summary, []

    index = lines.index("Selected:0") + 1
    rows: list[dict[str, str]] = []

    while index < len(lines):
        if lines[index] in STOP_TOKENS:
            break

        keyword = lines[index]
        index += 1
        intents: list[str] = []

        while index < len(lines) and lines[index] in INTENT_TOKENS:
            intents.append(lines[index])
            index += 1

        if not intents or index >= len(lines):
            break

        volume = lines[index] if index < len(lines) else ""
        index += 1
        kd = lines[index] if index < len(lines) else ""
        index += 1
        cpc = lines[index] if index < len(lines) else ""
        index += 1
        updated = lines[index] if index < len(lines) else ""
        index += 1

        if not is_intish(volume) or (not is_intish(kd) and kd != "n/a") or not is_cpc(cpc):
            raise ValueError(
                f"Unexpected row shape in {path}: keyword={keyword!r}, "
                f"intent={intents!r}, volume={volume!r}, kd={kd!r}, cpc={cpc!r}, updated={updated!r}"
            )

        rows.append(
            {
                "tool": "Keyword Magic Tool",
                "seed_keyword": seed,
                "keyword": keyword,
                "intent": ";".join(intents),
                "volume": volume,
                "kd_percent": kd,
                "cpc_usd": cpc,
                "sf": "",
                "updated": updated,
                "source_file": str(path.relative_to(ROOT)),
            }
        )

    summary["captured_rows"] = str(len(rows))
    return summary, rows


def main() -> None:
    raw_files = sorted(RAW_DIR.glob("keyword_magic_*_2026-06-30.txt"))
    summaries: list[dict[str, str]] = []
    rows: list[dict[str, str]] = []

    JSONL_OUT.parent.mkdir(parents=True, exist_ok=True)
    with JSONL_OUT.open("w", encoding="utf-8") as handle:
        for path in raw_files:
            for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                handle.write(
                    json.dumps(
                        {
                            "source_file": str(path.relative_to(ROOT)),
                            "line": line_number,
                            "text": line,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )

    for path in raw_files:
        summary, file_rows = parse_raw_file(path)
        summaries.append(summary)
        rows.extend(file_rows)

    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = [
            "tool",
            "seed_keyword",
            "keyword",
            "intent",
            "volume",
            "kd_percent",
            "cpc_usd",
            "sf",
            "updated",
            "source_file",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    with SUMMARY_OUT.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = [
            "source_file",
            "seed_keyword",
            "all_keywords_reported",
            "total_volume_reported",
            "average_kd_reported",
            "captured_rows",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(summaries)

    manifest = {
        "source": "Semrush Keyword Magic Tool",
        "captured_at": "2026-06-30",
        "raw_files": [str(path.relative_to(ROOT)) for path in raw_files],
        "extracted_files": [
            str(CSV_OUT.relative_to(ROOT)),
            str(SUMMARY_OUT.relative_to(ROOT)),
            str(JSONL_OUT.relative_to(ROOT)),
        ],
        "total_rows_extracted": len(rows),
        "summaries": summaries,
    }
    MANIFEST_OUT.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    checksum_paths = raw_files + [CSV_OUT, SUMMARY_OUT, JSONL_OUT, MANIFEST_OUT]
    CHECKSUMS_OUT.write_text(
        "".join(f"{sha256(path)}  {path.relative_to(ROOT)}\n" for path in checksum_paths),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
