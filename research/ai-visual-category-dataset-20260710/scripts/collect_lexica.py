#!/usr/bin/env python3
"""Collect public Lexica search results with image URLs and prompts.

Lexica search results expose both `src` and `prompt`, which matches ArtX's
user-visible inspiration rule: the displayed image must have its corresponding
AI prompt.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


FIELDS = [
    "group",
    "subcategory",
    "source_site",
    "source_url",
    "image_url",
    "local_image_path",
    "title",
    "public_prompt_or_description",
    "style_prompt_cn",
    "style_prompt_en",
    "likes",
    "views",
    "heat_score",
    "license_note",
    "download_status",
    "notes",
]


def request_json(url: str, timeout: int) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 ArtX research collector; public prompt-image metadata only",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def is_verified_image(item: dict[str, Any]) -> bool:
    src = str(item.get("src") or "")
    prompt = str(item.get("prompt") or "").strip()
    return src.startswith("https://image.lexica.art/") and len(prompt) >= 24


def collect(args: argparse.Namespace) -> int:
    base = Path(args.base)
    taxonomy = json.loads((base / "taxonomy.json").read_text(encoding="utf-8"))
    rows: list[dict[str, str]] = []
    seen: set[str] = set()

    for group, subcategories in taxonomy.items():
        for subcategory in subcategories:
            if len(rows) >= args.target_total:
                break
            query = urllib.parse.quote(f"{subcategory} AI image prompt")
            api_url = f"https://lexica.art/api/v1/search?q={query}"
            try:
                payload = request_json(api_url, args.timeout)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                print(f"metadata failed: {subcategory}: {type(exc).__name__}: {exc}")
                continue

            collected_for_subcategory = 0
            for item in payload.get("images", []):
                if len(rows) >= args.target_total or collected_for_subcategory >= args.limit:
                    break
                if not is_verified_image(item):
                    continue
                image_url = str(item.get("src"))
                if image_url in seen:
                    continue
                seen.add(image_url)
                prompt = str(item.get("prompt") or "").strip()
                source_id = str(item.get("id") or image_url.rsplit("/", 1)[-1])
                rows.append(
                    {
                        "group": group,
                        "subcategory": subcategory,
                        "source_site": "Lexica",
                        "source_url": f"https://lexica.art/prompt/{source_id}",
                        "image_url": image_url,
                        "local_image_path": "",
                        "title": f"Lexica prompt image {source_id}",
                        "public_prompt_or_description": prompt,
                        "style_prompt_cn": "",
                        "style_prompt_en": prompt,
                        "likes": "",
                        "views": "",
                        "heat_score": "",
                        "license_note": "public Lexica search result with prompt-image metadata; verify license before commercial use",
                        "download_status": "link_only",
                        "notes": "",
                    }
                )
                collected_for_subcategory += 1
            time.sleep(args.delay)
        if len(rows) >= args.target_total:
            break

    output = base / args.output
    with output.open("w", encoding="utf-8", newline="") as csv_file:
      writer = csv.DictWriter(csv_file, fieldnames=FIELDS)
      writer.writeheader()
      writer.writerows(rows)
    print(f"wrote {len(rows)} verified Lexica rows to {output}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="research/ai-visual-category-dataset-20260710")
    parser.add_argument("--output", default="dataset-lexica.csv")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--target-total", type=int, default=900)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--delay", type=float, default=0.4)
    return collect(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
