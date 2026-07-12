#!/usr/bin/env python3
"""Build ArtX inspiration reference data from verified prompt-image rows.

Only rows with a public image URL and a non-empty generation prompt are
eligible. Prompt marketplace descriptions are intentionally excluded because
they are not guaranteed to be the prompt for the displayed image.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


VERIFIED_SOURCE_SITES = {
    "civitai",
    "lexica",
    "awesome gpt image 2 gallery",
    "weshop gpt image 2",
    "picotrex nano banana",
    "youmind gpt image 2",
    "youmind nano banana pro",
    "zerolu nano banana pro",
    "dongyubin ai images prompts",
}

VERIFIED_SOURCE_URL_PREFIXES = (
    "https://civitai.com/images/",
    "https://lexica.art/prompt/",
    "https://github.com/",
)

VERIFIED_IMAGE_URL_PREFIXES = (
    "https://image.civitai.com/",
    "https://image.lexica.art/",
    "https://raw.githubusercontent.com/",
    "https://pbs.twimg.com/media/",
    "https://github.com/user-attachments/assets/",
    "https://cms-assets.youmind.com/",
)


def slugify_id(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "external"


def is_verified_row(row: dict[str, str]) -> bool:
    source_site = row.get("source_site", "").strip().lower()
    image_url = row.get("image_url", "")
    return (
        source_site in VERIFIED_SOURCE_SITES
        and row.get("source_url", "").startswith(VERIFIED_SOURCE_URL_PREFIXES)
        and image_url.startswith(VERIFIED_IMAGE_URL_PREFIXES)
        and len(row.get("public_prompt_or_description", "").strip()) >= 24
    )


def build(args: argparse.Namespace) -> int:
    output_path = Path(args.output)
    rows = []

    for csv_path_value in args.csv:
        csv_path = Path(csv_path_value)
        if not csv_path.exists():
            continue
        with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
            for row in csv.DictReader(csv_file):
                if not is_verified_row(row):
                    continue
                index = len(rows) + 1
                prompt = row["public_prompt_or_description"].strip()
                rows.append(
                    {
                        "id": f"{slugify_id(row.get('source_site', 'external'))}-{index:03d}",
                        "group": row.get("group", "").strip() or "其他分类",
                        "subcategory": row.get("subcategory", "").strip() or "其他",
                        "sourceSite": row.get("source_site", "").strip() or "External",
                        "sourceUrl": row["source_url"].strip(),
                        "imageUrl": row["image_url"].strip(),
                        "title": row.get("title", "").strip() or f"Verified prompt image {index}",
                        "prompt": prompt,
                        "stylePromptEn": row.get("style_prompt_en", "").strip() or prompt,
                        "licenseNote": row.get("license_note", "").strip()
                        or "public image with generation prompt metadata; verify author/model license before commercial use",
                    }
                )
                if len(rows) >= args.limit:
                    break
        if len(rows) >= args.limit:
            break

    output_path.write_text(
        "// Generated from verified prompt-image metadata. Do not hand-edit.\n\n"
        'import type { RawInspirationReference } from "./inspiration-references";\n\n'
        f"export const RAW_INSPIRATION_REFERENCES: RawInspirationReference[] = {json.dumps(rows, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    print(f"wrote {len(rows)} verified inspiration references to {output_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--csv",
        nargs="+",
        default=[
            "research/ai-visual-category-dataset-20260710/dataset.csv",
            "research/ai-visual-category-dataset-20260710/dataset-lexica.csv",
            "research/ai-visual-category-dataset-20260710/dataset-github-curated.csv",
        ],
    )
    parser.add_argument("--output", default="server/inspiration-reference-data.ts")
    parser.add_argument("--limit", type=int, default=900)
    return build(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
