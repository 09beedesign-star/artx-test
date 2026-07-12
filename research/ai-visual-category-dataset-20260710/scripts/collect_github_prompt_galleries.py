#!/usr/bin/env python3
"""Collect public prompt-image pairs from curated GitHub galleries.

The collector only accepts records that contain both a visible generated image
and the prompt text shown with that image. It intentionally skips badges,
logos, source-only links, and prompt-only lists.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable


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

RAW_BASE = "https://raw.githubusercontent.com"

MARKDOWN_SOURCES = [
    {
        "name": "YouMind GPT Image 2",
        "repo": "YouMind-OpenLab/awesome-gpt-image-2",
        "branch": "main",
        "path": "README_zh.md",
        "url": "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh.md",
    },
    {
        "name": "YouMind Nano Banana Pro",
        "repo": "YouMind-OpenLab/awesome-nano-banana-pro-prompts",
        "branch": "main",
        "path": "README_zh.md",
        "url": "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main/README_zh.md",
    },
    {
        "name": "WeShop GPT Image 2",
        "repo": "weshopai/awesome-gpt-image-2-prompts",
        "branch": "main",
        "path": "README.md",
        "url": "https://raw.githubusercontent.com/weshopai/awesome-gpt-image-2-prompts/main/README.md",
    },
    {
        "name": "PicoTrex Nano Banana",
        "repo": "PicoTrex/Awesome-Nano-Banana-images",
        "branch": "main",
        "path": "README.md",
        "url": "https://raw.githubusercontent.com/PicoTrex/Awesome-Nano-Banana-images/main/README.md",
    },
    {
        "name": "ZeroLu Nano Banana Pro",
        "repo": "ZeroLu/awesome-nanobanana-pro",
        "branch": "main",
        "path": "README.md",
        "url": "https://raw.githubusercontent.com/ZeroLu/awesome-nanobanana-pro/main/README.md",
    },
    {
        "name": "Dongyubin AI Images Prompts",
        "repo": "dongyubin/Awesome-AI-Images-Prompts",
        "branch": "main",
        "path": "README.md",
        "url": "https://raw.githubusercontent.com/dongyubin/Awesome-AI-Images-Prompts/main/README.md",
    },
]

JSON_SOURCES = [
    {
        "name": "Awesome GPT Image 2 Gallery",
        "repo": "pyth0nb3st/awesome-gpt-image-2",
        "branch": "main",
        "path": "gallery.json",
        "url": "https://raw.githubusercontent.com/pyth0nb3st/awesome-gpt-image-2/main/gallery.json",
    }
]

BAD_IMAGE_MARKERS = (
    "badge",
    "shields.io",
    "logo",
    "cover",
    "avatar",
    "wechat",
    "qrcode",
    "star-history",
)

ALLOWED_IMAGE_HOSTS = {
    "raw.githubusercontent.com",
    "pbs.twimg.com",
    "github.com",
    "cms-assets.youmind.com",
}


def request_text(url: str, timeout: int) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 ArtX prompt-image collector",
            "Accept": "text/plain,application/json,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def normalize_space(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def normalize_prompt_for_direct_generation(prompt: str) -> str:
    prompt = normalize_space(prompt)

    def replace_raycast_argument(match: re.Match[str]) -> str:
        argument = match.group(0)
        default_match = re.search(r'default\s*=\s*"([^"]*)"', argument)
        if not default_match:
            default_match = re.search(r'default\s*=\s*\\"([^\\"]*)\\"', argument)
        return default_match.group(1) if default_match else argument

    prompt = re.sub(r'\{argument\b[^{}]*\}', replace_raycast_argument, prompt)
    return normalize_space(prompt)


def markdown_sections(text: str) -> Iterable[str]:
    starts = [
        match.start()
        for match in re.finditer(r"(?m)^#{2,3}\s+(?:No\.|Case\s+\d+|例\s*\d+|\d+(?:\.\d+)*)", text)
    ]
    if not starts:
        yield text
        return
    starts.append(len(text))
    for index in range(len(starts) - 1):
        yield text[starts[index] : starts[index + 1]]


def absolutize_image_url(image_url: str, repo: str, branch: str, markdown_path: str) -> str:
    image_url = html.unescape(image_url.strip())
    if image_url.startswith("http://") or image_url.startswith("https://"):
        return image_url
    if image_url.startswith("/"):
        return f"{RAW_BASE}/{repo}/{branch}{image_url}"
    base_dir = str(Path(markdown_path).parent)
    if base_dir == ".":
        base_dir = ""
    joined = f"{base_dir}/{image_url}" if base_dir else image_url
    return f"{RAW_BASE}/{repo}/{branch}/{urllib.parse.quote(joined, safe='/:._-')}"


def extract_image_urls(section: str, repo: str, branch: str, markdown_path: str) -> list[str]:
    urls: list[str] = []
    urls.extend(match.group(1) for match in re.finditer(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", section, re.I))
    urls.extend(match.group(1) for match in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)", section))

    cleaned: list[str] = []
    for url in urls:
        absolute = absolutize_image_url(url, repo, branch, markdown_path)
        lowered = absolute.lower()
        host = urllib.parse.urlparse(absolute).hostname
        if host not in ALLOWED_IMAGE_HOSTS:
            continue
        if any(marker in lowered for marker in BAD_IMAGE_MARKERS):
            continue
        if not re.search(r"\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$", lowered) and "github.com/user-attachments/assets/" not in lowered and "pbs.twimg.com/media/" not in lowered:
            continue
        cleaned.append(absolute)
    return cleaned


def extract_prompt(section: str) -> str:
    patterns = [
        r"\*\*(?:Prompt|提示词)\s*:?\*\*\s*\n+```(?:text|json|markdown|md)?\n(.*?)```",
        r"(?:^|\n)(?:Prompt|提示词)\s*:?\s*\n+```(?:text|json|markdown|md)?\n(.*?)```",
        r"\*\*(?:Prompt|提示词)\s*:?\*\*\s*\n+(.+?)(?:\n\n|\n---|\n#{2,4}\s+|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, section, re.I | re.S)
        if match:
            return normalize_space(match.group(1))

    code_blocks = re.findall(r"```(?:text|json|markdown|md)?\n(.*?)```", section, re.I | re.S)
    code_blocks = [normalize_space(block) for block in code_blocks if len(normalize_space(block)) >= 24]
    if code_blocks:
        return max(code_blocks, key=len)
    return ""


def extract_title(section: str, fallback: str) -> str:
    match = re.search(r"(?m)^#{2,4}\s+(.+)$", section)
    if not match:
        return fallback
    title = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", match.group(1))
    title = re.sub(r"<[^>]+>", "", title)
    return normalize_space(title)[:160] or fallback


def classify(group_text: str, prompt: str) -> tuple[str, str]:
    text = f"{group_text} {prompt}".lower()
    if re.search(r"ecommerce|product|商品|产品|广告|poster|campaign|marketing|brand|logo|包装|海报|电商", text):
        return "品牌商业", "营销活动"
    if re.search(r"ui|app|web|dashboard|界面|网页", text):
        return "品牌商业", "UI设计"
    if re.search(r"fashion|服装|outfit|wear|streetwear|jacket|dress|时尚", text):
        return "行业品类", "服装"
    if re.search(r"food|drink|coffee|beverage|美食|饮品|餐", text):
        return "行业品类", "美食饮品"
    if re.search(r"car|vehicle|汽车|车辆", text):
        return "行业品类", "汽车相关"
    if re.search(r"pet|dog|cat|宠物", text):
        return "行业品类", "宠物广告"
    if re.search(r"interior|room|architecture|building|室内|建筑|空间", text):
        return "空间对象", "建筑效果"
    if re.search(r"game|游戏|asset|道具", text):
        return "空间对象", "游戏道具"
    if re.search(r"anime|manga|comic|漫画|动漫|二次元", text):
        return "风格美术", "二次元"
    if re.search(r"portrait|person|face|avatar|人物|人像|肖像|角色", text):
        return "人物角色", "肖像特写"
    if re.search(r"infographic|diagram|chart|education|流程图|信息图|图表|教育", text):
        return "品牌商业", "机制图设计"
    if re.search(r"sketch|line art|pencil|手绘|线稿|素描", text):
        return "图形技法", "铅笔线描"
    if re.search(r"typography|text|字体|排版|文字", text):
        return "图形技法", "字体排版"
    if re.search(r"cinematic|storyboard|film|movie|镜头|分镜|电影", text):
        return "影像叙事", "分镜脚本"
    return "其他分类", "其他"


def is_valid_prompt(prompt: str) -> bool:
    lowered = prompt.lower()
    if len(prompt.strip()) < 24:
        return False
    if lowered.startswith(("http://", "https://")):
        return False
    if lowered in {"prompt", "提示词"}:
        return False
    if re.search(r"uploaded|reference photo|reference image|attached image|input image|your photo|use my reference", prompt, re.I):
        return False
    if re.search(r"上传|参考图|参考图片|输入图片|参考角色|原图|保留原始|保持.*面部|保留.*面部", prompt):
        return False
    if re.search(r"\[[A-Za-z][A-Za-z0-9 _/-]{1,40}\]", prompt):
        return False
    if re.search(r"\{[\w\u4e00-\u9fff /_-]{1,40}\}", prompt):
        return False
    return True


def row_from_record(source: dict[str, str], title: str, prompt: str, image_url: str, source_url: str, notes: str = "") -> dict[str, str]:
    group, subcategory = classify(title, prompt)
    return {
        "group": group,
        "subcategory": subcategory,
        "source_site": source["name"],
        "source_url": source_url,
        "image_url": image_url,
        "local_image_path": "",
        "title": title,
        "public_prompt_or_description": prompt,
        "style_prompt_cn": prompt if re.search(r"[\u4e00-\u9fff]", prompt) else "",
        "style_prompt_en": prompt,
        "likes": "",
        "views": "",
        "heat_score": "",
        "license_note": "public curated prompt-image gallery item; source attribution is kept server-side and hidden from the user-facing UI",
        "download_status": "link_only",
        "notes": notes,
    }


def collect_markdown_source(source: dict[str, str], timeout: int) -> list[dict[str, str]]:
    text = request_text(source["url"], timeout)
    rows: list[dict[str, str]] = []
    for index, section in enumerate(markdown_sections(text), start=1):
        prompt = extract_prompt(section)
        prompt = normalize_prompt_for_direct_generation(prompt)
        if not is_valid_prompt(prompt):
            continue
        images = extract_image_urls(section, source["repo"], source["branch"], source["path"])
        if not images:
            continue
        title = extract_title(section, f"{source['name']} prompt {index}")
        source_url = f"https://github.com/{source['repo']}/blob/{source['branch']}/{source['path']}"
        for image_index, image_url in enumerate(images, start=1):
            rows.append(
                row_from_record(
                    source,
                    title if len(images) == 1 else f"{title} · Image {image_index}",
                    prompt,
                    image_url,
                    source_url,
                )
            )
    return rows


def collect_json_source(source: dict[str, str], timeout: int) -> list[dict[str, str]]:
    payload = json.loads(request_text(source["url"], timeout))
    rows: list[dict[str, str]] = []
    for index, item in enumerate(payload.get("images", []), start=1):
        prompt = normalize_space(str(item.get("prompt") or item.get("originalPrompt") or ""))
        prompt = normalize_prompt_for_direct_generation(prompt)
        if not is_valid_prompt(prompt):
            continue
        source_image_url = str(item.get("sourceImageUrl") or "")
        image_url = source_image_url
        if not image_url:
            continue
        host = urllib.parse.urlparse(image_url).hostname
        if host not in ALLOWED_IMAGE_HOSTS:
            continue
        title = normalize_space(str(item.get("title") or item.get("alt") or f"{source['name']} prompt {index}"))
        rows.append(
            row_from_record(
                source,
                title,
                prompt,
                image_url,
                f"https://github.com/{source['repo']}/blob/{source['branch']}/{source['path']}",
                notes=f"width={item.get('width', '')};height={item.get('height', '')}",
            )
        )
    return rows


def collect(args: argparse.Namespace) -> int:
    all_rows: list[dict[str, str]] = []
    for source in JSON_SOURCES:
        try:
            rows = collect_json_source(source, args.timeout)
            print(f"{source['name']}: {len(rows)} rows")
            all_rows.extend(rows)
        except Exception as exc:
            print(f"{source['name']}: failed: {type(exc).__name__}: {exc}")

    for source in MARKDOWN_SOURCES:
        try:
            rows = collect_markdown_source(source, args.timeout)
            print(f"{source['name']}: {len(rows)} rows")
            all_rows.extend(rows)
        except Exception as exc:
            print(f"{source['name']}: failed: {type(exc).__name__}: {exc}")

    deduped: list[dict[str, str]] = []
    seen_images: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()
    for row in all_rows:
        image_url = row["image_url"].strip()
        prompt = row["public_prompt_or_description"].strip()
        pair_key = (image_url, prompt)
        if image_url in seen_images or pair_key in seen_pairs:
            continue
        seen_images.add(image_url)
        seen_pairs.add(pair_key)
        deduped.append(row)
        if len(deduped) >= args.target_total:
            break

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(deduped)
    print(f"wrote {len(deduped)} deduped prompt-image rows to {output}")
    if len(deduped) < args.target_total:
        return 2
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="research/ai-visual-category-dataset-20260710/dataset-github-curated.csv")
    parser.add_argument("--target-total", type=int, default=900)
    parser.add_argument("--timeout", type=int, default=80)
    return collect(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
