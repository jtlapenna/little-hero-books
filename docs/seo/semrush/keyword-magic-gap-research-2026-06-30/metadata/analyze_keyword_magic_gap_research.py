#!/usr/bin/env python3
"""Print compact analysis of the 2026-06-30 Keyword Magic gap research."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROWS_CSV = ROOT / "csv" / "keyword_magic_gap_research_rows_2026-06-30.csv"
SUMMARY_CSV = ROOT / "csv" / "keyword_magic_gap_research_summary_2026-06-30.csv"


def as_int(value: str) -> int:
    if not value or value == "n/a":
        return 0
    return int(float(value.replace(",", "")))


def score(row: dict[str, str]) -> float:
    volume = as_int(row["volume"])
    kd = as_int(row["kd_percent"])
    return volume / max(kd, 1)


def cluster(keyword: str) -> str:
    term = keyword.lower()
    if "christmas" in term or "holiday" in term or "santa" in term:
        return "christmas/holiday"
    if "color" in term or "activity" in term:
        return "coloring/activity"
    if "baby" in term or "babies" in term or "infant" in term or "board book" in term:
        return "baby/board-book"
    if "photo" in term or "picture" in term or "pictures" in term:
        return "photo/picture"
    if "story" in term:
        return "story-book"
    if "create" in term or "make" in term or "custom" in term or "customized" in term:
        return "custom/create"
    if "print" in term or "publish" in term or "template" in term or "free" in term:
        return "author/publishing"
    if "gift" in term:
        return "gift"
    return "core"


def main() -> None:
    rows = list(csv.DictReader(ROWS_CSV.open(encoding="utf-8")))
    summaries = list(csv.DictReader(SUMMARY_CSV.open(encoding="utf-8")))

    print(f"rows_total={len(rows)}")
    print()

    print("seed_summaries")
    for summary in summaries:
        print(
            f"- {summary['seed_keyword']} | reported={summary['all_keywords_reported']} | "
            f"captured={summary['captured_rows']} | volume={summary['total_volume_reported']} | "
            f"avg_kd={summary['average_kd_reported']}"
        )
    print()

    print("top_rows_by_seed_volume")
    by_seed: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_seed[row["seed_keyword"]].append(row)
    for seed, seed_rows in sorted(by_seed.items()):
        print(f"[{seed}]")
        for row in sorted(seed_rows, key=lambda item: as_int(item["volume"]), reverse=True)[:12]:
            print(
                f"- {row['keyword']} | cluster={cluster(row['keyword'])} | "
                f"vol={row['volume']} | kd={row['kd_percent']} | intent={row['intent']} | cpc={row['cpc_usd']}"
            )
    print()

    print("top_rows_by_volume_per_kd")
    metric_rows = [row for row in rows if row["kd_percent"] != "n/a" and as_int(row["volume"]) > 0]
    for row in sorted(metric_rows, key=score, reverse=True)[:40]:
        print(
            f"- {row['keyword']} | seed={row['seed_keyword']} | cluster={cluster(row['keyword'])} | "
            f"vol={row['volume']} | kd={row['kd_percent']} | score={score(row):.1f}"
        )
    print()

    print("cluster_totals_captured_rows")
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"rows": 0, "volume": 0})
    for row in rows:
        name = cluster(row["keyword"])
        totals[name]["rows"] += 1
        totals[name]["volume"] += as_int(row["volume"])
    for name, values in sorted(totals.items(), key=lambda item: item[1]["volume"], reverse=True):
        print(f"- {name}: rows={values['rows']} volume={values['volume']}")


if __name__ == "__main__":
    main()
