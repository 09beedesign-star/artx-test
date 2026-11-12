#!/usr/bin/env python3
"""
InfiniteCanvas.tsx：16 个可点击绿色出口 → --artx-action-* 变量。

按原始行号 + 行内唯一子串替换；深色浮层用 ondark 变量。
纯展示绿色（默认张数徽章、3D 预览、图标、滑块、focus 描边、拖拽区、
文字高亮、Check 勾）一律不动。
"""
import sys
from pathlib import Path

PATH = Path("/Users/ericbi/WorkBuddy/artx/artx-test-main/client/src/components/canvas/InfiniteCanvas.tsx")

ABG = "var(--artx-action-active-bg)"
AFG = "var(--artx-action-active-fg)"
ABR = "var(--artx-action-active-border)"
OBG = "var(--artx-action-bg)"
OFG = "var(--artx-action-fg)"
OBR = "var(--artx-action-border)"
DBG = "var(--artx-action-ondark-bg)"
DFG = "var(--artx-action-ondark-fg)"
DBR = "var(--artx-action-ondark-border)"

OUTLINE = '{{ color: "%s", background: "%s", border: "1px solid %s" }}' % (OFG, OBG, OBR)
OUTLINE_DARK = '{{ color: "%s", background: "%s", border: "1px solid %s" }}' % (DFG, DBG, DBR)

