// 参数化文字替换引擎（Python/FastAPI）客户端 —— 「智能文案编辑」的擦字通道之一。
//
// 引擎项目：image-text-replace，暴露 POST /api/inline/replace（一次往返，同步返回）。
//   请求: { image_base64, regions:[{text,target_text,x,y,width,height}], erase_only }
//   响应: { code:0, data:{ image_base64, width, height, erased_regions } }
//   坐标为归一化 0~1，与站点 DrawTextRegion 一致，无需换算。
//
// ## 为什么只用它擦字，不用它写字
//
// 站点已有 drawTextReplacement（确定性绘制），文字内容零错误由它保证。
// 引擎的价值在**擦除**：现有本地兜底 eraseTextRegionsLocally 的做法是
// 「逐行取左右外侧中位色 + 沿 x 线性插值」，等价于给整框刷一层横向渐变；
// 引擎走的是「只擦墨迹 + 平坦底中值填充 + 色块掩膜重刷」。
//
// 实测两者在同一批区域上的对照（擦净率越高越好，背景改动越低越好；
// 背景改动 = 框内**非墨迹**位置的平均像素变化，那些位置本不该被动）：
//
//   banner.jpg（纯色印刷体，引擎标定场景）
//     DELVIERY      引擎 90.8% / 12.9    兜底 89.5% / 41.6
//     CUSTOM        引擎 98.1% / 11.7    兜底 94.6% / 25.8
//     Vorg BANNER   引擎 93.6% / 12.6    兜底 87.5% / 40.2
//     COLORS 行     引擎 49.8% / 10.9    兜底 28.9% / 118.9
//
//   mid.png（金色渐变艺术字）
//     中秋佳节       引擎 46.9% / 23.7    兜底 100.0% / 30.6
//
// 结论有两面，必须都记住：
//   1. 印刷体上引擎全面占优，背景改动只有兜底的 1/3；
//   2. **渐变艺术字上引擎会输**——Otsu 二分把渐变字的暗部判成了背景。
//      而兜底那个 100% 是单边指标的假象：它把整框都刷了一遍，
//      残留当然是 0（「把整框涂黑」也能拿 100%），代价是背景改动 30.6。
//
// 因为存在明确的劣势场景，引擎在 image-generation.ts 里**不是无条件优先**，
// 而是与其它通道一样要过 hasVisibleLocalEdit 校验，失败即让位给下一通道。

export type TextEngineRegion = {
  /** 该区域的原文案（引擎据此判断哪些区域真的被改动） */
  text: string;
  /** 替换后的新文案；与 text 相同表示该区域不动，引擎会跳过它 */
  targetText?: string;
  /** 归一化坐标 0~1 */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextEngineEraseInput = {
  imageBuffer: Buffer;
  regions: TextEngineRegion[];
  timeoutMs?: number;
};

export type TextEngineEraseResult = {
  buffer: Buffer;
  width: number;
  height: number;
  erasedRegions: number;
};

export function getTextEngineConfig() {
  const baseUrl = (process.env.TEXT_ENGINE_BASE_URL || "").trim().replace(/\/+$/, "");
  const timeoutMs = Number(process.env.TEXT_ENGINE_TIMEOUT_MS || 20000);
  return {
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, timeoutMs) : 20000,
    configured: Boolean(baseUrl),
  };
}

export function isTextEngineConfigured() {
  return getTextEngineConfig().configured;
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { baseUrl } = getTextEngineConfig();
  if (!baseUrl) throw new Error("TEXT_ENGINE_BASE_URL 未配置");
  // 引擎处理是 CPU 密集的同步计算，没有超时会把整个 text_edit 请求拖死。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`引擎返回 ${response.status}: ${text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(text) as { code?: number; message?: string; data?: T };
    if (parsed.code !== 0 || !parsed.data) {
      throw new Error(parsed.message || "引擎返回异常结构");
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用引擎擦除指定文字区域，返回干净底图。
 *
 * 只传**真正被修改**的区域。传全部区域会让引擎把用户没动的行也擦掉，
 * 站点侧正是踩过这个坑才有了 createModifiedRegionsMask。
 */
export async function eraseTextWithEngine(
  input: TextEngineEraseInput,
): Promise<TextEngineEraseResult> {
  const { timeoutMs } = getTextEngineConfig();
  const data = await postJson<{
    image_base64: string;
    width: number;
    height: number;
    erased_regions: number;
  }>(
    "/api/inline/replace",
    {
      image_base64: input.imageBuffer.toString("base64"),
      erase_only: true,
      regions: input.regions.map(region => ({
        text: region.text,
        target_text: region.targetText,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      })),
    },
    input.timeoutMs ?? timeoutMs,
  );
  return {
    buffer: Buffer.from(data.image_base64, "base64"),
    width: data.width,
    height: data.height,
    erasedRegions: data.erased_regions,
  };
}

/** 健康检查。未配置时返回 false 而不抛错，让调用方静默跳过该通道。 */
export async function isTextEngineHealthy(timeoutMs = 3000): Promise<boolean> {
  const { baseUrl } = getTextEngineConfig();
  if (!baseUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const parsed = (await response.json()) as { data?: { ready?: boolean } };
    return Boolean(parsed?.data?.ready);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
