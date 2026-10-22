/**
 * 绿色系统测试页面
 * 展示三种绿色在深色和浅色模式下的效果
 */

export default function GreenTestPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-3xl font-bold" style={{ color: "var(--foreground)" }}>
          绿色系统测试
        </h1>

        {/* 标签绿 */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            1. 标签绿（浅绿背景）
          </h2>
          <div className="flex gap-3">
            <div
              className="rounded-lg px-4 py-2"
              style={{
                background: "var(--color-brand-green-light)",
                color: "var(--color-brand-green-text)",
              }}
            >
              标签示例 1
            </div>
            <div
              className="rounded-lg px-4 py-2"
              style={{
                background: "var(--color-brand-green-light)",
                color: "var(--color-brand-green-text)",
              }}
            >
              标签示例 2
            </div>
            <div
              className="rounded-lg px-4 py-2"
              style={{
                background: "var(--color-brand-green-light)",
                color: "var(--color-brand-green-text)",
              }}
            >
              标签示例 3
            </div>
          </div>
        </section>

        {/* 按钮绿 */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            2. 按钮绿（中等绿背景 + 白色文字）
          </h2>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-lg px-6 py-2.5 font-semibold"
              style={{
                background: "var(--color-brand-green)",
                color: "white",
              }}
            >
              开始体验
            </button>
            <button
              type="button"
              className="rounded-lg px-6 py-2.5 font-semibold"
              style={{
                background: "var(--color-brand-green)",
                color: "white",
              }}
            >
              立即购买
            </button>
            <button
              type="button"
              className="rounded-lg px-6 py-2.5 font-semibold"
              style={{
                background: "var(--color-brand-green)",
                color: "white",
              }}
            >
              去充值
            </button>
          </div>
        </section>

        {/* 文字和图标绿 */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            3. 文字和图标绿（深绿文字）
          </h2>
          <div className="space-y-3">
            <p style={{ color: "var(--color-brand-green-text)" }}>
              ✓ 这是一段使用文字绿的段落文本
            </p>
            <p style={{ color: "var(--color-brand-green-text)" }}>
              ✓ 文字绿主要用于图标和文字，不用作背景
            </p>
            <p style={{ color: "var(--color-brand-green-text)" }}>
              ✓ 在白色模式下是深绿色，在深色模式下是亮绿色
            </p>
          </div>
        </section>

        {/* 对比展示 */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            4. 综合对比
          </h2>
          <div className="rounded-xl bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span style={{ color: "var(--color-brand-green-text)" }}>✓</span>
              <span
                className="rounded px-2 py-1 text-sm"
                style={{
                  background: "var(--color-brand-green-light)",
                  color: "var(--color-brand-green-text)",
                }}
              >
                已激活
              </span>
              <button
                type="button"
                className="rounded px-4 py-1.5 text-sm font-semibold"
                style={{
                  background: "var(--color-brand-green)",
                  color: "white",
                }}
              >
                确认
              </button>
            </div>
          </div>
        </section>

        {/* 说明 */}
        <section className="rounded-xl bg-card p-6 space-y-3">
          <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>
            使用说明
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <li>
              <strong>标签绿</strong>：<code>var(--color-brand-green-light)</code> - 用于标签背景，配合深绿文字
            </li>
            <li>
              <strong>按钮绿</strong>：<code>var(--color-brand-green)</code> - 用于按钮背景，配合白色文字
            </li>
            <li>
              <strong>文字绿</strong>：<code>var(--color-brand-green-text)</code> - 用于文字和图标颜色
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
