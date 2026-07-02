#!/usr/bin/env python3
"""Extract the full Semrush Position Tracking Competitor Discovery table."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw"
CSV_OUT = ROOT / "csv" / "position_tracking_competitor_discovery_full_2026-07-02.csv"
SUMMARY_OUT = ROOT / "metadata" / "competitor_discovery_full_summary.json"

RAW_FILES = [
    RAW_DIR / "position_tracking_competitor_discovery_page_1_2026-07-02.txt",
    RAW_DIR / "position_tracking_competitor_discovery_page_2_2026-07-02.txt",
    RAW_DIR / "position_tracking_competitor_discovery_page_3_2026-07-02.txt",
    RAW_DIR / "position_tracking_competitor_discovery_page_4_2026-07-02.txt",
]


RANK_RE = re.compile(r"^(\d+)\.$")
VISIBILITY_RE = re.compile(r"^(?:0|\d+(?:\.\d+)?%)$")


def clean_lines(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def split_metrics(line: str) -> dict[str, str]:
    tokens = line.split()
    if len(tokens) < 7 or tokens[-2] != "±":
        raise ValueError(f"Unexpected metrics row: {line!r}")
    return {
        "visibility_diff": tokens[0],
        "estimated_traffic": tokens[1],
        "estimated_traffic_diff": tokens[2],
        "keywords": tokens[3],
        "average_position": tokens[4],
        "position_spread": f"± {tokens[6]}",
    }


def parse_page(path: Path) -> list[dict[str, str]]:
    lines = clean_lines(path)
    try:
        start = lines.index("Competitors")
    except ValueError as exc:
        raise ValueError(f"No Competitors table in {path}") from exc

    rows: list[dict[str, str]] = []
    index = start + 1
    while index < len(lines):
        if lines[index] == "Page:":
            break
        match = RANK_RE.match(lines[index])
        if not match:
            index += 1
            continue

        rank = match.group(1)
        index += 1

        domain_parts: list[str] = []
        while index < len(lines) and not VISIBILITY_RE.match(lines[index]):
            domain_parts.append(lines[index])
            index += 1
        if index >= len(lines):
            raise ValueError(f"Missing visibility for rank {rank} in {path}")

        visibility = lines[index]
        index += 1
        if index >= len(lines):
            raise ValueError(f"Missing metrics for rank {rank} in {path}")

        metrics = split_metrics(lines[index])
        index += 1

        rows.append(
            {
                "rank": rank,
                "domain": "".join(domain_parts),
                "visibility": visibility,
                **metrics,
                "source_file": str(path.relative_to(ROOT)),
            }
        )

    return rows


def main() -> None:
    all_rows: list[dict[str, str]] = []
    for path in RAW_FILES:
        all_rows.extend(parse_page(path))

    ranks = [int(row["rank"]) for row in all_rows]
    missing = [rank for rank in range(1, 362) if rank not in ranks]
    duplicate_ranks = sorted({rank for rank in ranks if ranks.count(rank) > 1})

    fieldnames = [
        "rank",
        "domain",
        "visibility",
        "visibility_diff",
        "estimated_traffic",
        "estimated_traffic_diff",
        "keywords",
        "average_position",
        "position_spread",
        "source_file",
    ]
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sorted(all_rows, key=lambda row: int(row["rank"])))

    SUMMARY_OUT.write_text(
        json.dumps(
            {
                "row_count": len(all_rows),
                "min_rank": min(ranks) if ranks else None,
                "max_rank": max(ranks) if ranks else None,
                "missing_ranks": missing,
                "duplicate_ranks": duplicate_ranks,
                "source_files": [str(path.relative_to(ROOT)) for path in RAW_FILES],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    if len(all_rows) != 361 or missing or duplicate_ranks:
        raise SystemExit(
            f"Competitor extraction incomplete: rows={len(all_rows)}, "
            f"missing={missing}, duplicates={duplicate_ranks}"
        )


if __name__ == "__main__":
    main()
