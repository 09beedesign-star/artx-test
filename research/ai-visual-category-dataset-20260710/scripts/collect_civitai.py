#!/usr/bin/env python3
"""Collect public Civitai image metadata and preview images for ArtX taxonomy.

This script only uses public endpoints and records failures instead of bypassing
access controls. It is intentionally conservative: SFW only by default, limited
page count, and every row keeps source and license notes.
"""

from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import re
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


QUERY_HINTS: dict[str, list[str]] = {
    "服装": ["fashion editorial", "luxury fashion campaign", "streetwear lookbook"],
    "化妆品": ["cosmetic product photography", "skincare product shot", "luxury perfume ad"],
    "游戏": ["game character concept art", "fantasy RPG character", "cyberpunk game asset"],
    "母婴亲子": ["family lifestyle photography", "mother and baby portrait", "baby product photography"],
    "美食饮品": ["food photography", "beverage product photography", "restaurant menu photo"],
    "AI智能": ["artificial intelligence concept art", "humanoid robot assistant", "futuristic AI interface"],
    "教育": ["educational infographic", "classroom learning poster", "whiteboard learning guide"],
    "汽车相关": ["automotive advertising", "car commercial poster", "luxury car photography"],
    "3C数码": ["consumer electronics product photography", "smartphone advertising", "tech product render"],
    "医美纤体": ["beauty clinic advertising", "medical spa visual", "body contouring ad"],
    "宠物广告": ["pet product advertising", "dog food campaign", "cat lifestyle photography"],
    "家居美学": ["interior design render", "home decor photography", "modern living room aesthetic"],
    "运动户外": ["outdoor sports campaign", "fitness advertising", "hiking lifestyle photography"],
    "UI设计": ["SaaS dashboard UI", "mobile app UI design", "AI app interface"],
    "二次元": ["anime character illustration", "manga key visual", "anime fantasy background"],
    "肖像特写": ["close up portrait", "cinematic headshot", "hyperrealistic face portrait"],
    "建筑效果": ["architectural visualization", "modern house exterior render", "photorealistic archviz"],
}


def slugify(text: str) -> str:
    text = re.sub(r"\s+", "-", text.strip().lower())
    text = re.sub(r"[^a-z0-9\-\u4e00-\u9fff]+", "", text)
    return text[:80] or "item"


def request_json(url: str, timeout: int) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 ArtX research collector; public metadata only",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def download_image(url: str, output_path: Path, timeout: int) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 ArtX research collector; public preview only"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        ext = mimetypes.guess_extension(content_type) or ".jpg"
        if ext == ".jpe":
            ext = ".jpg"
        final_path = output_path.with_suffix(ext)
        final_path.write_bytes(response.read())
        return str(final_path)


def extract_prompt(item: dict[str, Any]) -> str:
    meta = item.get("meta") or {}
    prompt = meta.get("prompt") or meta.get("Prompt") or ""
    if isinstance(prompt, str):
        return prompt.replace("\n", " ").strip()
    return ""


def is_prompt_matched_image(item: dict[str, Any]) -> bool:
    if item.get("type") != "image":
        return False
    if item.get("nsfw") is not False or item.get("nsfwLevel") != "None":
        return False
    if not item.get("url"):
        return False
    return len(extract_prompt(item)) >= 24


def collect(args: argparse.Namespace) -> int:
    base = Path(args.base)
    taxonomy = json.loads((base / "taxonomy.json").read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    images_dir = base / "images"
    max_per_subcategory = args.limit
    processed_subcategories = 0

    for group, subcategories in taxonomy.items():
        for subcategory in subcategories:
            if args.only_subcategory and subcategory != args.only_subcategory:
                continue
            if args.max_subcategories and processed_subcategories >= args.max_subcategories:
                break
            queries = QUERY_HINTS.get(subcategory, [subcategory])
            collected = 0
            processed_subcategories += 1
            for query in queries:
                if collected >= max_per_subcategory or len(rows) >= args.target_total:
                    break
                encoded_query = urllib.parse.quote(query)
                api_url = (
                    "https://civitai.com/api/v1/images"
                    f"?limit={min(100, max_per_subcategory)}"
                    "&sort=Newest&period=AllTime&nsfw=None"
                    f"&query={encoded_query}"
                )
                page_url = api_url
                for _page in range(args.pages_per_query):
                    if collected >= max_per_subcategory or len(rows) >= args.target_total or not page_url:
                        break
                    try:
                        payload = request_json(page_url, args.timeout)
                    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                        print(f"metadata failed: {subcategory} / {query}: {type(exc).__name__}: {exc}")
                        break

                    for item in payload.get("items", []):
                        if collected >= max_per_subcategory or len(rows) >= args.target_total:
                            break
                        if not is_prompt_matched_image(item):
                            continue
                        stats = item.get("stats") or {}
                        image_url = item.get("url") or ""
                        source_url = f"https://civitai.com/images/{item.get('id')}" if item.get("id") else page_url
                        local_path = ""
                        status = "not_downloaded"
                        if image_url and args.download:
                            out = images_dir / slugify(group) / slugify(subcategory) / f"{collected + 1:02d}-{item.get('id', 'image')}"
                            out.parent.mkdir(parents=True, exist_ok=True)
                            try:
                                local_path = download_image(image_url, out, args.timeout)
                                status = "downloaded"
                            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                                status = "download_failed"
                                local_path = ""
                                item["download_error"] = f"{type(exc).__name__}: {exc}"

                        prompt = extract_prompt(item)
                        rows.append(
                            {
                                "group": group,
                                "subcategory": subcategory,
                                "source_site": "Civitai",
                                "source_url": source_url,
                                "image_url": image_url,
                                "local_image_path": local_path,
                                "title": f"Civitai image {item.get('id')}",
                                "public_prompt_or_description": prompt,
                                "style_prompt_cn": "",
                                "style_prompt_en": prompt,
                                "likes": stats.get("likeCount", ""),
                                "views": stats.get("viewCount", ""),
                                "heat_score": stats.get("heartCount", "") or stats.get("likeCount", ""),
                                "license_note": "public Civitai image with generation prompt metadata; verify author/model license before commercial use",
                                "download_status": status,
                                "notes": item.get("download_error", ""),
                            }
                        )
                        collected += 1
                        time.sleep(args.delay)
                    page_url = (payload.get("metadata") or {}).get("nextPage")
        if args.max_subcategories and processed_subcategories >= args.max_subcategories:
            break
        if len(rows) >= args.target_total:
            break

    with (base / "dataset.csv").open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="research/ai-visual-category-dataset-20260710")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--target-total", type=int, default=900)
    parser.add_argument("--pages-per-query", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--delay", type=float, default=0.4)
    parser.add_argument("--only-subcategory", default="")
    parser.add_argument("--max-subcategories", type=int, default=0)
    parser.add_argument("--download", action="store_true")
    return collect(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
