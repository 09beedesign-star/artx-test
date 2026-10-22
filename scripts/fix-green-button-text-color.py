#!/usr/bin/env python3
"""
修复绿色按钮的文字颜色
将所有使用 var(--color-brand-green) 作为背景的按钮文字颜色改为 #ffffff
"""
import re
from pathlib import Path

def fix_file(file_path: Path) -> tuple[bool, str]:
    """
    修复单个文件中的绿色按钮文字颜色
    返回 (是否修改, 修改说明)
    """
    content = file_path.read_text(encoding='utf-8')
    original = content
    changes = []
    
    # 模式 1: style={{ background: "var(--color-brand-green)", color: "xxx" }}
    # 将 color 改为 #ffffff (纯白)
    def replace_inline_color(match):
        full = match.group(0)
        # 提取 color 值
        color_match = re.search(r'color:\s*["\']([^"\']+)["\']', full)
        if color_match:
            old_color = color_match.group(1)
            if old_color != "#ffffff" and old_color != "white":
                new_full = re.sub(
                    r'color:\s*["\'][^"\']+["\']',
                    'color: "#ffffff"',
                    full
                )
                changes.append(f"  {old_color} → #ffffff")
                return new_full
        return full
    
    # 查找所有包含 background: "var(--color-brand-green)" 的 style 块
    pattern = r'style=\{\{[^}]*background:\s*["\']var\(--color-brand-green\)["\'][^}]*\}\}'
    content = re.sub(pattern, replace_inline_color, content)
    
    # 模式 2: 跨行的 style 定义
    # style={{
    #   background: "var(--color-brand-green)",
    #   color: "xxx",
    # }}
    def replace_multiline_color(match):
        full = match.group(0)
        color_match = re.search(r'color:\s*["\']([^"\']+)["\']', full)
        if color_match:
            old_color = color_match.group(1)
            if old_color != "#ffffff" and old_color != "white":
                new_full = re.sub(
                    r'color:\s*["\'][^"\']+["\']',
                    'color: "#ffffff"',
                    full
                )
                changes.append(f"  {old_color} → #ffffff (multiline)")
                return new_full
        return full
    
    multiline_pattern = r'style=\{\{[^}]*background:\s*["\']var\(--color-brand-green\)["\'][^}]*\}\}'
    content = re.sub(multiline_pattern, replace_multiline_color, content, flags=re.DOTALL)
    
    if content != original:
        file_path.write_text(content, encoding='utf-8')
        return True, "\n".join(changes)
    
    return False, ""

def main():
    root = Path(__file__).parent.parent / "client" / "src"
    
    # 需要检查的文件类型
    patterns = ["**/*.tsx", "**/*.ts"]
    
    files_to_check = []
    for pattern in patterns:
        files_to_check.extend(root.glob(pattern))
    
    modified_files = []
    
    for file_path in files_to_check:
        if file_path.is_file():
            modified, changes = fix_file(file_path)
            if modified:
                modified_files.append((file_path.relative_to(root), changes))
    
    if modified_files:
        print(f"✅ 修改了 {len(modified_files)} 个文件：\n")
        for file_rel, changes in modified_files:
            print(f"📝 {file_rel}")
            print(changes)
            print()
    else:
        print("✅ 所有绿色按钮的文字颜色已经是白色，无需修改")

if __name__ == "__main__":
    main()
