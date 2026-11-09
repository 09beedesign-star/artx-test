#!/usr/bin/env python3
"""
第三轮：清理剩余 52 处 oklch 残留
处理脚本未覆盖的边缘情况（下划线语法、注释中的、特殊色相）
"""
import re, os

# 精确替换（残留的特定模式）
EXACT = [
    # InviteDialog — 黄色系（60-75色相）改为中性暖灰
    ("oklch(0.65 0.15 60 / 12%)", "rgba(102,102,102,0.12)"),
    ("oklch(0.95 0.06 75)", "#f5f6f8"),
    ("oklch(0.7 0.15 65 / 30%)", "rgba(102,102,102,0.30)"),
    ("oklch(0.75 0.08 70)", "#aaaaaa"),
    ("oklch(0.45 0.09 60)", "#666666"),

    # Sidebar — 下划线语法 + 透明度
    ("oklch(1 0 0 / 6%)", "rgba(255,255,255,0.06)"),
    ("oklch(1 0 0 / 9%)", "rgba(255,255,255,0.09)"),
    ("oklch(1 0 0 / 8%)", "rgba(255,255,255,0.08)"),
    ("oklch(1 0 0 / 10%)", "rgba(255,255,255,0.10)"),
    ("oklch(1 0 0 / 15%)", "rgba(255,255,255,0.15)"),
    ("oklch(1 0 0 / 6%)", "rgba(255,255,255,0.06)"),
    # 下划线语法（Tailwind 风格）
    ("oklch(0.82_0.012_270)", "#bbbbbb"),
    ("oklch(0.80_0.01_270)", "#bbbbbb"),

    # CanvasNodes — 色相 200/60/330 低饱和 → 深灰
    ("oklch(0.20 0.06 200)", "#262627"),
    ("oklch(0.22 0.06 60)", "#262627"),
    ("oklch(0.20 0.04 330)", "#262627"),

    # InfiniteCanvas — 注释中的不替换，但代码中的要替换
    ("oklch(0.42 0.012 255)", "#666666"),
    ("oklch(0.94 0.006 255)", "#e6e3df"),
    ("oklch(0.98 0.003 255)", "#f5f6f8"),
    ("oklch(0.995 0.002 80 / 0.98)", "rgba(245,246,248,0.98)"),
    ("oklch(0.64 0.010 255)", "#888888"),
    ("oklch(0.71 0.010 255)", "#aaaaaa"),
    ("oklch(0.13 0.005 270)", "#0d0d0d"),

    # CropEditor / RotateEditor
    ("oklch(0.50 0.012 255)", "#777472"),

    # InspirationCard — 渐变里的深色
    ("oklch(0.18 0.04 205)", "#1a1a1a"),

    # billing-theme
    ("oklch(1 0 0 / 9%)", "rgba(255,255,255,0.09)"),

    # social-media-presets — tone 值
    ("oklch(0.46 0.03 255)", "#666666"),
    ("oklch(0.52 0.04 250)", "#666666"),
    ("oklch(0.58 0.04 245)", "#777472"),

    # InspirationPage
    ("oklch(0.18 0.04 205)", "#1a1a1a"),

    # ProfilePage
    ("oklch(1 0 0 / 9%)", "rgba(255,255,255,0.09)"),
]

# 正则兜底
REGEX = [
    # oklch(1 0 0 / X%) → rgba(255,255,255,X)
    (re.compile(r'oklch\(\s*1\s+0\s+0\s*/\s*([\d.]+)%\s*\)'),
     lambda m: f"rgba(255,255,255,{int(float(m.group(1))/100)}.{m.group(1).split('.')[1] if '.' in m.group(1) else '0'})"),

    # oklch(1 0 0 / X) → rgba(255,255,255,X)
    (re.compile(r'oklch\(\s*1\s+0\s+0\s*/\s*([\d.]+)\s*\)'),
     lambda m: f"rgba(255,255,255,{m.group(1)})"),

    # oklch(0 0 0 / X%) → rgba(0,0,0,X)
    (re.compile(r'oklch\(\s*0\s+0\s+0\s*/\s*([\d.]+)%\s*\)'),
     lambda m: f"rgba(0,0,0,0.{m.group(1).split('.')[1] if '.' in m.group(1) else '0'})"),

    # oklch(L C H) 低饱和蓝色系 255 → 灰
    (re.compile(r'oklch\((\d*\.?\d+)\s+(0\.0\d+)\s+2[45]\d\)'),
     lambda m: _l2gray(float(m.group(1)))),

    # 下划线语法 oklch(L_C_H)
    (re.compile(r'oklch\((\d*\.?\d+)_(\d*\.?\d+)_(\d+(?:\.\d+)?)\)'),
     lambda m: _l2gray(float(m.group(1)))),

    # 任何剩余 oklch(X X X / X%) → 按亮度转灰
    (re.compile(r'oklch\((\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d+(?:\.\d+)?)\s*/\s*([\d.]+)%\s*\)'),
     lambda m: f"rgba({_hex_rgb(_l2gray(float(m.group(1))))},{int(float(m.group(4))/100)}.{m.group(4).split('.')[1] if '.' in m.group(4) else '0'})"),

    # oklch(X X X / alpha) 不带 % → 按亮度转灰 + alpha
    (re.compile(r'oklch\((\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d+(?:\.\d+)?)\s*/\s*([\d.]+)\)'),
     lambda m: f"rgba({_hex_rgb(_l2gray(float(m.group(1))))},{m.group(4)})"),

    # 兜底：任何 oklch(X X X) → 灰
    (re.compile(r'oklch\((\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d+(?:\.\d+)?)\)'),
     lambda m: _l2gray(float(m.group(1)))),
]


def _l2gray(l: float) -> str:
    if l <= 0.05: return "#000000"
    if l <= 0.12: return "#0d0d0d"
    if l <= 0.18: return "#1a1a1a"
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


def _hex_rgb(h: str) -> str:
    h = h.lstrip('#')
    return f"{int(h[0:2],16)},{int(h[2:4],16)},{int(h[4:6],16)}"


def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    count = 0
    for old, new in EXACT:
        if old in content:
            n = content.count(old)
            content = content.replace(old, new)
            count += n
    for pattern, replacement in REGEX:
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

    import subprocess
    result = subprocess.run(
        ['grep', '-r', 'oklch', base, '--include=*.tsx', '--include=*.ts', '--include=*.css',
         '-l', '--exclude=*.test.*'],
        capture_output=True, text=True
    )
    remaining = [l for l in result.stdout.strip().split('\n') if l and '.test.' not in l]
    if remaining:
        print(f"\n⚠️  仍有残留 ({len(remaining)} 个):")
        for f in remaining:
            cnt = subprocess.run(['grep', '-c', 'oklch', f], capture_output=True, text=True)
            print(f"   {cnt.stdout.strip():4s}  {f.replace(base+'/', '')}")
    else:
        print("\n🎉 全部清理完成！")


if __name__ == '__main__':
    main()
