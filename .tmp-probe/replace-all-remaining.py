#!/usr/bin/env python3
"""
全量 oklch → 图叙黑白系配色替换脚本（第二轮）
覆盖所有剩余非测试文件
"""
import re, os, sys

# ─── 精确字符串替换表（顺序敏感，长的放前面）──────────────────────────────────
EXACT = [
    # ── 紫色品牌色（主色）──
    ("oklch(0.58 0.22 290)", "#161616"),
    ("oklch(0.58 0.22 290.0)", "#161616"),
    ("oklch(0.55 0.22 290)", "#161616"),
    ("oklch(0.60 0.22 290)", "#161616"),
    ("oklch(0.62 0.22 290)", "#161616"),
    ("oklch(0.65 0.22 290)", "#161616"),
    ("oklch(0.50 0.22 290)", "#161616"),
    ("oklch(0.52 0.22 290)", "#161616"),
    ("oklch(0.45 0.22 290)", "#161616"),
    ("oklch(0.40 0.22 290)", "#161616"),
    ("oklch(0.35 0.22 290)", "#161616"),
    ("oklch(0.70 0.22 290)", "#161616"),
    ("oklch(0.75 0.22 290)", "#161616"),
    ("oklch(0.80 0.22 290)", "#f5f6f8"),
    ("oklch(0.85 0.22 290)", "#f5f6f8"),
    ("oklch(0.90 0.22 290)", "#f5f6f8"),
    ("oklch(0.92 0.22 290)", "#f5f6f8"),
    ("oklch(0.95 0.05 290)", "#f5f6f8"),
    ("oklch(0.95 0.10 290)", "#f5f6f8"),
    ("oklch(0.95 0.08 290)", "#f5f6f8"),
    ("oklch(0.96 0.05 290)", "#f5f6f8"),
    ("oklch(0.97 0.05 290)", "#f5f6f8"),
    ("oklch(0.98 0.05 290)", "#ffffff"),
    # ── 紫色带透明度 ──
    ("oklch(0.58 0.22 290 / 0.05)", "rgba(22,22,22,0.05)"),
    ("oklch(0.58 0.22 290 / 0.08)", "rgba(22,22,22,0.08)"),
    ("oklch(0.58 0.22 290 / 0.10)", "rgba(22,22,22,0.10)"),
    ("oklch(0.58 0.22 290 / 0.12)", "rgba(22,22,22,0.12)"),
    ("oklch(0.58 0.22 290 / 0.15)", "rgba(22,22,22,0.15)"),
    ("oklch(0.58 0.22 290 / 0.20)", "rgba(22,22,22,0.20)"),
    ("oklch(0.58 0.22 290 / 0.25)", "rgba(22,22,22,0.25)"),
    ("oklch(0.58 0.22 290 / 0.30)", "rgba(22,22,22,0.30)"),
    ("oklch(0.58 0.22 290 / 0.40)", "rgba(22,22,22,0.40)"),
    ("oklch(0.58 0.22 290 / 0.50)", "rgba(22,22,22,0.50)"),
    ("oklch(0.55 0.22 290 / 0.05)", "rgba(22,22,22,0.05)"),
    ("oklch(0.55 0.22 290 / 0.10)", "rgba(22,22,22,0.10)"),
    ("oklch(0.55 0.22 290 / 0.15)", "rgba(22,22,22,0.15)"),
    ("oklch(0.55 0.22 290 / 0.20)", "rgba(22,22,22,0.20)"),
    # ── 深灰 / 接近黑 ──
    ("oklch(0.20 0.00 0)", "#262627"),
    ("oklch(0.22 0.00 0)", "#262627"),
    ("oklch(0.25 0.00 0)", "#262627"),
    ("oklch(0.25 0.005 290)", "#262627"),
    ("oklch(0.28 0.005 290)", "#262627"),
    ("oklch(0.30 0.00 0)", "#3a3a3a"),
    ("oklch(0.30 0.005 290)", "#3a3a3a"),
    ("oklch(0.35 0.005 290)", "#3a3a3a"),
    # ── 中灰文字 ──
    ("oklch(0.40 0.00 0)", "#555555"),
    ("oklch(0.45 0.00 0)", "#666666"),
    ("oklch(0.46 0.005 290)", "#666666"),
    ("oklch(0.48 0.005 290)", "#666666"),
    ("oklch(0.50 0.00 0)", "#777472"),
    ("oklch(0.50 0.005 290)", "#777472"),
    ("oklch(0.55 0.00 0)", "#777472"),
    ("oklch(0.55 0.005 290)", "#777472"),
    ("oklch(0.56 0.005 290)", "#777472"),
    ("oklch(0.58 0.005 290)", "#777472"),
    ("oklch(0.60 0.00 0)", "#888888"),
    ("oklch(0.60 0.005 290)", "#888888"),
    ("oklch(0.62 0.005 290)", "#888888"),
    ("oklch(0.65 0.00 0)", "#999999"),
    ("oklch(0.65 0.005 290)", "#999999"),
    # ── 浅灰 / 边框 ──
    ("oklch(0.70 0.00 0)", "#aaaaaa"),
    ("oklch(0.70 0.005 290)", "#aaaaaa"),
    ("oklch(0.72 0.005 290)", "#aaaaaa"),
    ("oklch(0.75 0.00 0)", "#bbbbbb"),
    ("oklch(0.75 0.005 290)", "#bbbbbb"),
    ("oklch(0.80 0.00 0)", "#d4d4d4"),
    ("oklch(0.80 0.005 290)", "#d4d4d4"),
    ("oklch(0.82 0.005 290)", "#d4d4d4"),
    ("oklch(0.85 0.00 0)", "#e6e3df"),
    ("oklch(0.85 0.005 290)", "#e6e3df"),
    ("oklch(0.86 0.005 290)", "#e6e3df"),
    ("oklch(0.88 0.005 290)", "#e6e3df"),
    ("oklch(0.90 0.00 0)", "#ebebeb"),
    ("oklch(0.90 0.005 290)", "#ebebeb"),
    ("oklch(0.92 0.005 290)", "#ebebeb"),
    ("oklch(0.93 0.005 290)", "#ebebeb"),
    ("oklch(0.94 0.005 290)", "#ebebeb"),
    # ── 白 / 近白 ──
    ("oklch(0.95 0.00 0)", "#f5f6f8"),
    ("oklch(0.95 0.005 290)", "#f5f6f8"),
    ("oklch(0.96 0.005 290)", "#f5f6f8"),
    ("oklch(0.97 0.005 290)", "#f5f6f8"),
    ("oklch(0.97 0.00 0)", "#f7f7f7"),
    ("oklch(0.98 0.00 0)", "#fafafa"),
    ("oklch(0.98 0.005 290)", "#fafafa"),
    ("oklch(0.99 0.005 290)", "#fafafa"),
    ("oklch(0.99 0.00 0)", "#ffffff"),
    ("oklch(1.00 0.00 0)", "#ffffff"),
    ("oklch(1 0 0)", "#ffffff"),
    # ── 暗色模式专用 ──
    ("oklch(0.15 0.00 0)", "#111111"),
    ("oklch(0.15 0.005 290)", "#111111"),
    ("oklch(0.16 0.005 290)", "#111111"),
    ("oklch(0.18 0.005 290)", "#1a1a1a"),
    ("oklch(0.18 0.00 0)", "#1a1a1a"),
    ("oklch(0.20 0.005 290)", "#1c1c1c"),
    ("oklch(0.12 0.00 0)", "#0d0d0d"),
    ("oklch(0.12 0.005 290)", "#0d0d0d"),
    ("oklch(0.10 0.00 0)", "#0d0d0d"),
    # ── 彩色渐变色（改为中性） ──
    ("oklch(0.58 0.18 290)", "#555555"),
    ("oklch(0.58 0.15 290)", "#555555"),
    ("oklch(0.55 0.18 290)", "#555555"),
    ("oklch(0.52 0.18 290)", "#555555"),
    ("oklch(0.65 0.18 145)", "#4a7c59"),  # 绿色 → 深绿
    ("oklch(0.65 0.18 160)", "#4a7c59"),
    ("oklch(0.65 0.18 200)", "#3d6b7a"),  # 青色 → 深青
    ("oklch(0.65 0.18 230)", "#3d5c8a"),  # 蓝色 → 深蓝
    ("oklch(0.65 0.18 270)", "#161616"),  # 紫蓝 → 黑
    ("oklch(0.65 0.18 310)", "#161616"),  # 品红 → 黑
    ("oklch(0.65 0.18 30)", "#7a4a1e"),   # 橙 → 深橙棕
    ("oklch(0.65 0.18 60)", "#7a6b1e"),   # 黄 → 深黄棕
    # ── 彩色 from social-media-presets ──
    ("oklch(0.72 0.16 145)", "#5a9a6e"),
    ("oklch(0.72 0.16 200)", "#4d8899"),
    ("oklch(0.72 0.16 230)", "#4d6899"),
    ("oklch(0.72 0.16 30)", "#996640"),
    ("oklch(0.72 0.16 60)", "#998840"),
    ("oklch(0.72 0.16 0)", "#993333"),
    ("oklch(0.72 0.16 290)", "#161616"),
    ("oklch(0.72 0.16 310)", "#161616"),
    # ── 特殊透明度 ──
    ("oklch(0.58 0.22 290 / 0.02)", "rgba(22,22,22,0.02)"),
    ("oklch(0.58 0.22 290 / 0.03)", "rgba(22,22,22,0.03)"),
    ("oklch(0.20 0.00 0 / 0.05)", "rgba(38,38,39,0.05)"),
    ("oklch(0.20 0.00 0 / 0.10)", "rgba(38,38,39,0.10)"),
    ("oklch(0.20 0.00 0 / 0.15)", "rgba(38,38,39,0.15)"),
    ("oklch(1.00 0.00 0 / 0.05)", "rgba(255,255,255,0.05)"),
    ("oklch(1.00 0.00 0 / 0.10)", "rgba(255,255,255,0.10)"),
    ("oklch(1.00 0.00 0 / 0.15)", "rgba(255,255,255,0.15)"),
    ("oklch(1.00 0.00 0 / 0.20)", "rgba(255,255,255,0.20)"),
    ("oklch(1.00 0.00 0 / 0.30)", "rgba(255,255,255,0.30)"),
    ("oklch(1.00 0.00 0 / 0.50)", "rgba(255,255,255,0.50)"),
    ("oklch(1.00 0.00 0 / 0.80)", "rgba(255,255,255,0.80)"),
    ("oklch(1 0 0 / 0.05)", "rgba(255,255,255,0.05)"),
    ("oklch(1 0 0 / 0.10)", "rgba(255,255,255,0.10)"),
    ("oklch(1 0 0 / 0.15)", "rgba(255,255,255,0.15)"),
    ("oklch(1 0 0 / 0.20)", "rgba(255,255,255,0.20)"),
    ("oklch(1 0 0 / 0.50)", "rgba(255,255,255,0.50)"),
    ("oklch(1 0 0 / 0.80)", "rgba(255,255,255,0.80)"),
    ("oklch(0 0 0 / 0.05)", "rgba(0,0,0,0.05)"),
    ("oklch(0 0 0 / 0.10)", "rgba(0,0,0,0.10)"),
    ("oklch(0 0 0 / 0.15)", "rgba(0,0,0,0.15)"),
    ("oklch(0 0 0 / 0.20)", "rgba(0,0,0,0.20)"),
    ("oklch(0 0 0 / 0.30)", "rgba(0,0,0,0.30)"),
    ("oklch(0 0 0 / 0.50)", "rgba(0,0,0,0.50)"),
    ("oklch(0.00 0.00 0 / 0.05)", "rgba(0,0,0,0.05)"),
    ("oklch(0.00 0.00 0 / 0.10)", "rgba(0,0,0,0.10)"),
    ("oklch(0.00 0.00 0 / 0.15)", "rgba(0,0,0,0.15)"),
    ("oklch(0.00 0.00 0 / 0.20)", "rgba(0,0,0,0.20)"),
    ("oklch(0.00 0.00 0 / 0.30)", "rgba(0,0,0,0.30)"),
    ("oklch(0.00 0.00 0 / 0.50)", "rgba(0,0,0,0.50)"),
    # ── 黑色 / 全透明 ──
    ("oklch(0 0 0)", "#000000"),
    ("oklch(0.00 0.00 0)", "#000000"),
]

