#!/usr/bin/env python3
"""黑色返回按钮样式锁的变异自证：每条变异都必须让测试报红。"""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
E = "client/src/components/ecommerce/"
TOKEN = ROOT / (E + "back-button-tokens.ts")
HISTORY = ROOT / (E + "EcommerceHistory.tsx")
GALLERY = ROOT / (E + "EcommerceTemplateGallery.tsx")
DETAIL = ROOT / (E + "EcommerceTemplateDetail.tsx")
WORKSPACE = ROOT / (E + "EcommerceWorkspace.tsx")
SEND = ROOT / "client/src/components/ui/send-action-button.tsx"
SHELL = ROOT / "client/src/components/layout/AppShell.tsx"

TEST = "client/src/components/ecommerce/ecommerce-back-button.test.ts"

OLD_STYLE = 'style={{ border: `1px solid ${palette.border}`, color: palette.sub }}'

# (说明, 文件, 原文, 变异为)
MUTATIONS = [
    ("token 底色改白", TOKEN, 'background: "#161616"', 'background: "#ffffff"'),
    ("token 文字改黑", TOKEN, 'color: "#ffffff"', 'color: "#161616"'),
    ("token 描边去掉", TOKEN, 'border: "1px solid rgba(255,255,255,0.12)"', 'border: "none"'),
    ("token 圆角改方", TOKEN, 'items-center justify-center rounded-full px-3', 'items-center justify-center rounded-md px-3'),
    ("token hover 用 bg（内联色会顶掉）", TOKEN, 'hover:opacity-90 active:scale-95', 'hover:bg-[#333333] active:scale-95'),
    ("生成记录页返回按钮改回旧样式", HISTORY, "style={ECOMMERCE_BACK_BUTTON_STYLE}", OLD_STYLE),
    ("模板库页返回按钮改回旧圆角", GALLERY, 'className={`ml-auto ${ECOMMERCE_BACK_BUTTON_CLASS}`}', 'className="ml-auto rounded-md px-2.5 py-1"'),
    ("模板详情页返回按钮改回旧样式", DETAIL, "style={ECOMMERCE_BACK_BUTTON_STYLE}", OLD_STYLE),
    ("生成结果区返回按钮改回旧样式", WORKSPACE, "style={ECOMMERCE_BACK_BUTTON_STYLE}", OLD_STYLE),
    ("生成结果区漏掉 import", WORKSPACE, 'import { ECOMMERCE_BACK_BUTTON_CLASS, ECOMMERCE_BACK_BUTTON_STYLE } from "./back-button-tokens";\n', ""),
    ("出口枚举多出一份重复接线", HISTORY, 'import { useEffect, useState } from "react";', 'import { useEffect, useState } from "react";\nconst STALE = "style={ECOMMERCE_BACK_BUTTON_STYLE}";'),
    ("全站发送按钮黑底改色（跨文件锁）", SEND, 'background: "#161616",', 'background: "#222222",'),
    ("侧栏开始创作用了别的黑（跨文件锁）", SHELL, 'background: "#161616",\n              color: "#ffffff",', 'background: "#161616",\n              color: "#eeeeee",'),
]

FILES = {TOKEN, HISTORY, GALLERY, DETAIL, WORKSPACE, SEND, SHELL}


def run_tests() -> bool:
    proc = subprocess.run(
        ["npx", "vitest", "run", TEST, "--no-file-parallelism", "--reporter=basic"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return proc.returncode == 0


def main():
    originals = {p: p.read_text() for p in FILES}
    assert run_tests(), "基线不是全绿，先修好再谈变异自证"
    print("基线：全绿 ✓")
    killed = 0
    try:
        for label, path, old, new in MUTATIONS:
            src = originals[path]
            assert old in src, f"变异锚点找不到：{label} / {old[:50]}"
            path.write_text(src.replace(old, new, 1))
            ok = not run_tests()
            print(f"{'KILLED ✓' if ok else 'SURVIVED ✗'}  {label}")
            killed += int(ok)
            path.write_text(src)
    finally:
        for p, src in originals.items():
            p.write_text(src)
    print(f"\n{killed}/{len(MUTATIONS)} 条变异被抓红；源码已还原")
    if killed != len(MUTATIONS):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