# (行号, 行内旧子串, 新子串)
EDITS = [
    # 1) 生成张数按钮
    (1486, 'color: active ? "#172000" : text,', 'color: active ? "%s" : text,' % AFG),
    (1487, 'background: active ? "#C5ED47" : "transparent",',
     'background: active ? "%s" : "%s",' % (ABG, OBG)),
    (1490, '"1px solid rgba(197,237,71,0.55)"', '"1px solid %s"' % OBR),
    # 2) 画幅比例按钮（补线框）
    (1716, 'color: active ? "#172000" : text,', 'color: active ? "%s" : text,' % AFG),
    (1717, 'background: active ? "#C5ED47" : "transparent",',
     'background: active ? "%s" : "%s",\n'
     '                    border: `1px solid ${active ? "%s" : "%s"}`' % (ABG, OBG, ABR, OBR)),
    # 3) 裁剪预设按钮
    (5242, '? "#C5ED47"', '? "%s"' % ABG),
    (5246, '? "#10130A"', '? "%s"' % AFG),
    # 4) 删除确认气泡按钮
    (6044, 'const confirmButtonBg = "#C5ED47";',
     '// 可点击按钮统一走黑白色系；本常量只用于这一个确认气泡。\n'
     '  const confirmButtonBg = "%s";' % ABG),
    (6301, 'color: "#111827",', 'color: "%s",' % AFG),
    (6303, 'border: "none",', 'border: "1px solid %s",' % ABR),
    (6307, 'boxShadow: "0 8px 18px rgba(197,237,71,0.20)",', 'boxShadow: "none",'),
    (6313, '(e.currentTarget.style.background = "#D8FF5C")',
     '(e.currentTarget.style.background = "rgba(128,128,128,0.35)")'),
    # 5) 相机视角「应用」—— 面板是 #191a1d 深色浮层，用 ondark 白框白字
    (9749, 'style={{ color: "#0b0c0d", background: "#C5ED47" }}', 'style=' + OUTLINE_DARK),
    # 6) 节点上的「再次生成」浮层按钮
    (10473, 'background: "#C5ED47",', 'background: "%s",' % OBG),
    (10474, 'color: "#000",', 'color: "%s",\n                  border: "1px solid %s",' % (OFG, OBR)),
    (10480, 'boxShadow: "0 12px 30px rgba(197,237,71,0.32)",', 'boxShadow: "none",'),
    # 7) 主「生成图像」按钮
    (19743, 'background: canGenerate ? "#C5ED47" : hoverBg,',
     'background: canGenerate ? "%s" : hoverBg,' % OBG),
    (19744, 'color: canGenerate ? "#000" : sub,',
     'color: canGenerate ? "%s" : sub,\n                border: "1px solid %s",' % (OFG, OBR)),
    (19746, '"0 12px 30px rgba(197,237,71,0.24)"', '"none"'),
    # 8) 字体设计面板：accent 常量保留给图标/Check（纯展示），只改按钮
    (19976, 'const accent = "#C5ED47";',
     '// ⚠️ 本常量只喂纯展示（选中勾、图标 cutoutBg）；可点击按钮走 --artx-action-*。\n'
     '  const accent = "#C5ED47";'),
    (20460, 'background: canGenerate ? accent : hoverBg,',
     'background: canGenerate ? "%s" : hoverBg,' % OBG),
    (20461, 'color: canGenerate ? "#000" : sub,',
     'color: canGenerate ? "%s" : sub,\n              border: "1px solid %s",' % (OFG, OBR)),
    (20463, '"0 14px 34px rgba(197,237,71,0.30)"', '"none"'),
    (20471, 'event.currentTarget.style.background = "#D6FF59";',
     'event.currentTarget.style.background = "rgba(128,128,128,0.35)";'),
    (20473, '"0 18px 42px rgba(197,237,71,0.38)"', '"none"'),
    (20477, '? accent', '? "%s"' % OBG),
    (20480, '"0 14px 34px rgba(197,237,71,0.30)"', '"none"'),
    # 9) 「确认新建」
    (21161, 'background: "#C5ED47",', 'background: "%s",' % OBG),
    (21162, 'color: "#111827",', 'color: "%s",\n              border: "1px solid %s",' % (OFG, OBR)),
    (21163, 'boxShadow: "0 8px 24px rgba(197,237,71,0.22)",', 'boxShadow: "none",'),
    # 10) 「确认参考图」
    (26257, 'background: "#C5ED47",', 'background: "%s",' % OBG),
    (26258, 'color: "#000",', 'color: "%s",\n                                        border: "1px solid %s",' % (OFG, OBR)),
    # 11) 消息「再次生成」激活态文字
    (26292, '? "#C5ED47"', '? "%s"' % OFG),
    # 12) 助手「自动模式」Switch
    (27364, '? "#C5ED47"', '? "%s"' % ABG),
    (27368, 'assistantAutoMode ? "rgba(197,237,71,0.60)" : border',
     'assistantAutoMode ? "%s" : border' % ABR),
    (27372, '? "#111827"', '? "%s"' % AFG),
    # 13) 助手模型分组 tab
    (27393, 'assistantModelTab === tab.id ? text : sub,',
     'assistantModelTab === tab.id ? "%s" : sub,' % AFG),
    (27396, '? "rgba(197,237,71,0.14)"', '? "%s"' % ABG),
    (27398, 'assistantModelTab === tab.id ? "rgba(197,237,71,0.40)" : "transparent"',
     'assistantModelTab === tab.id ? "%s" : "%s"' % (ABR, OBR)),
    # 14) 助手模型列表项
    (27413, 'color: text,', 'color: assistantModel.id === model.id ? "%s" : text,' % AFG),
    (27418, '? "rgba(197,237,71,0.12)"', '? "%s"' % ABG),
    (27427, '? "rgba(197,237,71,0.12)"', '? "%s"' % ABG),
    # 15) 云端保留提示「我知道了」
    (41925, 'style={{ color: "#172000", background: "var(--accent-lime, #d7f25c)" }}',
     'style=' + OUTLINE),
    # 16) 「全部下载」
    (42119, 'style={{ color: "#172000", background: "var(--accent-lime, #d7f25c)" }}',
     'style=' + OUTLINE),
]


def main():
    lines = PATH.read_text().split("\n")
    orig = list(lines)
    for lineno, old, new in EDITS:
        idx = lineno - 1
        if idx >= len(lines) or old not in lines[idx]:
            print(f"❌ L{lineno}: 找不到 {old[:75]!r}")
            print(f"   实际: {lines[idx][:170] if idx < len(lines) else '<越界>'}")
            sys.exit(1)
        if lines[idx].count(old) != 1:
            print(f"❌ L{lineno}: 一行内出现 {lines[idx].count(old)} 次")
            sys.exit(1)
        lines[idx] = lines[idx].replace(old, new, 1)
    PATH.write_text("\n".join(lines))
    print(f"✅ InfiniteCanvas.tsx: {len(EDITS)} 处替换已落盘")


if __name__ == "__main__":
    main()
