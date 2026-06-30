#!/usr/bin/env python3
"""Extract Semrush SEO Brief Generator pasted exports to CSV/JSONL."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw"
CSV_BRIEFS = ROOT / "csv" / "seo_brief_generator_briefs_2026-06-30.csv"
CSV_COMPETITORS = ROOT / "csv" / "seo_brief_generator_competitors_2026-06-30.csv"
CSV_KEYWORDS = ROOT / "csv" / "seo_brief_generator_secondary_keywords_2026-06-30.csv"
CSV_STRUCTURE = ROOT / "csv" / "seo_brief_generator_structure_2026-06-30.csv"
RAW_LINES = ROOT / "metadata" / "seo_brief_generator_raw_lines_2026-06-30.jsonl"
MANIFEST = ROOT / "metadata" / "manifest.json"
CHECKSUMS = ROOT / "metadata" / "checksums.sha256"


def clean(value: str) -> str:
    return value.replace("\u200b", "").strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def section(lines: list[str], start: str, end: str = "---") -> list[str]:
    try:
        index = lines.index(start) + 1
    except ValueError:
        return []

    result: list[str] = []
    while index < len(lines) and lines[index] != end:
        if lines[index]:
            result.append(lines[index])
        index += 1
    return result


def split_briefs(text: str) -> list[list[str]]:
    starts = [match.start() for match in re.finditer(r"SEO content brief for:\nPrimary keyword:", text)]
    chunks: list[list[str]] = []
    for position, start in enumerate(starts):
        end_match = re.search(r"How would you rate this content brief\?", text[start:])
        if not end_match:
            end = starts[position + 1] if position + 1 < len(starts) else len(text)
        else:
            end = start + end_match.end()
        chunk = [clean(line) for line in text[start:end].splitlines()]
        chunks.append(chunk)
    return chunks


def parse_secondary_keyword(line: str) -> dict[str, str] | None:
    match = re.fullmatch(r"(.+) \(Volume: ([\d,]+) \| Difficulty: ([\d,]+)%\)", line)
    if not match:
        return None
    return {
        "secondary_keyword": match.group(1),
        "volume": match.group(2),
        "difficulty_percent": match.group(3),
    }


def parse_brief(source_file: Path, lines: list[str]) -> dict[str, object]:
    primary_keyword = section(lines, "Primary keyword:", "1. Competitor articles")
    title = section(lines, "Title:")
    meta = section(lines, "Meta Description:")
    competitors = section(lines, "Competitive articles (SERP):")
    secondary_raw = section(lines, "Secondary Keywords:")
    structure = section(lines, "Structure:")

    secondary_keywords = []
    for item in secondary_raw:
        parsed = parse_secondary_keyword(item)
        if parsed:
            secondary_keywords.append(parsed)

    return {
        "source_file": str(source_file.relative_to(ROOT)),
        "primary_keyword": primary_keyword[0] if primary_keyword else "",
        "title": title[0] if title else "",
        "meta_description": meta[0] if meta else "",
        "competitors": competitors,
        "secondary_keywords": secondary_keywords,
        "structure": structure,
    }


def main() -> None:
    raw_files = sorted(RAW_DIR.glob("*"))
    briefs = []

    RAW_LINES.parent.mkdir(parents=True, exist_ok=True)
    with RAW_LINES.open("w", encoding="utf-8") as handle:
        for path in raw_files:
            text = path.read_text(encoding="utf-8")
            for line_number, line in enumerate(text.splitlines(), start=1):
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
            for chunk in split_briefs(text):
                briefs.append(parse_brief(path, chunk))

    CSV_BRIEFS.parent.mkdir(parents=True, exist_ok=True)
    with CSV_BRIEFS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "primary_keyword",
                "title",
                "meta_description",
                "competitor_count",
                "secondary_keyword_count",
                "structure_line_count",
                "source_file",
            ],
        )
        writer.writeheader()
        for brief in briefs:
            writer.writerow(
                {
                    "primary_keyword": brief["primary_keyword"],
                    "title": brief["title"],
                    "meta_description": brief["meta_description"],
                    "competitor_count": len(brief["competitors"]),
                    "secondary_keyword_count": len(brief["secondary_keywords"]),
                    "structure_line_count": len(brief["structure"]),
                    "source_file": brief["source_file"],
                }
            )

    with CSV_COMPETITORS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["primary_keyword", "position", "competitor_article", "source_file"],
        )
        writer.writeheader()
        for brief in briefs:
            for position, competitor in enumerate(brief["competitors"], start=1):
                writer.writerow(
                    {
                        "primary_keyword": brief["primary_keyword"],
                        "position": position,
                        "competitor_article": competitor,
                        "source_file": brief["source_file"],
                    }
                )

    with CSV_KEYWORDS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "primary_keyword",
                "secondary_keyword",
                "volume",
                "difficulty_percent",
                "source_file",
            ],
        )
        writer.writeheader()
        for brief in briefs:
            for item in brief["secondary_keywords"]:
                writer.writerow(
                    {
                        "primary_keyword": brief["primary_keyword"],
                        "secondary_keyword": item["secondary_keyword"],
                        "volume": item["volume"],
                        "difficulty_percent": item["difficulty_percent"],
                        "source_file": brief["source_file"],
                    }
                )

    with CSV_STRUCTURE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["primary_keyword", "position", "structure_line", "source_file"],
        )
        writer.writeheader()
        for brief in briefs:
            for position, line in enumerate(brief["structure"], start=1):
                writer.writerow(
                    {
                        "primary_keyword": brief["primary_keyword"],
                        "position": position,
                        "structure_line": line,
                        "source_file": brief["source_file"],
                    }
                )

    manifest = {
        "source": "Semrush SEO Brief Generator",
        "captured_at": "2026-06-30",
        "raw_files": [str(path.relative_to(ROOT)) for path in raw_files],
        "brief_count": len(briefs),
        "primary_keywords": [brief["primary_keyword"] for brief in briefs],
        "extracted_files": [
            str(CSV_BRIEFS.relative_to(ROOT)),
            str(CSV_COMPETITORS.relative_to(ROOT)),
            str(CSV_KEYWORDS.relative_to(ROOT)),
            str(CSV_STRUCTURE.relative_to(ROOT)),
            str(RAW_LINES.relative_to(ROOT)),
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    checksum_paths = raw_files + [CSV_BRIEFS, CSV_COMPETITORS, CSV_KEYWORDS, CSV_STRUCTURE, RAW_LINES, MANIFEST]
    CHECKSUMS.write_text(
        "".join(f"{sha256(path)}  {path.relative_to(ROOT)}\n" for path in checksum_paths),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
