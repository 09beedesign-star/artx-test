#!/usr/bin/env python3
"""
画布两大文件：把「可点击绿色」逐出口接到 --artx-action-* 变量。

为什么用裸 CSS 变量而不是 import 常量：
  这两个文件里同一个 accent / colors.accent 常量同时喂按钮、图标、边框、
  状态块，且 style 对象结构各异。用 spread 常量会覆盖掉同对象里的其它字段，
  风险高。只替换「颜色值表达式」保持结构不变最安全；色值本体仍然只在
  index.css 的 --artx-action-* 定义一份，事实源唯一。

安全策略：
- 按原始行号定位（一次性处理，插入新行不影响其它行号）
- 每行断言包含 old 子串，否则整脚本中止、不落盘
- 只列可点击出口；图标 / 徽章 / 状态块 / focus 描边 / 滑块 / 3D 装饰不列
"""
import sys
from pathlib import Path

ROOT = Path("/Users/ericbi/WorkBuddy/artx/artx-test-main/client/src/components/canvas")

A = "var(--artx-action-active-bg)"
AF = "var(--artx-action-active-fg)"
AB = "var(--artx-action-active-border)"
O = "var(--artx-action-bg)"
OF = "var(--artx-action-fg)"
OB = "var(--artx-action-border)"

OUTLINE_STYLE = (
    '{{ color: "%s", background: "%s", border: "1px solid %s" }}' % (OF, O, OB)
)

EDITS = {
    "SmartCommerceProductDialog.tsx": [
        # 局部事实源保留给纯展示（图标/状态块/装饰边框），加注释防止再被用到按钮上
        (640, '    accent: "#C5ED47",',
         '    // ⚠️ 只喂纯展示（图标、状态块、装饰边框）；可点击元素已统一走\n'
         '    //    --artx-action-* 黑白色系，不要再把本值用到按钮上。\n'
         '    accent: "#C5ED47",'),
        # 1) 模式/平台预设选项
        (1585, 'color: colors.text,', 'color: active ? "%s" : colors.text,' % AF),
        (1586, 'active ? "rgba(197,237,71,0.13)" : colors.surface',
         'active ? "%s" : colors.surface' % A),
        (1587, 'active ? "rgba(197,237,71,0.58)" : colors.border',
         'active ? "%s" : colors.border' % AB),
        # 2) 分辨率档
        (1623, 'color: colors.text,',
         'color: !selectedEcommerce && resolution === item ? "%s" : colors.text,' % AF),
        (1626, '"rgba(197,237,71,0.13)"', '"%s"' % A),
        (1628, '!selectedEcommerce && resolution === item ? "rgba(197,237,71,0.58)" : colors.border',
         '!selectedEcommerce && resolution === item ? "%s" : colors.border' % AB),
        # 3) 背景模式 tab（原来没有边框，补成线框按钮）
        (1679, 'color: active ? "#172000" : colors.muted,',
         'color: active ? "%s" : colors.muted,' % AF),
        (1680, 'background: active ? colors.accent : "transparent",',
         'background: active ? "%s" : "%s",\n'
         '                        border: `1px solid ${active ? "%s" : "%s"}`,' % (A, O, AB, OB)),
        # 4) 风格关键词 chip
        (1902, 'color: used ? "#172000" : colors.text,',
         'color: used ? "%s" : colors.text,' % AF),
        (1903, 'background: used ? colors.accent : colors.surfaceStrong,',
         'background: used ? "%s" : colors.surfaceStrong,' % A),
        (1904, 'used ? "rgba(197,237,71,0.75)" : colors.border',
         'used ? "%s" : colors.border' % AB),
        # 5) 「查看全部」纯文字 → 黑框线体按钮
        (1996, 'style={{ color: colors.accent, background: "transparent" }}',
         'style=' + OUTLINE_STYLE),
        # 6) 构图选项
        (2172, 'color: active ? colors.text : colors.muted,',
         'color: active ? "%s" : colors.muted,' % AF),
        (2173, 'active ? "rgba(197,237,71,0.13)" : colors.surface',
         'active ? "%s" : colors.surface' % A),
        (2174, 'active ? "rgba(197,237,71,0.58)" : colors.border',
         'active ? "%s" : colors.border' % AB),
        # 7) 尺寸预设（原来没有 color，黑底后文字会看不见，必须补）
        (2333, 'background: active',
         'color: active ? "%s" : colors.text,\n                                    background: active' % AF),
        (2334, '"rgba(197,237,71,0.14)"', '"%s"' % A),
        (2336, 'active ? "rgba(197,237,71,0.75)" : colors.border',
         'active ? "%s" : colors.border' % AB),
        # 8) 生成数量 1-9
        (2416, 'color: count === item ? "#172000" : colors.text,',
         'color: count === item ? "%s" : colors.text,' % AF),
        (2417, 'background: count === item ? colors.accent : colors.surface,',
         'background: count === item ? "%s" : colors.surface,' % A),
        (2418, 'count === item ? "rgba(197,237,71,0.75)" : colors.border',
         'count === item ? "%s" : colors.border' % AB),
        # 9) 「更新预设」纯文字 → 黑框线体按钮
        (2616, 'style={{ color: colors.accent }}',
         'style=' + OUTLINE_STYLE),
        # 10) 「生成产品图」主按钮（用户确认主按钮一并改）
        (2667, 'style={{ color: "#172000", background: colors.accent }}',
         'style=' + OUTLINE_STYLE),
    ],
}


def main():
    staged = {}
    for fname, edits in EDITS.items():
        path = ROOT / fname
        lines = path.read_text().split("\n")
        orig = list(lines)
        for lineno, old, new in edits:
            idx = lineno - 1
            if idx >= len(lines) or old not in lines[idx]:
                print(f"❌ {fname} L{lineno}: 找不到锚点 {old[:70]!r}")
                print(f"   实际内容: {lines[idx][:160] if idx < len(lines) else '<越界>'}")
                sys.exit(1)
            if lines[idx].count(old) != 1:
                print(f"❌ {fname} L{lineno}: 锚点在一行内出现 {lines[idx].count(old)} 次")
                sys.exit(1)
            lines[idx] = lines[idx].replace(old, new, 1)
        staged[path] = ("\n".join(orig), "\n".join(lines))
        print(f"✅ {fname}: {len(edits)} 处替换")

    for path, (_, text) in staged.items():
        path.write_text(text)
    print(f"\n已落盘 {len(staged)} 个文件")


if __name__ == "__main__":
    main()