# ─── 正则替换（处理动态值、渐变等）────────────────────────────────────────────
REGEX_SUBS = [
    # oklch(L C H / alpha) 带透明度 —— 紫色色相 260-310
    (re.compile(r'oklch\((0\.\d+)\s+(0\.(?:1[5-9]|2\d))\s+(?:26\d|27\d|28\d|29\d|30[0-9])\s*/\s*([\d.]+)\)'),
     lambda m: f"rgba(22,22,22,{m.group(3)})"),

    # oklch(L C H) 紫色色相 260-310 高饱和 → #161616
    (re.compile(r'oklch\((\d*\.?\d+)\s+(0\.(?:1[5-9]|2\d))\s+(?:26\d|27\d|28\d|29\d|30[0-9])\)'),
     lambda m: "#161616" if float(m.group(1)) < 0.70 else "#f5f6f8"),

    # oklch(L C H) 紫色色相 低饱和 0.00-0.05 → 灰阶
    (re.compile(r'oklch\((\d*\.?\d+)\s+(0\.0[0-5])\s+(?:26\d|27\d|28\d|29\d|30[0-9])\)'),
     lambda m: _lightness_to_gray(float(m.group(1)))),

    # oklch(L 0 0) 或 oklch(L 0.00 0) 纯灰 → hex
    (re.compile(r'oklch\((\d*\.?\d+)\s+0(?:\.0+)?\s+0\)'),
     lambda m: _lightness_to_gray(float(m.group(1)))),

    # oklch(L 0 0 / alpha) 带透明度纯灰
    (re.compile(r'oklch\((\d*\.?\d+)\s+0(?:\.0+)?\s+0\s*/\s*([\d.]+)\)'),
     lambda m: f"rgba({_hex_to_rgb(_lightness_to_gray(float(m.group(1))))},{m.group(2)})"),

    # 兜底：任何剩余 oklch 中色相在 260-310 → #161616
    (re.compile(r'oklch\([^)]+\s+(?:2[6-9]\d|30[0-9])\s*(?:/[^)]+)?\)'),
     lambda m: "#161616"),

    # 兜底：任何剩余彩色 oklch（C > 0.05）→ 转为灰色
    (re.compile(r'oklch\((\d*\.?\d+)\s+(0\.[1-9]\d*)\s+\d+(?:\.\d+)?\s*(?:/\s*[\d.]+)?\)'),
     lambda m: _lightness_to_gray(float(m.group(1)))),
]


