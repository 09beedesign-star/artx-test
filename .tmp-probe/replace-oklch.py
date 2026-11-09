#!/usr/bin/env python3
"""批量替换 MainCanvas.tsx 和 RightPanel.tsx 里的紫色 oklch 值"""
import re, sys

def replace_in_file(path: str, replacements: list[tuple[str, str]]):
    with open(path, "r") as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print(f"Done: {path}")

# MainCanvas.tsx replacements
mc_replacements = [
    # EmptyState 图标背景（品牌紫渐变 → 灰色调）
    ('background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.2), oklch(0.72 0.18 200 / 0.2))", border: "1px solid oklch(0.58 0.22 290 / 0.3)"',
     'background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)"'),
    # Sparkles 颜色
    ('color: "oklch(0.72 0.18 290)"', 'color: "#f1f1f3"'),
    # EmptyState 标题文字
    ('color: "oklch(0.90 0.008 270)"', 'color: "#f1f1f3"'),
    # EmptyState 说明文字
    ('color: "oklch(0.66 0.010 270)"', 'color: "#a0a0a6"'),
    # QuickStart 卡片 hover 边框 (class)
    ('hover:border-purple-500/30 card-hover', 'hover:border-white/20 card-hover'),
    # QuickStart 卡片背景
    ('background: "oklch(0.15 0.018 270)", border: "1px solid oklch(1 0 0 / 8%)"',
     'background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.10)"'),
    # QuickStart 卡片标题
    ('color: "oklch(0.85 0.008 270)"', 'color: "#f1f1f3"'),
    # QuickStart 卡片说明
    ('color: "oklch(0.64 0.010 270)"', 'color: "#777472"'),
    # User avatar (暗色背景)
    ('background: "oklch(0.22 0.02 270)", color: "oklch(0.70 0.01 270)"',
     'background: "#2a2a2a", color: "#a0a0a6"'),
    # AI avatar (品牌紫渐变)
    ('background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))"',
     'background: "linear-gradient(135deg, #333333, #555555)"'),
    # Step list panel
    ('background: "oklch(0.15 0.018 270)", border: "1px solid oklch(1 0 0 / 8%)"',
     'background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.10)"'),
    # User 消息气泡（品牌紫透明）
    ('background: "oklch(0.58 0.22 290 / 0.18)",\n              border: "1px solid oklch(0.58 0.22 290 / 0.28)",\n              color: "oklch(0.90 0.008 270)"',
     'background: "rgba(255,255,255,0.10)",\n              border: "1px solid rgba(255,255,255,0.18)",\n              color: "#f1f1f3"'),
    # AI 消息气泡
    ('background: "oklch(0.15 0.018 270)",\n              border: "1px solid oklch(1 0 0 / 8%)",\n              color: "oklch(0.82 0.008 270)"',
     'background: "#1a1a1a",\n              border: "1px solid rgba(255,255,255,0.08)",\n              color: "#e0e0e0"'),
    # 时间戳颜色 x2
    ('color: "oklch(0.36 0.01 270)"', 'color: "#555"'),
    # Step done check
    ('background: "oklch(0.72 0.18 200 / 0.2)"', 'background: "rgba(16,185,129,0.15)"'),
    ('color: "oklch(0.72 0.18 200)"', 'color: "#10b981"'),
    # Step running loader
    ('color: "oklch(0.58 0.22 290)"', 'color: "#ffffff"'),
    # Step pending dot
    ('background: "oklch(0.30 0.01 270)"', 'background: "#444"'),
    # Step label colors
    ('"oklch(0.72 0.18 200)"', '"#10b981"'),
    ('"oklch(0.85 0.008 270)"', '"#f1f1f3"'),
    ('"oklch(0.59 0.010 270)"', '"#777472"'),
    # Asset card
    ('background: "oklch(0.13 0.016 270)", border: "1px solid oklch(1 0 0 / 8%)"',
     'background: "#141414", border: "1px solid rgba(255,255,255,0.08)"'),
    # Asset type colors
    ('image: "oklch(0.78 0.18 290)"', 'image: "#f1f1f3"'),
    ('video: "oklch(0.72 0.18 200)"', 'video: "#10b981"'),
    ('brand: "oklch(0.78 0.18 60)"', 'brand: "#f59e0b"'),
    ('poster: "oklch(0.80 0.18 330)"', 'poster: "#f472b6"'),
    # 还剩下颜色
    ('"oklch(0.62 0.010 270)"', '"#a0a0a6"'),
    ('"oklch(0.35 0.01 270)"', '"#555"'),
    ('"oklch(0.85 0.01 270)"', '"#f1f1f3"'),
    ('"oklch(0.88 0.008 270)"', '"#f1f1f3"'),
    ('"oklch(0.69 0.010 270)"', '"#a0a0a6"'),
    ('"oklch(0.73 0.010 270)"', '"#a0a0a6"'),
]

replace_in_file(
    "client/src/components/workspace/MainCanvas.tsx",
    mc_replacements
)

# Verify remaining oklch
with open("client/src/components/workspace/MainCanvas.tsx") as f:
    remaining = [(i+1, l.strip()) for i, l in enumerate(f.readlines()) if "oklch" in l]
print(f"Remaining oklch lines in MainCanvas.tsx: {len(remaining)}")
for lineno, line in remaining:
    print(f"  {lineno}: {line[:100]}")
