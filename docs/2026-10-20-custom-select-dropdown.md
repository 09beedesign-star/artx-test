# 电商画布自定义下拉菜单 - 白色主题 + 位置自适应

## 📅 日期
2026-10-20 21:45

## 🎯 用户需求

电商画布"生成设置"区域的四个下拉菜单（平台、市场、语言、画幅比例）需要：
1. **白色主题适配**：白色模式下展开面板改为白色背景（当前是黑色）
2. **位置自适应**：根据浏览器可用空间自动调整展开方向（向上或向下），不能超出浏览器边界

## ❌ 原方案的限制

### 使用原生 `<select>` 元素
```tsx
<select value={value} onChange={...}>
  <option value="...">...</option>
</select>
```

**问题：**
1. **样式控制极其有限**
   - 虽然设置了 `colorScheme: "light"`，但浏览器渲染结果不一致
   - macOS Safari/Chrome 仍可能显示深色面板
   - 无法完全控制选项面板的背景色、边框、阴影

2. **完全无法控制展开方向**
   - 浏览器根据自己的算法决定向上还是向下
   - 开发者无法干预
   - 在浏览器底部可能超出边界

## ✅ 新方案：自定义下拉菜单

### 核心技术
```tsx
const [isOpen, setIsOpen] = useState(false);
const [dropDirection, setDropDirection] = useState<"down" | "up">("down");
const containerRef = useRef<HTMLDivElement>(null);

// 计算展开方向
const handleToggle = () => {
  if (!isOpen && containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(options.length * 32 + 8, 240);

    // 下方空间不够且上方空间更多时向上展开
    setDropDirection(
      spaceBelow < dropdownHeight && spaceAbove > spaceBelow 
        ? "up" 
        : "down"
    );
  }
  setIsOpen(!isOpen);
};
```

### 关键特性

#### 1. 白色主题完全可控
```tsx
<div
  style={{
    background: isDark ? "#2a2a2a" : "#ffffff",
    border: `1px solid ${palette.border}`,
  }}
>
```

#### 2. 位置自适应
```tsx
style={{
  [dropDirection === "down" ? "top" : "bottom"]: "100%",
  marginTop: dropDirection === "down" ? "4px" : undefined,
  marginBottom: dropDirection === "up" ? "4px" : undefined,
}}
```

#### 3. 选中项高亮
```tsx
color: option === value ? LIME : palette.text,
background: option === value 
  ? (isDark ? "rgba(178,237,154,0.08)" : "rgba(60,157,21,0.05)") 
  : "transparent",
```

#### 4. 点击外部关闭
```tsx
useEffect(() => {
  if (!isOpen) return;
  
  const handleClickOutside = (event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };
  
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [isOpen]);
```

#### 5. 箭头图标旋转动画
```tsx
<ChevronDown
  style={{
    transform: `translateY(-50%) rotate(${isOpen ? 180 : 0}deg)`,
  }}
/>
```

## 📊 测试覆盖

创建了 10 个测试用例（`primitives.custom-select.test.ts`）：

1. ✅ 引入必要的 React hooks
2. ✅ isOpen 状态管理
3. ✅ dropDirection 状态管理
4. ✅ 浏览器空间计算
5. ✅ 点击外部关闭
6. ✅ 白色模式背景色
7. ✅ 选中项高亮
8. ✅ 箭头旋转动画
9. ✅ 向上/向下展开
10. ✅ 注释说明需求

**运行结果：**
```
✓ 10 passed
```

## 📝 修改的文件

1. **`client/src/components/ecommerce/primitives.tsx`**
   - Select 组件从原生 `<select>` 改为自定义实现
   - 添加 useState, useRef, useEffect 引入
   - 实现位置自适应和白色主题

2. **测试文件**
   - `client/src/components/ecommerce/primitives.custom-select.test.ts`

## 🎨 视觉效果

### 深色模式
- 触发按钮：深灰背景 + 浅色文字
- 展开面板：`#2a2a2a` 背景 + 白色文字
- 选中项：品牌绿色高亮

### 白色模式
- 触发按钮：白色背景 + 深色文字
- 展开面板：`#ffffff` 背景 + 深色文字
- 选中项：品牌绿色高亮

### 位置自适应
- **浏览器上半部分**：向下展开（marginTop: 4px）
- **浏览器下半部分**：向上展开（marginBottom: 4px）
- **临界判断**：spaceBelow < dropdownHeight && spaceAbove > spaceBelow

## 🔍 验证方法

### 1. 白色主题验证
```bash
# 访问电商画布 - 产品图模式
http://localhost:3000

# 切换到白色主题
# 点击"平台"、"市场"、"语言"、"画幅比例"任一下拉菜单
# 验证展开面板为白色背景
```

### 2. 位置自适应验证
```bash
# 在浏览器顶部打开下拉菜单 → 应该向下展开
# 在浏览器底部打开下拉菜单 → 应该向上展开
# 调整浏览器窗口高度测试临界情况
```

### 3. 交互验证
```bash
# 点击下拉菜单外部 → 应该自动关闭
# 选中一个选项 → 应该关闭并更新值
# 箭头图标应该随展开状态旋转 180 度
# 选中项应该有绿色高亮
```

## 🚀 部署

修改已推送到 main 分支，提交 SHA：待补充

根据工作记忆，推送到 main 分支不会自动触发部署。如需上线，需要手动 dispatch `Deploy Tencent Cloud Test` 工作流。

## 📌 相关改进

这次修改解决了原生表单控件的通用限制：

1. **不受浏览器限制** - 完全自定义样式
2. **更好的用户体验** - 位置智能适应，避免超出边界
3. **主题一致性** - 深色/白色模式完全匹配设计规范
4. **更丰富的交互** - 箭头旋转、选中高亮、悬停效果

## 🔗 相关文档

- [2026-10-20 Backspace 回删功能](./2026-10-20-backspace-delete-implementation.md)
- [电商画布主题适配记录](/Users/ericbi/WorkBuddy/2026-09-07-21-55-56/.workbuddy/memory/2026-10-20.md)
