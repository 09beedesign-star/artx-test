#!/usr/bin/env python3
"""电商记忆提示条样式锁的变异自证：每条变异必须让测试报红，否则那条锁是摆设。"""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOKEN = ROOT / "client/src/lib/memory-switch-tokens.ts"
ECOM = ROOT / "client/src/components/ecommerce/EcommerceWorkspace.tsx"
CANVAS = ROOT / "client/src/components/canvas/InfiniteCanvas.tsx"

TESTS = [
    "client/src/components/ecommerce/ecommerce-memory-switch.style.test.ts",
    "client/src/components/ecommerce/EcommerceWorkspace.memory-notice.test.ts",
]

# (说明, 文件, 原文, 变异为, 作用域)
# ⚠️ InfiniteCanvas 有 3.7 万行，'? "#161616"' 在药丸之前就出现过。
#    不限定切片的话变异打在别处 = 等价变异，杀不掉不代表锁失效。
PILL = "canvas-pill"
MUTATIONS = [
    ("token 底色改回绿", TOKEN, 'background: "#161616"', 'background: "#B2ED9A"', None),
    ("token 文字改回绿", TOKEN, 'textColor: "#ffffff"', 'textColor: "#c5ed71"', None),
    ("token 图标改深灰", TOKEN, 'iconColor: "#ffffff"', 'iconColor: "#161616"', None),
    ("token 尺寸档改 default", TOKEN, 'MEMORY_SWITCH_SIZE = "sm"', 'MEMORY_SWITCH_SIZE = "default"', None),
    ("token 色调档改 default", TOKEN, 'MEMORY_SWITCH_TONE = "lime"', 'MEMORY_SWITCH_TONE = "default"', None),
    ("提示条底色改回绿浅底", ECOM, "background: MEMORY_SWITCH_SURFACE.background", 'background: "var(--color-brand-green-light)"', None),
    ("提示条文字改回绿", ECOM, "color: MEMORY_SWITCH_SURFACE.textColor,\n            }}", 'color: lime,\n            }}', None),
    ("Brain 图标色写死绿", ECOM, "style={{ color: MEMORY_SWITCH_SURFACE.iconColor }}", 'style={{ color: lime }}', None),
    ("去掉开关尺寸常量", ECOM, "                size={MEMORY_SWITCH_SIZE}\n", "", None),
    ("去掉开关色调常量", ECOM, "                tone={MEMORY_SWITCH_TONE}\n", "", None),
    ("圆角改回 rounded-md", ECOM, 'rounded-[var(--radius-pill)] px-3 py-1.5', 'rounded-md px-3 py-1.5', None),
    ("画布参照物黑底改色", CANVAS, '? "#161616"', '? "#222222"', PILL),
    ("画布参照物 tone 改 default", CANVAS, 'tone="lime"', 'tone="default"', PILL),
]


def mutate(src, old, new, scope):
    if scope == PILL:
        start = src.index("上下文记忆开关 —— 输入框右上角")
        end = src.index("{contextLabel && (", start)
        head, mid, tail = src[:start], src[start:end], src[end:]
        assert old in mid, f"药丸切片里找不到锚点：{old[:40]}"
        return head + mid.replace(old, new, 1) + tail
    assert old in src, f"变异锚点找不到：{old[:40]}"
    return src.replace(old, new, 1)


def run_tests() -> bool:
    proc = subprocess.run(
        ["npx", "vitest", "run", *TESTS, "--no-file-parallelism", "--reporter=basic"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return proc.returncode == 0


def main():
    originals = {p: p.read_text() for p in {TOKEN, ECOM, CANVAS}}
    assert run_tests(), "基线不是全绿，先修好再谈变异自证"
    print("基线：全绿 ✓")
    killed = 0
    try:
        for label, path, old, new, scope in MUTATIONS:
            path.write_text(mutate(originals[path], old, new, scope))
            ok = not run_tests()
            print(f"{'KILLED ✓' if ok else 'SURVIVED ✗'}  {label}")
            killed += int(ok)
            path.write_text(originals[path])
    finally:
        for p, src in originals.items():
            p.write_text(src)
    print(f"\n{killed}/{len(MUTATIONS)} 条变异被抓红；源码已还原")
    if killed != len(MUTATIONS):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
