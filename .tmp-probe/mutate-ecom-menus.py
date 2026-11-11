#!/usr/bin/env python3
"""电商画布浅色菜单测试 · 变异自证。

每条变异都把实现改回一种「真实可能发生的倒退」，跑同一个测试文件，
打印被抓红的断言 fullName 清单，当场还原源码。
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEST = "client/src/components/ecommerce/ecommerce-light-menus.test.ts"
OUT = "/tmp/ecom-menu-mutation.json"

MUTATIONS = [
    {
        "name": "M1 light 模型下拉底色退回黑色（本次事故原样）",
        "file": "client/src/components/canvas/model-popover-tokens.ts",
        "old": '      background: "#ffffff",\n      border: "rgba(20,20,36,0.11)",',
        "new": '      background: "#161616",\n      border: "rgba(20,20,36,0.11)",',
    },
    {
        "name": "M2 light 品牌图标退回白色（白底白图标）",
        "file": "client/src/components/canvas/model-popover-tokens.ts",
        "old": '      icon: "rgba(20,20,36,0.88)",',
        "new": '      icon: "#FFFFFF",',
    },
    {
        "name": "M3 浅色预设菜单底色退回深灰",
        "file": "client/src/components/ecommerce/shared.ts",
        "old": '  return {\n    background: "#ffffff",\n    border: `1px solid ${border}`,\n    boxShadow: "0 12px 32px rgba(20,20,36,0.12)",',
        "new": '  return {\n    background: "rgba(42, 42, 42, 0.8)",\n    border: `1px solid ${border}`,\n    boxShadow: "0 12px 32px rgba(20,20,36,0.12)",',
    },
    {
        "name": "M4 工作台漏传 popoverTheme",
        "file": "client/src/components/ecommerce/EcommerceWorkspace.tsx",
        "old": '                popoverTheme={isDark ? "dark" : "light"}\n',
        "new": "",
    },
    {
        "name": "M5 页面漏传 isDark 给预设面板",
        "file": "client/src/pages/EcommerceCanvasPage.tsx",
        "old": "              palette={palette}\n              isDark={isDark}\n              draft={draft}",
        "new": "              palette={palette}\n              draft={draft}",
    },
    {
        "name": "M6 ModelSelector 面板底色绕开 token",
        "file": "client/src/components/canvas/ModelSelector.tsx",
        "old": "              background: pop.background,",
        "new": '              background: "#161616",',
    },
    {
        "name": "M7 预设菜单底色绕开 token（硬编码回归）",
        "file": "client/src/components/ecommerce/EcommerceCanvasPresetPanel.tsx",
        "old": "            background: menu.background,",
        "new": '            background: "rgba(42, 42, 42, 0.8)",',
    },
    {
        "name": "M8 只把「更新」按钮的强调色改回绿色（漏一个出口）",
        "file": "client/src/components/ecommerce/EcommerceCanvasPresetPanel.tsx",
        "old": '                        style={{ color: menu.accentColor }}',
        "new": '                        style={{ color: "rgb(197,237,71)" }}',
    },
]


def run_tests():
    proc = subprocess.run(
        ["npx", "vitest", "run", TEST, "--no-file-parallelism",
         "--reporter=json", f"--outputFile={OUT}"],
        cwd=ROOT, capture_output=True, text=True,
    )
    out = pathlib.Path(OUT)
    if not out.exists():
        print("  !! 没有产出 JSON：测试可能压根没跑")
        print(proc.stdout[-1500:], proc.stderr[-1500:])
        return None
    data = json.loads(out.read_text())
    out.unlink()
    failed = [
        a["fullName"]
        for res in data.get("testResults", [])
        for a in res.get("assertionResults", [])
        if a.get("status") == "failed"
    ]
    return failed


def main():
    killed = 0
    for m in MUTATIONS:
        path = ROOT / m["file"]
        original = path.read_bytes()
        text = original.decode()
        n = text.count(m["old"])
        if n != 1:
            print(f"{m['name']}: ANCHOR_{'MISSING' if n == 0 else 'AMBIGUOUS'} (命中 {n} 次) —— 此条无效")
            continue
        path.write_text(text.replace(m["old"], m["new"], 1))
        if path.read_bytes() == original:
            print(f"{m['name']}: 文件没变，变异无效")
            continue
        try:
            failed = run_tests()
            if failed is None:
                print(f"{m['name']}: 无有效结果")
            elif failed:
                killed += 1
                print(f"{m['name']}: ✅ 被抓红 {len(failed)} 条")
                for f in failed:
                    print("     -", f)
            else:
                print(f"{m['name']}: ❌ 恒绿（断言没守住）")
        finally:
            path.write_bytes(original)
            assert path.read_bytes() == original, f"还原失败：{m['file']}"
    print(f"\n结果：{killed}/{len(MUTATIONS)} 条变异被抓红")
    sys.exit(0 if killed == len(MUTATIONS) else 1)


if __name__ == "__main__":
    main()
