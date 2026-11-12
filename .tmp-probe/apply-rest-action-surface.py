#!/usr/bin/env python3
"""
最后一批：其余 10 个页面/框架的 17 个可点击绿色出口 + 上游 Switch token 收口。

- 未改动过的文件走「行号 + 行内唯一子串」
- 已改动过的文件（InfiniteCanvas / 测试）走「全局唯一子串」
- 纯展示绿色（图标、装饰条、tag 文字、滑块 accent、focus 描边、状态文字）不动
"""
import sys
from pathlib import Path

ROOT = Path("/Users/ericbi/WorkBuddy/artx/artx-test-main/client/src")
OFG = "var(--artx-action-fg)"
OBG = "var(--artx-action-bg)"
OBR = "var(--artx-action-border)"
AFG = "var(--artx-action-active-fg)"
ABG = "var(--artx-action-active-bg)"
ABR = "var(--artx-action-active-border)"

OUTLINE = '{{ color: "%s", background: "%s", border: "1px solid %s" }}' % (OFG, OBG, OBR)

# ---------- A. 按行号替换 ----------
LINE_EDITS = {
    "components/workspace/TopBar.tsx": [
        (467, 'bg-[#C5ED47] px-3 text-sm font-medium text-[#1a2209] transition-colors hover:bg-[#d1f65f]',
         'px-3 text-sm font-medium transition-colors'),
        (469, 'border: "0",',
         'color: "%s", background: "%s", border: "1px solid %s",' % (OFG, OBG, OBR)),
        (544, 'background: "#C5ED47",', 'background: "%s",' % OBG),
        (545, 'color: isDark ? "#0a3d29" : "#FFFFFF",',
         'color: "%s", border: "1px solid %s",' % (OFG, OBR)),
        (837, 'background: "#C5ED47",', 'background: "%s",' % OBG),
        (838, 'color: "#1a2209",', 'color: "%s", border: "1px solid %s",' % (OFG, OBR)),
    ],
    "components/layout/AppShell.tsx": [
        (730, 'style={{ background: "#C5ED47", color: "#10130A", fontWeight: 720, opacity: apiKeyLoading ? 0.65 : 1 }}',
         'style={{ background: "%s", color: "%s", border: "1px solid %s", fontWeight: 720, opacity: apiKeyLoading ? 0.65 : 1 }}' % (OBG, OFG, OBR)),
    ],
    "components/announcement/AnnouncementModal.tsx": [
        # ACCENT_LIME 常量保留给纯展示（装饰竖条 / tag 文字），只改按钮这一处
        (39, '/** 右下角按钮 / 左下角标签共用的荧光绿（取自设计稿 #BAFF2E） */',
         '/** ⚠️ 仅供纯展示（装饰竖条 / tag 文字）；右下角按钮已改黑框线体按钮。 */'),
        (110, 'border: "none",', 'border: "1px solid %s",' % OBR),
        (111, 'background: ACCENT_LIME,', 'background: "%s",' % OBG),
        (112, 'color: "#111",', 'color: "%s",' % OFG),
    ],
    "components/inspiration/InspirationPromptDialog.tsx": [
        # activeBg / brandGreenText 常量保留给纯展示提示文案；只改分组 tab 调用点
        (154, 'activeGroup === group ? activeBg : "transparent"',
         'activeGroup === group ? "%s" : "%s"' % (ABG, OBG)),
        (154, 'activeGroup === group ? "rgba(197,237,71,0.48)" : border',
         'activeGroup === group ? "%s" : "%s"' % (ABR, OBR)),
        (154, 'activeGroup === group ? brandGreenText : sub',
         'activeGroup === group ? "%s" : sub' % AFG),
        (173, 'style={{ background: "#C5ED47", color: "#111", fontWeight: 700 }}',
         'style={{ background: "%s", color: "%s", border: "1px solid %s", fontWeight: 700 }}' % (OBG, OFG, OBR)),
        (201, 'style={{ background: "#C5ED47" }}', 'style=' + OUTLINE),
        (205, 'style={{ color: "#111" }}', 'style={{ color: "%s" }}' % OFG),
    ],
    "components/canvas/PicwishBackgroundSelector.tsx": [
        (59, 'style={{ background:',
         'style={{ color: category === item ? "%s" : "inherit", background:' % AFG),
        (59, 'category === item ? "rgba(197,237,71,0.16)" : surface',
         'category === item ? "%s" : surface' % ABG),
        (59, 'category === item ? "rgba(197,237,71,0.62)" : border',
         'category === item ? "%s" : "%s"' % (ABR, OBR)),
    ],
    "pages/HomePage.tsx": [
        (865, 'className="artx-green-text text-sm font-semibold underline decoration-[var(--color-brand-green)]/60 underline-offset-4 transition-colors hover:opacity-80"',
         'className="rounded-full px-3 py-1 text-sm font-semibold transition-colors hover:opacity-80"'),
        (866, "style={{ color: 'var(--color-brand-green-text)' }}", 'style=' + OUTLINE),
    ],
    "pages/CrossBorderCommercePage.tsx": [
        (303, 'style={{ background: "#c5ed47", color: "#111111" }}', 'style=' + OUTLINE),
    ],
    "pages/ProfilePage.tsx": [
        (438, 'style={{ background: "#C5ED47", color: "#111", letterSpacing: 0, textTransform: "none" }}',
         'style={{ background: "%s", color: "%s", border: "1px solid %s", letterSpacing: 0, textTransform: "none" }}' % (OBG, OFG, OBR)),
        (972, 'background: "#C5ED47",', 'background: "%s",' % OBG),
        (973, 'color: "#111827",', 'color: "%s", border: "1px solid %s",' % (OFG, OBR)),
        (974, 'boxShadow: "0 8px 24px rgba(197,237,71,0.22)",', 'boxShadow: "none",'),
    ],
    "pages/HelpPage.tsx": [
        (205, 'style={{ background: "#C5ED47", color: "#000", boxShadow: "0 14px 30px rgba(197,237,71,0.24)" }}',
         'style=' + OUTLINE),
    ],
    "pages/LongTermMemoryPage.tsx": [
        (308, 'style={{ background: "#C5ED47", color: "#111" }}', 'style=' + OUTLINE),
        (430, '? "#C5ED47" : c.card', '? "%s" : c.card' % OBG),
        (431, '? "#C5ED47" : LINE_IDLE', '? "%s" : LINE_IDLE' % OBR),
        (432, '? "#000" : TEXT_IDLE', '? "%s" : TEXT_IDLE' % OFG),
    ],
}

