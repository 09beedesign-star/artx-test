#!/usr/bin/env python3
"""
变异自证：action-surface-tokens.test.ts 的每条契约必须能被杀死。
"""
import subprocess, sys, os
from pathlib import Path

ROOT = Path("/Users/ericbi/WorkBuddy/artx/artx-test-main")
VITEST = "node_modules/.bin/vitest"
TEST = "client/src/lib/action-surface-tokens.test.ts"

def run_test():
    r = subprocess.run([VITEST, "run", TEST], capture_output=True, text=True,
                       cwd=ROOT, timeout=90,
                       env={**os.environ, "NODE": "/Users/ericbi/.workbuddy/binaries/node/versions/20.18.0/bin/node"})
    out = r.stdout
    if "failed" in out or "FAIL" in out:
        return "RED"
    if "passed" in out:
        return "GREEN"
    return "UNKNOWN"

# (文件, old, new, 说明, 期望命中次数)
MUTATIONS = [
    ("client/src/index.css", "--artx-action-fg: #161616;", "--artx-action-fg: #C5ED47;", "线框文字色改回品牌绿", 1),
    ("client/src/index.css", "  --artx-action-fg: #ffffff;\n  --artx-action-border: rgba(255,255,255,0.55);",
     "  --artx-action-fg: #161616;\n  --artx-action-border: rgba(22,22,22,0.55);", "深色主题反相失效", 1),
    ("client/src/index.css", "  --artx-action-ondark-fg: #ffffff;\n", "", "删掉深色浮层专用变量", 1),
    ("client/src/lib/action-surface-tokens.ts",
     '  background: "var(--artx-action-bg)",\n  color: "var(--artx-action-fg)",',
     '  background: "var(--artx-action-active-bg)",\n  color: "var(--artx-action-active-fg)",',
     "常态线框偷换成实心", 1),
    ("client/src/lib/action-surface-tokens.ts",
     '  background: "var(--artx-action-active-bg)",\n  color: "var(--artx-action-active-fg)",',
     '  background: "var(--artx-action-bg)",\n  color: "var(--artx-action-fg)",',
     "选中态与未选中态变成同款（选不出来）", 1),
    ("client/src/lib/action-surface-tokens.ts",
     '"inline-flex items-center justify-center rounded-full transition-colors"',
     '"inline-flex items-center justify-center transition-colors"', "纯文字按钮丢掉全圆角", 1),
    ("client/src/components/ecommerce/EcommerceWorkspace.tsx",
     'style={ACTION_OUTLINE_STYLE}', 'style={{ color: lime }}', "AI 帮写改回绿字（第一次出现）", 1),
    ("client/src/components/ecommerce/EcommerceWorkspace.tsx",
     '    ? ACTION_ACTIVE_STYLE', '    ? { background: "rgba(178,237,154,0.25)", color: lime }',
     "chip 选中态改回浅绿", 1),
    ("client/src/components/ui/switch.tsx",
     'type SwitchTone = "default";', 'type SwitchTone = "default" | "lime";', "lime 档复活", 1),
    ("client/src/lib/memory-switch-tokens.ts",
     'MEMORY_SWITCH_TONE = "default"', 'MEMORY_SWITCH_TONE = "lime"', "记忆开关 tone 改回 lime", 1),
    ("client/src/components/ecommerce/shared.ts",
     'export const LIME = "#c5ed71"', 'export const LIME = "#161616"', "误伤：纯展示 LIME 被改黑", 1),
    ("client/src/components/announcement/AnnouncementModal.tsx",
     'background: ACCENT_LIME,', 'background: "#161616",', "误伤：公告装饰竖条被改黑", 1),
    ("client/src/components/layout/AppShell.tsx",
     '"var(--artx-action-bg)"', '"#C5ED47"', "误伤：AppShell 按钮改回绿底", 1),
    ("client/src/pages/GreenTestPage.tsx",
     'var(--color-brand-green-light)', 'var(--artx-action-bg)', "误伤：演示色板页被批量替换", 1),
]

def main():
    originals = {}
    for f, *_ in MUTATIONS:
        p = ROOT / f
        if f not in originals:
            originals[f] = p.read_text()

    try:
        results = []
        for f, old, new, label, expected in MUTATIONS:
            p = ROOT / f
            src = p.read_text()
            cnt = src.count(old)
            if cnt < expected:
                print(f"  ⚠️ 锚点命中 {cnt}，期望 ≥{expected}，跳过: {label}")
                results.append("SKIP")
                continue
            p.write_text(src.replace(old, new, expected))
            status = run_test()
            # 恢复该文件
            p.write_text(originals[f])
            icon = "🔴" if status == "RED" else "🟢" if status == "GREEN" else "❓"
            print(f"  {icon} {label}: {status}")
            results.append(status)
    finally:
        for f, text in originals.items():
            (ROOT / f).write_text(text)

    red = results.count("RED")
    green = results.count("GREEN")
    skip = results.count("SKIP")
    unknown = results.count("UNKNOWN") + results.count("❓")
    print(f"\n结果: {red} 红 / {green} 绿 / {skip} 跳过 / {unknown} 未知（共 {len(results)} 条）")
    if green or unknown:
        print("⚠️ 有存活或状态不明的变异，测试需要收紧！")
        sys.exit(1)
    if skip:
        print("⚠️ 有跳过的变异，锚点需要更新！")
        sys.exit(1)
    print("✅ 全部变异被杀死，测试有效！")

if __name__ == "__main__":
    main()
