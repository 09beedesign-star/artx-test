import { useEffect, useState } from "react";
import { getAuthApiBaseUrl } from "@/contexts/AuthContext";

/**
 * 登录界面开关：从后端 GET /api/auth/features 取（服务端环境变量 ARTX_PHONE_AUTH_ENABLED）。
 *
 * ⚠️ 失败 / 超时 / 后端没有这个接口（老版本）一律视为「关」→ 显示原 ArtX 登录界面。
 *    宁可新界面没出来，也不能让老用户看到一个后端不支持的界面而登录不了。
 * 结果在模块内缓存，同一页面多个弹窗只请求一次。
 */
export interface AuthFeatures {
  phoneAuth: boolean;
}

const DISABLED: AuthFeatures = { phoneAuth: false };
let cached: AuthFeatures | null = null;
let inflight: Promise<AuthFeatures> | null = null;

// 与 fetchAuth 同一个基址来源，避免两处各算一份（GitHub Pages 等域名下基址不同）。
const apiBase = getAuthApiBaseUrl;

export function loadAuthFeatures(): Promise<AuthFeatures> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  inflight = fetch(`${apiBase()}/api/auth/features`, { signal: controller.signal, cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return DISABLED;
      const data = (await response.json().catch(() => ({}))) as Partial<AuthFeatures>;
      return { phoneAuth: data.phoneAuth === true };
    })
    .catch(() => DISABLED)
    .then((features) => {
      cached = features;
      return features;
    })
    .finally(() => {
      window.clearTimeout(timer);
      inflight = null;
    });
  return inflight;
}

/** null = 还在加载（调用方此时不应渲染任何登录表单，避免新旧界面闪切）。 */
export function useAuthFeatures(): AuthFeatures | null {
  const [features, setFeatures] = useState<AuthFeatures | null>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    void loadAuthFeatures().then((value) => {
      if (alive) setFeatures(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return features;
}