# ---------- B. 全局唯一子串替换（已改动过的文件 + 上游 token + 守旧测试） ----------
GLOBAL_EDITS = {
    "components/ui/switch.tsx": [
        ('type SwitchTone = "default" | "lime";', 'type SwitchTone = "default";'),
        ('  /** 激活态轨道色调：default = 黑，lime = 品牌绿 */',
         '  /** 激活态轨道色调：黑（深色主题反相为白）。品牌绿档已随全站黑白化移除。 */'),
        ('  lime: "data-[state=checked]:bg-[#C5ED47] dark:data-[state=checked]:bg-[#C5ED47]",\n', ''),
    ],
    "lib/memory-switch-tokens.ts": [
        ('黑药丸 `#161616` + 白色 Brain 图标 + `size="sm" tone="lime"` 的小开关。',
         '黑药丸 `#161616` + 白色 Brain 图标 + `size="sm"` 黑白轨道的小开关。'),
        ('export const MEMORY_SWITCH_TONE = "lime" as const;',
         'export const MEMORY_SWITCH_TONE = "default" as const;'),
    ],
    "components/canvas/InfiniteCanvas.tsx": [
        ('tone="lime"', 'tone="default"'),
    ],
    "components/ecommerce/ecommerce-memory-switch.style.test.ts": [
        ('expect(MEMORY_SWITCH_TONE).toBe("lime");', 'expect(MEMORY_SWITCH_TONE).toBe("default");'),
        ('it("开关走 sm/lime 常量，没有在调用方压轨道"', 'it("开关走 sm/default 常量，没有在调用方压轨道"'),
        ('it("switch.tsx 里 sm 与 lime 档还在（常量不是空指向）"',
         'it("switch.tsx 里 sm 档还在，且 lime 绿轨已退场"'),
        ("expect(sw).toContain('lime: \"data-[state=checked]:bg-[#C5ED47]');",
         "expect(sw).not.toContain('bg-[#C5ED47]');"),
    ],
    "components/canvas/composer-memory-switch.style.test.ts": [
        ('expect(pill).toContain(\'tone="lime"\');', 'expect(pill).toContain(\'tone="default"\');'),
    ],
}


def main():
    staged = {}
    for fname, edits in LINE_EDITS.items():
        path = ROOT / fname
        lines = path.read_text().split("\n")
        for lineno, old, new in edits:
            idx = lineno - 1
            if idx >= len(lines) or old not in lines[idx]:
                print(f"❌ {fname} L{lineno}: 找不到 {old[:75]!r}")
                print(f"   实际: {lines[idx][:180] if idx < len(lines) else '<越界>'}")
                sys.exit(1)
            lines[idx] = lines[idx].replace(old, new, 1)
        staged[path] = "\n".join(lines)
        print(f"✅ {fname}: {len(edits)} 处")

    for fname, edits in GLOBAL_EDITS.items():
        path = ROOT / fname
        src = staged.get(path, path.read_text())
        for old, new in edits:
            cnt = src.count(old)
            if cnt != 1:
                print(f"❌ {fname}: 子串命中 {cnt} 次（期望 1）: {old[:70]!r}")
                sys.exit(1)
            src = src.replace(old, new, 1)
        staged[path] = src
        print(f"✅ {fname}: {len(edits)} 处")

    for path, text in staged.items():
        path.write_text(text)
    print(f"\n已落盘 {len(staged)} 个文件")


if __name__ == "__main__":
    main()
