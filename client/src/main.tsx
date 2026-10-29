import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { exposeBuildInfo } from "./lib/build-info";

/*
 * 路由分包后的发版兜底：用户停留在旧版本页面时，新版发布会替换掉旧的
 * 带 hash 的分包文件，此时点进画布等懒加载页面会 import 失败。
 * Vite 会在 window 上抛 vite:preloadError —— 刷新一次拿新 index 即可。
 * 用 sessionStorage 做 30 秒节流，避免分包确实缺失时无限刷新。
 */
const preloadReloadKey = "artx:preload-error-reload-at";
window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem(preloadReloadKey) || 0);
  if (Date.now() - last < 30_000) return;
  sessionStorage.setItem(preloadReloadKey, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

exposeBuildInfo();
createRoot(document.getElementById("root")!).render(<App />);
