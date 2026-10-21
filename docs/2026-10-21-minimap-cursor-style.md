# 画布缩略图鼠标样式优化

## 📋 需求

在画布左下角的缩略图（MiniMap）区域，当鼠标移动到该区域时，鼠标指针变成抓手样式，告诉用户这个区域可以拖动调整画布的显示区域。

## 🎯 实现方案

### CSS 样式修改

**文件：** `client/src/index.css`

将 MiniMap 的鼠标样式从 `crosshair`（十字准星）改为 `grab`（张开的手），并添加拖动时的 `grabbing`（握拳）样式：

```css
/* 小地图整体鼠标样式：抓手样式提示用户可以拖动调整视口 */
.react-flow__minimap {
  cursor: grab;
}

/* 拖动时显示握拳样式 */
.react-flow__minimap:active {
  cursor: grabbing;
}
```

### 组件修改

**文件：** `client/src/components/canvas/InfiniteCanvas.tsx`

确保 MiniMap 组件的 style 对象中**不包含内联 cursor 属性**，完全由 CSS 控制鼠标样式。保留 `pannable` 和 `zoomable` 属性以支持拖动和缩放：

```tsx
<MiniMap
  style={{
    width: 100,
    height: 75,
    // ... 其他样式
    // ❌ 不要添加 cursor 属性
  }}
  zoomable
  pannable={!isCanvasLocked}
/>
```

## 🎨 用户体验

1. **静止状态**：鼠标移动到 MiniMap 上时，显示 `grab` 样式（张开的手 ✋）
2. **拖动状态**：按下鼠标拖动时，显示 `grabbing` 样式（握拳 ✊）
3. **锁定状态**：当画布被锁定时（`isCanvasLocked = true`），`pannable={false}` 会禁用拖动

## 📐 技术细节

### 为什么不用内联样式？

内联样式无法响应 `:active` 伪类状态，所以必须通过 CSS 类选择器来实现：

- ✅ CSS：`.react-flow__minimap:active { cursor: grabbing; }`
- ❌ 内联：`style={{ cursor: "grab" }}` 无法在拖动时变为 `grabbing`

### 样式优先级

CSS 全局样式的优先级**低于**内联样式，所以必须确保 MiniMap 的 `style` 对象中**不包含 cursor 属性**，否则会覆盖 CSS 样式。

## ✅ 测试验证

创建了 `minimap-cursor.test.ts` 测试文件，验证：

1. ✓ MiniMap 有 `cursor: grab` 样式
2. ✓ MiniMap 拖动时有 `cursor: grabbing` 样式
3. ✓ 有注释说明鼠标样式的用途
4. ✓ 不再使用旧的 `crosshair` 样式
5. ✓ MiniMap 的 style 对象不包含内联 cursor 属性
6. ✓ 保留 `pannable` 属性以支持拖动
7. ✓ 保留 `zoomable` 属性以支持缩放

**测试结果：** 7/7 全部通过 ✅

## 🚀 部署

修改已完成，可以通过以下方式验证：

1. 本地开发服务器：`http://localhost:3000`
2. 进入任意画布（AI 画布、电商画布等）
3. 将鼠标移动到左下角的缩略图区域
4. 观察鼠标指针变化：静止时为张开的手，拖动时为握拳

---

**修改日期：** 2026-10-21  
**修改人：** Kiro
