# 2026-10-20 电商画布图片张数 Backspace 回删功能

## 用户需求

电商模块下的**带货图文**和**产品图**两个类目下的图片张数输入框：
1. 支持通过 Backspace 键删除数字
2. 删除后可以重新输入新数字
3. 单次输入最大不能超过 8

## 技术实现

### 1. 修改 Stepper 组件输入逻辑

**文件：** `client/src/components/ecommerce/primitives.tsx`

**关键修改：**

#### (1) 从受控组件改为非受控组件

```tsx
// 修改前（受控）
<input
  value={value}
  onChange={handleInputChange}
/>

// 修改后（非受控 + key 强制更新）
<input
  defaultValue={value}
  key={value}
  onChange={handleInputChange}
/>
```

**原理：**
- **受控组件**：`value` 由 React state 完全控制，用户按 Backspace 清空后，输入框立即被 React 用旧值填回
- **非受控组件**：`defaultValue` 只设置初始值，之后由 DOM 自己管理，用户可以自由编辑
- **`key={value}`**：当外部 value 变化（如点击 +/- 按钮）时，强制 React 重新创建 input 元素，同步新值

#### (2) 允许空字符串（Backspace 清空）

```tsx
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const raw = e.target.value;
  
  if (!/^\d*$/.test(raw)) return;  // 只允许数字
  
  if (raw === "") {
    // 2026-10-20：允许清空，不触发 onChange
    // 输入框显示为空，但 value 保持不变
    return;
  }
  
  const num = parseInt(raw, 10);
  const clamped = Math.max(min, Math.min(max, num));
  onChange(clamped);
};
```

**原理：**
- 用户按 Backspace 删除数字后，`raw === ""`，函数直接 `return`
- **不触发 `onChange`**，所以父组件的 `value`（如 `draft.postCount`）保持不变
- 输入框显示为空，用户可以输入新数字

#### (3) 失焦时恢复当前值

```tsx
const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  // 失焦时若为空，恢复当前值
  if (e.target.value === "") {
    e.target.value = String(value);
  }
};
```

**原理：**
- 用户清空输入框后，如果点击其他地方（失焦），输入框自动恢复当前有效值
- 避免输入框永远显示为空的情况

### 2. 修改最大值限制

**文件：** `client/src/components/ecommerce/EcommerceWorkspace.tsx`

```tsx
// 带货图文模式
{mode === "post" ? (
  <CountRow
    label="张数"
    value={draft.postCount}
    min={1}
    max={8}  // ← 从 9 改为 8
    onChange={postCount => updateDraft({ postCount })}
  />
) : null}

// 产品图模式（已经是 8，无需修改）
{mode === "product" ? (
  <CountRow
    label="生成数量"
    value={draft.productCount}
    min={1}
    max={8}  // ← 已经是 8
    onChange={productCount => updateDraft({ productCount })}
  />
) : null}
```

## 用户体验流程

### 修改前（受控组件）

1. 用户看到输入框显示 `6`
2. 用户按 Backspace，输入框**瞬间被填回** `6`（受控组件特性）
3. 用户无法删除，只能通过 +/- 按钮调整

### 修改后（非受控组件）

1. 用户看到输入框显示 `6`
2. 用户按 Backspace，输入框变为**空白**
3. 用户输入 `8`，输入框显示 `8`，触发 `onChange(8)`
4. 如果用户清空后点击其他地方（失焦），输入框自动恢复为 `6`

## 测试覆盖

### 测试文件 1：`primitives.backspace-delete.test.ts`

验证 Stepper 组件的实现细节：
- ✅ 使用 `defaultValue + key` 替代 `value`
- ✅ `handleInputChange` 允许空字符串
- ✅ `handleInputBlur` 在失焦时恢复值
- ✅ 注释说明 2026-10-20 需求
- ✅ 正确使用 `max` 参数限制范围

### 测试文件 2：`EcommerceWorkspace.max-count.test.ts`

验证调用方传递的参数：
- ✅ 带货图文模式的 `max={8}`
- ✅ 产品图模式的 `max={8}`
- ✅ 不存在任何 `max={9}` 的遗漏
- ✅ 描述文案与实际最大值一致

## 验证命令

```bash
# 构建验证
npm run build

# 运行测试
npx vitest run primitives.backspace-delete.test.ts
npx vitest run EcommerceWorkspace.max-count.test.ts

# 启动开发服务器（3000 端口已有进程）
npm run dev
```

## 注意事项

1. **非受控组件的 key 技巧**：
   - `key={value}` 确保当外部 value 变化时，React 重新创建 input 元素
   - 这样既保留了非受控的灵活性，又能同步外部更新（如点击 +/- 按钮）

2. **空字符串的处理**：
   - 清空时**不触发 onChange**，保持父组件 state 不变
   - 失焦时自动恢复，避免永久空白

3. **输入限制**：
   - 正则 `/^\d*$/` 只允许数字字符
   - `Math.max(min, Math.min(max, num))` 限制范围
   - 超出范围时自动 clamp 到边界值

4. **兼容性**：
   - `inputMode="numeric"` 在移动端弹出数字键盘
   - `type="text"` 而非 `type="number"`，避免浏览器默认的上下箭头和滚轮行为

## 相关文件

- `client/src/components/ecommerce/primitives.tsx` - Stepper 组件实现
- `client/src/components/ecommerce/EcommerceWorkspace.tsx` - 带货图文和产品图模式
- `client/src/components/ecommerce/primitives.backspace-delete.test.ts` - Backspace 测试
- `client/src/components/ecommerce/EcommerceWorkspace.max-count.test.ts` - 最大值测试

## 时间线

- **2026-10-17**：初次实现键盘输入功能，支持直接输入 1-9 张
- **2026-10-20**：增加 Backspace 回删功能，最大值从 9 改为 8
