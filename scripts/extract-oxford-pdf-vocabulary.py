#!/usr/bin/env python3
"""Extract Oxford source tuples from the two user-supplied PDF word lists."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import pdfplumber


COLUMN_BOUNDS = ((40, 165), (165, 297), (297, 429), (429, 565))
LEVEL_RE = re.compile(r"\b(?:A1|A2|B1|B2)\b")
GRAMMAR_START_RE = re.compile(
    r"\b(?:indefinite article|definite article|infinitive marker|modal v\.|"
    r"auxiliary v\.|number|n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|exclam\.)"
)
TOKEN_RE = re.compile(
    r"indefinite article|definite article|infinitive marker|modal v\.|auxiliary v\.|"
    r"number|n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|exclam\.|A1|A2|B1|B2"
)
POS_MAP = {
    "indefinite article": "article",
    "definite article": "article",
    "infinitive marker": "infinitive marker",
    "modal v.": "modal",
    "auxiliary v.": "auxiliary",
    "number": "number",
    "n.": "noun",
    "v.": "verb",
    "adj.": "adjective",
    "adv.": "adverb",
    "prep.": "preposition",
    "conj.": "conjunction",
    "pron.": "pronoun",
    "det.": "determiner",
    "exclam.": "exclamation",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def split_headword(value: str) -> tuple[str, str | None, str]:
    printed = normalize_space(value)
    sense_match = re.search(r"\s+\(([^)]+)\)$", printed)
    sense = sense_match.group(1) if sense_match else None
    without_sense = printed[: sense_match.start()] if sense_match else printed
    display = re.sub(r"(?<=\D)[12]$", "", without_sense)
    if display == "a, an":
        display = "a / an"
    return display, sense, printed


def parse_line(line: str) -> tuple[str, str] | None:
    line = normalize_space(line)
    marker = next((candidate for candidate in GRAMMAR_START_RE.finditer(line) if candidate.start() > 0), None)
    if marker is None:
        return None
    headword = line[: marker.start()].strip()
    grammar = line[marker.start() :].strip()
    if not headword or not grammar:
        return None
    return headword, grammar


def is_continuation_line(line: str) -> bool:
    return bool(
        re.match(
            r"^(?:(?:n|v|adj|adv|prep|conj|pron|det|exclam)\.|"
            r"(?:indefinite|definite) article|infinitive marker|modal v\.|auxiliary v\.|"
            r"number\s+(?:A1|A2|B1|B2)|A1|A2|B1|B2)",
            line,
        )
    )


def logical_lines(lines: list[str]) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    index = 0
    while index < len(lines):
        start = index + 1
        line = lines[index]
        while index + 1 < len(lines) and is_continuation_line(lines[index + 1]):
            index += 1
            line = f"{line} {lines[index]}"
        result.append((start, line))
        index += 1
    return result


def parts_by_level(grammar: str) -> dict[str, list[str]]:
    pending: list[str] = []
    result: dict[str, list[str]] = {}
    for match in TOKEN_RE.finditer(grammar):
        token = match.group(0)
        if token in {"A1", "A2", "B1", "B2"}:
            if not pending:
                raise ValueError(f"Level {token} has no part of speech in {grammar!r}")
            bucket = result.setdefault(token, [])
            for part in pending:
                if part not in bucket:
                    bucket.append(part)
            pending = []
        else:
            part = POS_MAP[token]
            if part not in pending:
                pending.append(part)
    if pending:
        raise ValueError(f"Part of speech has no CEFR level in {grammar!r}: {pending}")
    return result


def parts_without_level(grammar: str) -> list[str]:
    parts: list[str] = []
    for match in TOKEN_RE.finditer(grammar):
        token = match.group(0)
        if token in POS_MAP:
            part = POS_MAP[token]
            if part not in parts:
                parts.append(part)
    if not parts:
        raise ValueError(f"No part of speech in {grammar!r}")
    return parts


def column_lines(page, column: int, top: float = 0, bottom: float | None = None) -> list[str]:
    x0, x1 = COLUMN_BOUNDS[column]
    crop = page.crop((x0, top, x1, bottom or page.height))
    text = crop.extract_text(x_tolerance=1.25, y_tolerance=2) or ""
    return [normalize_space(line) for line in text.splitlines() if normalize_space(line)]


def extract_oxford_3000(path: Path) -> tuple[list[dict], list[dict]]:
    printed_rows: list[dict] = []
    grouped_entries: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            for column in range(4):
                lines = column_lines(page, column)
                for line_number, line in logical_lines(lines):
                    parsed = parse_line(line)
                    if not parsed or not LEVEL_RE.search(parsed[1]):
                        continue
                    raw_headword, grammar = parsed
                    levels = parts_by_level(grammar)
                    display, sense, printed = split_headword(raw_headword)
                    row = {
                        "source": "The Oxford 3000",
                        "printedHeadword": printed,
                        "headword": display,
                        "sense": sense,
                        "grammar": grammar,
                        "sourcePage": page_index + 1,
                        "sourceColumn": column + 1,
                        "sourceLine": line_number,
                    }
                    printed_rows.append(row)
                    for level, parts in levels.items():
                        grouped_entries.append(
                            {
                                **row,
                                "level": level,
                                "partsOfSpeech": parts,
                            }
                        )
    return printed_rows, grouped_entries


def find_c1_heading_top(page) -> float:
    headings = [
        word
        for word in page.extract_words()
        if word["text"] == "C1" and COLUMN_BOUNDS[2][0] <= word["x0"] < COLUMN_BOUNDS[2][1]
    ]
    if len(headings) != 1:
        raise ValueError(f"Expected one C1 heading in Oxford 5000 page 3 column 3, found {len(headings)}")
    return float(headings[0]["top"])


def extract_oxford_5000_b2(path: Path) -> list[dict]:
    entries: list[dict] = []
    with pdfplumber.open(path) as pdf:
        c1_top = find_c1_heading_top(pdf.pages[2])
        regions = [
            (0, 0, None), (0, 1, None), (0, 2, None), (0, 3, None),
            (1, 0, None), (1, 1, None), (1, 2, None), (1, 3, None),
            (2, 0, None), (2, 1, None), (2, 2, c1_top),
        ]
        for page_index, column, bottom in regions:
            page = pdf.pages[page_index]
            for line_number, line in logical_lines(column_lines(page, column, bottom=bottom)):
                parsed = parse_line(line)
                if not parsed:
                    continue
                raw_headword, grammar = parsed
                if LEVEL_RE.search(grammar):
                    continue
                display, sense, printed = split_headword(raw_headword)
                entries.append(
                    {
                        "source": "The Oxford 5000 by CEFR level",
                        "printedHeadword": printed,
                        "headword": display,
                        "sense": sense,
                        "grammar": grammar,
                        "level": "B2",
                        "partsOfSpeech": parts_without_level(grammar),
                        "sourcePage": page_index + 1,
                        "sourceColumn": column + 1,
                        "sourceLine": line_number,
                    }
                )
    return entries


def normalized_key(entry: dict) -> str:
    headword = normalize_space(entry["printedHeadword"]).casefold()
    parts = "+".join(sorted(entry["partsOfSpeech"]))
    return f"{headword}|{entry['level']}|{parts}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--oxford3000", required=True, type=Path)
    parser.add_argument("--oxford5000", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    printed_3000, grouped_3000 = extract_oxford_3000(args.oxford3000)
    entries_5000_b2 = extract_oxford_5000_b2(args.oxford5000)
    combined = grouped_3000 + entries_5000_b2
    seen: set[str] = set()
    duplicates: list[dict] = []
    unique: list[dict] = []
    for entry in combined:
        key = normalized_key(entry)
        entry["sourceKey"] = key
        if key in seen:
            duplicates.append(entry)
        else:
            seen.add(key)
            unique.append(entry)

    output = {
        "sources": {
            "oxford3000": {
                "path": str(args.oxford3000),
                "sha256": sha256(args.oxford3000),
                "pages": 11,
            },
            "oxford5000": {
                "path": str(args.oxford5000),
                "sha256": sha256(args.oxford5000),
                "pages": 8,
                "importedLevel": "B2",
            },
        },
        "oxford3000PrintedRows": printed_3000,
        "oxford3000Entries": grouped_3000,
        "oxford5000B2Entries": entries_5000_b2,
        "combinedUniqueEntries": unique,
        "sourceDuplicates": duplicates,
        "summary": {
            "oxford3000PrintedRows": len(printed_3000),
            "oxford3000GroupedEntries": len(grouped_3000),
            "oxford3000ByLevel": {
                level: sum(entry["level"] == level for entry in grouped_3000)
                for level in ("A1", "A2", "B1", "B2")
            },
            "oxford5000B2Entries": len(entries_5000_b2),
            "combinedBeforeDeduplication": len(combined),
            "combinedUniqueEntries": len(unique),
            "sourceDuplicates": len(duplicates),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
