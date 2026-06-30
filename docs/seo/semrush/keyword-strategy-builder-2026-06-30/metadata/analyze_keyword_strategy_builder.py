#!/usr/bin/env python3
"""Print compact analysis of the Semrush Keyword Strategy Builder export."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "csv" / "littleherolabs_com_-_keyword_strategy__table.csv"


def as_int(value: str) -> int:
    if value in ("", None):
        return 0
    return int(float(str(value).replace(",", "")))


def score(row: dict[str, str]) -> float:
    volume = as_int(row["volume"])
    difficulty = as_int(row["keyword difficulty"])
    return volume / max(difficulty, 1)


def cluster(keyword: str) -> str:
    term = keyword.lower()
    if "baby" in term or "board" in term or "infant" in term:
        return "baby/board-books"
    if "coloring" in term or "activity" in term:
        return "coloring/activity"
    if "christmas" in term:
        return "christmas"
    if "storybook" in term or "story book" in term or "story books" in term:
        return "storybook"
    if "photo" in term or "picture" in term:
        return "photo/picture"
    if "create" in term or "customizable" in term or "customize" in term or "custom" in term:
        return "custom/create"
    if "near me" in term:
        return "local/near-me"
    if "kid" in term or "child" in term:
        return "core-kids"
    return "broad-book"


def main() -> None:
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    mapped = [row for row in rows if row["url"].strip()]
    unmapped = [row for row in rows if not row["url"].strip()]

    print(f"rows_total={len(rows)}")
    print(f"rows_mapped={len(mapped)}")
    print(f"rows_unmapped={len(unmapped)}")
    print()

    print("mapped_by_url")
    by_url: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in mapped:
        by_url[row["url"]].append(row)
    for url, url_rows in sorted(by_url.items()):
        volume = sum(as_int(row["volume"]) for row in url_rows)
        print(f"- {url} rows={len(url_rows)} volume={volume}")
        for row in sorted(url_rows, key=lambda item: as_int(item["volume"]), reverse=True):
            print(
                f"  {row['keyword']} | vol={row['volume']} | kd={row['keyword difficulty']} | intent={row['intent']}"
            )
    print()

    print("top_unmapped_by_volume")
    for row in sorted(unmapped, key=lambda item: as_int(item["volume"]), reverse=True)[:35]:
        print(
            f"- {row['keyword']} | cluster={cluster(row['keyword'])} | vol={row['volume']} | kd={row['keyword difficulty']} | intent={row['intent']}"
        )
    print()

    print("top_unmapped_by_volume_per_kd")
    for row in sorted(unmapped, key=score, reverse=True)[:35]:
        print(
            f"- {row['keyword']} | cluster={cluster(row['keyword'])} | vol={row['volume']} | kd={row['keyword difficulty']} | score={score(row):.1f}"
        )
    print()

    print("unmapped_cluster_totals")
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"rows": 0, "volume": 0})
    for row in unmapped:
        name = cluster(row["keyword"])
        totals[name]["rows"] += 1
        totals[name]["volume"] += as_int(row["volume"])
    for name, values in sorted(totals.items(), key=lambda item: item[1]["volume"], reverse=True):
        print(f"- {name}: rows={values['rows']} volume={values['volume']}")


if __name__ == "__main__":
    main()
