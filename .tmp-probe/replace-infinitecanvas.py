import re

path = "client/src/components/canvas/InfiniteCanvas.tsx"
with open(path, "r") as f:
    content = f.read()

# 精确字符串替换
exact = [
    # 紫色品牌色
    ('"oklch(0.74 0.20 290)"', '"#161616"'),
    ('"oklch(0.82 0.16 290)"', '"#161616"'),
    ('"oklch(0.72 0.18 290)"', '"#161616"'),
    ('"oklch(0.65 0.22 290)"', '"#161616"'),
    ('"oklch(0.46 0.18 290)"', '"#555555"'),
    # 带透明度的紫色
    ('"oklch(0.64 0.22 290 / 0.55)"', '"rgba(22,22,22,0.55)"'),
    ('"oklch(0.64 0.22 290 / 0.48)"', '"rgba(22,22,22,0.48)"'),
    ('"oklch(0.62 0.22 290 / 45%)"', '"rgba(22,22,22,0.45)"'),
    ('"oklch(0.58 0.22 290 / 0.18)"', '"rgba(22,22,22,0.18)"'),
    ('"oklch(0.65 0.22 290 / 0.72)"', '"rgba(22,22,22,0.72)"'),
    ('"oklch(0.65 0.22 290 / 0.18)"', '"rgba(22,22,22,0.18)"'),
    ('"oklch(0.65 0.22 290 / 0.25)"', '"rgba(22,22,22,0.25)"'),
    # 中性暗色
    ('"oklch(0.13 0.015 270)"', '"#0d0d0d"'),
    ('"oklch(0.22 0.015 270)"', '"#262627"'),
    ('"oklch(0.16 0.018 270)"', '"#1a1a1a"'),
    ('"oklch(0.20 0.01 270)"', '"#2a2a2a"'),
    ('"oklch(0.28 0.01 270)"', '"#333333"'),
    # 中性亮色
    ('"oklch(0.99 0.004 270)"', '"#ffffff"'),
    ('"oklch(0.98 0.004 270)"', '"#f8f8f8"'),
    ('"oklch(0.82 0.008 270)"', '"#cccccc"'),
    ('"oklch(0.74 0.01 270)"', '"#99999e"'),
    ('"oklch(0.58 0.008 270)"', '"#777472"'),
    ('"oklch(0.18 0.008 270)"', '"#262627"'),
]

for old, new in exact:
    content = content.replace(old, new)

# 正则替换 - drop-shadow 滤镜
content = re.sub(
    r'filter:\s*"drop-shadow\(0 0 5px oklch\([^)]+\)\)"',
    'filter: "drop-shadow(0 0 5px rgba(22,22,22,0.4))"',
    content
)

# 正则替换 - 检测函数中的 oklch( 判断
content = re.sub(
    r'value\.startsWith\("oklch\("\)',
    'value.startsWith("oklch(")',  # 保持不变,这是代码逻辑判断
    content
)

# 三层 box-shadow 中的紫色
content = re.sub(
    r'0 0 0 2px oklch\([^)]+290[^)]+\)',
    '0 0 0 2px rgba(22,22,22,0.72)',
    content
)
content = re.sub(
    r'0 0 0 6px oklch\([^)]+290[^)]+\)',
    '0 0 0 6px rgba(22,22,22,0.18)',
    content
)

# border 中的紫色选中态
content = re.sub(
    r'border:\s*`2px solid \$\{[^}]*"oklch\([^)]+290[^)]+\)"[^}]*\}`',
    'border: `2px solid ${pc === safeColor ? "#161616" : "transparent"}`',
    content
)

with open(path, "w") as f:
    f.write(content)

remaining = content.count("oklch")
print(f"Done. Remaining oklch in InfiniteCanvas.tsx: {remaining}")