def _lightness_to_gray(l: float) -> str:
    """把 OKLCH 的 L 值（0-1）映射到 hex 灰阶"""
    if l <= 0.05: return "#000000"
    if l <= 0.12: return "#0d0d0d"
    if l <= 0.18: return "#111111"
    if l <= 0.22: return "#1a1a1a"
    if l <= 0.27: return "#262627"
    if l <= 0.32: return "#3a3a3a"
    if l <= 0.38: return "#444444"
    if l <= 0.43: return "#555555"
    if l <= 0.50: return "#666666"
    if l <= 0.56: return "#777472"
    if l <= 0.62: return "#888888"
    if l <= 0.68: return "#999999"
    if l <= 0.73: return "#aaaaaa"
    if l <= 0.78: return "#bbbbbb"
    if l <= 0.83: return "#cccccc"
    if l <= 0.87: return "#d4d4d4"
    if l <= 0.91: return "#e6e3df"
    if l <= 0.94: return "#ebebeb"
    if l <= 0.96: return "#f5f6f8"
    if l <= 0.98: return "#fafafa"
    return "#ffffff"


def _hex_to_rgb(h: str) -> str:
    h = h.lstrip('#')
    r, g, b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    return f"{r},{g},{b}"


def process_file(path: str) -> int:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    count = 0

    # 精确替换（长的先）
    for old, new in EXACT:
        if old in content:
            n = content.count(old)
            content = content.replace(old, new)
            count += n

    # 正则替换
    for pattern, replacement in REGEX_SUBS:
        new_content = pattern.sub(replacement, content)
        if new_content != content:
            count += len(pattern.findall(content))
            content = new_content

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return count
    return 0


