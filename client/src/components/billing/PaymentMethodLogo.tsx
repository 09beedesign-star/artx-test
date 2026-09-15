import type { PaymentMethod } from "./billing-shared";

export default function PaymentMethodLogo({
  method,
  compact = false,
}: {
  method: PaymentMethod;
  compact?: boolean;
}) {
  const size = compact ? 18 : 34;
  const iconSize = compact ? 15 : 27;
  if (method === "alipay") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md-design)] bg-white"
        style={{ width: size, height: size }}
        aria-label="支付宝 logo"
        data-payment-brand-icon="alipay"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width={iconSize}
          height={iconSize}
          className="block"
        >
          <path
            d="M10.5 2h2v2.788h7.002v2H12.5v1.857h5.264l-.198 1.168c-.261 1.536-.978 3.154-1.949 4.656c1.295.447 2.573.92 3.793 1.372l.233.086c1.576.583 3.044 1.122 4.357 1.534v3.828l-.436-.22l-.06-.029a65 65 0 0 0-.84-.415a167 167 0 0 0-2.368-1.132a138 138 0 0 0-6.367-2.805c-1.026 1.156-2.2 2.191-3.428 2.974c-1.321.842-2.768 1.432-4.198 1.506q-.15.008-.303.008c-1.828 0-3.268-.485-4.25-1.342C.758 18.967.315 17.786.4 16.61c.168-2.367 2.373-4.396 5.63-4.304c2.248.063 4.704.624 7.128 1.36c.6-.998 1.073-2.033 1.377-3.022H5.5v-2h5V6.788h-7v-2h7zM5.972 14.306c-2.387-.067-3.5 1.339-3.578 2.447c-.04.561.16 1.128.672 1.574c.522.455 1.445.849 2.934.849c1.73 0 3.733-1.226 5.477-3.206l.153-.178c-2.223-.822-4.174-1.397-5.386-1.476z"
            fill="#1677FF"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md-design)] bg-white"
      style={{ width: size, height: size }}
      aria-label="微信支付 logo"
      data-payment-brand-icon="wechat-pay"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        className="block"
      >
        <path
          d="M12 2c3.713 0 6.993 1.534 8.985 3.882l.762 1.037C22.546 8.19 23 9.633 23 11.167c0 5.063-4.925 9.167-11 9.167a13 13 0 0 1-3.59-.503a1.1 1.1 0 0 0-.324-.048a1.14 1.14 0 0 0-.584.17l-2.408 1.39a.4.4 0 0 1-.212.068a.367.367 0 0 1-.367-.367c0-.068.02-.136.04-.203l.02-.065l.495-1.85a.73.73 0 0 0-.27-.83c-2.318-1.68-3.8-4.167-3.8-6.93C1 6.105 5.925 2 12 2m8.005 5.926L9.08 14.233l-.08.046a.73.73 0 0 1-.97-.296l-2.05-4.5a.367.367 0 0 1 .551-.448l2.363 1.682a1.1 1.1 0 0 0 .976.112l9.188-4.09C17.445 5.114 14.924 4 12 4c-5.328 0-9 3.534-9 7.167c0 2.006 1.073 3.93 2.97 5.306c.5.36.877.888 1.044 1.505a3.05 3.05 0 0 1 1.96-.065c.943.27 1.965.421 3.026.421c5.327 0 9-3.534 9-7.167c0-1.106-.319-2.164-.91-3.126z"
          fill="#07C160"
        />
      </svg>
    </span>
  );
}
