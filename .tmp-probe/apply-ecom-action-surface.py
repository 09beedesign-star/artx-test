#!/usr/bin/env python3
"""
电商画布模块：把「可点击绿色」逐出口接入全站黑色线框按钮事实源。

安全策略：
- 每个替换锚点必须恰好命中 N 次，否则整脚本中止且不写任何文件
- 全部替换先在内存里完成，最后统一落盘（防止中途失败留下半成品）
- 只列可点击元素；纯展示绿色（Sparkles 图标、选中角标 span、状态文字、
  focus 描边、动画）不在锚点列表里
"""
import sys
from pathlib import Path

ROOT = Path("/Users/ericbi/WorkBuddy/artx/artx-test-main/client/src")
TOKEN_IMPORT = "import { %s } from \"@/lib/action-surface-tokens\";"

EDITS = [
    {
        "file": "components/ecommerce/primitives.tsx",
        "imports": ["ACTION_ACTIVE_STYLE"],
        "repls": [
            # Switch 轨道：开启态由品牌绿改为反相实心（黑底），thumb 同步转白
            (
                'style={{ background: on ? LIME : isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.18)" }}',
                'style={{ background: on ? "var(--artx-action-active-bg)" : isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.18)" }}',
                1,
            ),
            (
                'style={{ left: on ? 16 : 2, background: on ? "#1a1a1a" : "#fff" }}',
                'style={{ left: on ? 16 : 2, background: on ? "var(--artx-action-active-fg)" : "#fff" }}',
                1,
            ),
            # 下拉选项选中态
            (
                """              style={{
                color: option === value 
                  ? (isDark ? LIME : "rgba(20,20,36,0.92)") 
                  : palette.text,
                background: option === value 
                  ? (isDark ? "rgba(178,237,154,0.08)" : "rgba(0,0,0,0.06)") 
                  : "transparent",
              }}""",
                """              style={option === value ? ACTION_ACTIVE_STYLE : { color: palette.text, background: "transparent" }}""",
                1,
            ),
        ],
    },
    {
        "file": "components/ecommerce/EcommerceTemplateCard.tsx",
        "imports": ["ACTION_OUTLINE_STYLE"],
        "repls": [
            # 只改「详情」按钮；L147 的选中角标 span 是纯展示，不动
            (
                'style={{ color: "#1a1a1a", background: LIME }}',
                'style={ACTION_OUTLINE_STYLE}',
                1,
            ),
        ],
    },
    {
        "file": "components/ecommerce/EcommerceTemplateGallery.tsx",
        "imports": ["ACTION_ACTIVE_STYLE", "ACTION_OUTLINE_CLASS", "ACTION_OUTLINE_STYLE"],
        "repls": [
            # 分类 chip 选中态
            (
                """              style={{
                background: category === item.id ? "rgba(197,237,71,0.16)" : palette.field,
                border: `1px solid ${category === item.id ? "rgba(197,237,71,0.62)" : palette.border}`,
                color: category === item.id ? LIME : palette.text,
              }}""",
                """              style={category === item.id
                ? ACTION_ACTIVE_STYLE
                : { background: palette.field, border: `1px solid ${palette.border}`, color: palette.text }}""",
                1,
            ),
            # 「清空筛选条件」纯文字链接升级成线框按钮；L141 Sparkles 图标不动
            (
                """              className="text-[12px] underline"
              style={{ color: LIME }}""",
                """              className={`text-[12px] ${ACTION_OUTLINE_CLASS} px-2.5 py-1`}
              style={ACTION_OUTLINE_STYLE}""",
                1,
            ),
        ],
    },
    {
        "file": "components/ecommerce/EcommerceTemplateDetail.tsx",
        "imports": ["ACTION_OUTLINE_STYLE"],
        "repls": [
            # 「回到模板库」兜底出口；L45 Sparkles 图标不动
            (
                'style={{ background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.4)", color: LIME }}',
                'style={ACTION_OUTLINE_STYLE}',
                1,
            ),
            # 「使用此模板生成」原实心绿底主按钮
            (
                'style={{ background: LIME, color: "#1a1a1a" }}',
                'style={ACTION_OUTLINE_STYLE}',
                1,
            ),
        ],
    },
    {
        "file": "components/ecommerce/EcommerceHistory.tsx",
        "imports": ["ACTION_OUTLINE_CLASS", "ACTION_OUTLINE_STYLE"],
        "repls": [
            # 空状态引导链接；L171 Sparkles 图标不动
            (
                """                className="text-[12px] underline"
                style={{ color: LIME }}""",
                """                className={`text-[12px] ${ACTION_OUTLINE_CLASS} px-2.5 py-1`}
                style={ACTION_OUTLINE_STYLE}""",
                1,
            ),
            # 「查看结果」
            (
                'style={{ background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.4)", color: LIME }}',
                'style={ACTION_OUTLINE_STYLE}',
                1,
            ),
        ],
    },
    {
        "file": "components/ecommerce/EcommerceWorkspace.tsx",
        "imports": ["ACTION_ACTIVE_STYLE", "ACTION_OUTLINE_CLASS", "ACTION_OUTLINE_STYLE"],
        "repls": [
            # 比例/分辨率/模板分类 chip 共用的 chipStyle
            (
                """  // 品牌绿 chip 样式（主题感知）
  const chipStyle = (on: boolean) => ({
    background: on 
      ? (isDark ? "rgba(178,237,154,0.16)" : "rgba(178,237,154,0.25)") 
      : palette.field,
    border: `1px solid ${on 
      ? (isDark ? "rgba(178,237,154,0.62)" : "#B2ED9A") 
      : palette.border}`,
    color: on ? (isDark ? lime : "var(--color-brand-green-label)") : palette.text,
  });""",
                """  // 可点击 chip 统一走全站事实源：选中反相实心，未选中保持面板原色。
  // 色值由 CSS 变量跟随 html.dark，这里不再自己判断主题算颜色。
  const chipStyle = (on: boolean) => on
    ? ACTION_ACTIVE_STYLE
    : { background: palette.field, border: `1px solid ${palette.border}`, color: palette.text };""",
                1,
            ),
            # 「AI 帮写」纯文字 → 黑框线体按钮
            (
                """                className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                style={{ color: lime }}""",
                """                className={`${ACTION_OUTLINE_CLASS} gap-1 px-2.5 py-1 text-[11px] font-medium hover:opacity-80`}
                style={ACTION_OUTLINE_STYLE}""",
                1,
            ),
            # 「在右侧选择模板」原浅绿线框胶囊
            (
                """                  className="rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ 
                    background: "var(--color-brand-green-light)", 
                    border: isDark ? "1px solid rgba(178,237,154,0.4)" : "1px solid #B2ED9A", 
                    color: lime 
                  }}""",
                """                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={ACTION_OUTLINE_STYLE}""",
                1,
            ),
            # 「展示所有模板」纯文字链接 → 黑框线体按钮
            (
                """                className="ml-auto flex items-center gap-0.5 text-[12px] transition-opacity hover:opacity-80"
                style={{ color: lime }}""",
                """                className={`ml-auto ${ACTION_OUTLINE_CLASS} gap-0.5 px-2.5 py-1 text-[12px] hover:opacity-80`}
                style={ACTION_OUTLINE_STYLE}""",
                1,
            ),
        ],
    },
]


def main():
    staged = {}
    for edit in EDITS:
        path = ROOT / edit["file"]
        src = path.read_text()
        orig = src
        for old, new, expected in edit["repls"]:
            found = src.count(old)
            if found != expected:
                print(f"❌ {edit['file']}: 锚点命中 {found} 次，期望 {expected} 次")
                print("   锚点前 80 字符:", repr(old[:80]))
                sys.exit(1)
            src = src.replace(old, new, expected)
        # 插 import（若已存在则不重复）
        if "action-surface-tokens" not in src:
            names = ", ".join(edit["imports"])
            line = TOKEN_IMPORT % names
            idx = src.find("import ")
            if idx < 0:
                print(f"❌ {edit['file']}: 找不到 import 插入点")
                sys.exit(1)
            src = src[:idx] + line + "\n" + src[idx:]
        if src == orig:
            print(f"⚠️ {edit['file']}: 无变化")
        staged[path] = (orig, src)
        n = len(edit["repls"])
        print(f"✅ {edit['file']}: {n} 处替换 + import")

    for path, (_, src) in staged.items():
        path.write_text(src)
    print(f"\n已落盘 {len(staged)} 个文件")


if __name__ == "__main__":
    main()