def main():
    base = "/Users/ericbi/WorkBuddy/artx/artx-test-main/client/src"
    targets = []
    for root, dirs, files in os.walk(base):
        # 跳过测试文件
        for fname in files:
            if fname.endswith(('.tsx', '.ts', '.css')) and '.test.' not in fname:
                targets.append(os.path.join(root, fname))

    total_files = 0
    total_replaced = 0
    for path in sorted(targets):
        n = process_file(path)
        if n > 0:
            rel = path.replace(base + '/', '')
            print(f"  ✅ {n:3d}  {rel}")
            total_files += 1
            total_replaced += n

    print(f"\n📊 修改文件: {total_files}，共替换: {total_replaced} 处")

    # 统计剩余
    import subprocess
    result = subprocess.run(
        ['grep', '-r', 'oklch', base, '--include=*.tsx', '--include=*.ts', '--include=*.css',
         '-l', '--exclude=*.test.*'],
        capture_output=True, text=True
    )
    remaining_files = [l for l in result.stdout.strip().split('\n') if l and '.test.' not in l]
    if remaining_files:
        print(f"\n⚠️  仍有 oklch 残留的文件 ({len(remaining_files)} 个):")
        for f in remaining_files:
            cnt = subprocess.run(['grep', '-c', 'oklch', f], capture_output=True, text=True)
            print(f"   {cnt.stdout.strip():4s}  {f.replace(base+'/', '')}")
    else:
        print("\n🎉 所有非测试文件的 oklch 已全部替换完成！")


if __name__ == '__main__':
    main()
