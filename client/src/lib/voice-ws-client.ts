/**
 * 腾讯云实时语音识别 WebSocket 客户端（浏览器直连，音频不经过 ArtX 服务器）。
 *
 * 协议（https://cloud.tencent.com/document/product/1093/48982）：
 *   上行：二进制帧 = 裸 PCM（16k / 16bit / 单声道），建议每 200ms 发 6400 字节；
 *         结束时发送文本帧 {"type":"end"}。
 *   下行：JSON 文本帧
 *     { code, message, voice_id, final?, result?: { slice_type, index, voice_text_str } }
 *     - 首包 code=0 且无 result → 握手成功
 *     - slice_type 0/1 = 句中临时结果，2 = 该句稳态结果（同一 index 会被反复覆盖）
 *     - final=1 → 全部识别结束，服务端随后关闭连接
 *     - code≠0 → 出错
 */

export type AsrServerMessage = {
  code: number;
  message?: string;
  voice_id?: string;
  final?: number;
  result?: {
    slice_type?: number;
    index?: number;
    voice_text_str?: string;
  };
};

export type VoiceWsHandlers = {
  onReady?: () => void;
  /** 当前完整文本（所有句子拼接后的结果，含正在说的这一句）。 */
  onText?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

/** 把逐句结果按 index 拼成完整文本。纯函数，便于单测。 */
export function applyAsrResult(sentences: Map<number, string>, message: AsrServerMessage) {
  const result = message.result;
  if (!result || typeof result.index !== "number") return joinSentences(sentences);
  sentences.set(result.index, result.voice_text_str || "");
  return joinSentences(sentences);
}

export function joinSentences(sentences: Map<number, string>) {
  return Array.from(sentences.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text)
    .join("");
}

const ASR_ERROR_HINTS: Record<number, string> = {
  4001: "语音参数异常，请重试",
  4002: "语音服务鉴权失败",
  4003: "语音服务暂未开通",
  4004: "语音服务额度不足",
  4005: "语音服务账户欠费",
  4008: "长时间未检测到声音，已自动结束",
  4009: "网络中断，请重试",
};

export class VoiceWsClient {
  private ws: WebSocket | null = null;
  private sentences = new Map<number, string>();
  private ready = false;
  private finished = false;
  private endSent = false;
  private finalResolvers: Array<() => void> = [];

  constructor(private handlers: VoiceWsHandlers = {}) {}

  get text() {
    return joinSentences(this.sentences);
  }

  /** 连接并等待握手包。超时 8s。 */
  connect(signedUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };
      const timer = window.setTimeout(() => fail("语音服务连接超时"), 8_000);

      const ws = new WebSocket(signedUrl);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let message: AsrServerMessage;
        try {
          message = JSON.parse(event.data) as AsrServerMessage;
        } catch {
          return;
        }
        if (message.code !== 0) {
          const hint = ASR_ERROR_HINTS[message.code] || message.message || "语音识别失败";
          window.clearTimeout(timer);
          fail(hint);
          this.handlers.onError?.(hint);
          this.markFinished();
          return;
        }
        if (!this.ready) {
          this.ready = true;
          window.clearTimeout(timer);
          if (!settled) {
            settled = true;
            resolve();
          }
          this.handlers.onReady?.();
        }
        if (message.result) {
          this.handlers.onText?.(applyAsrResult(this.sentences, message));
        }
        if (message.final === 1) {
          this.handlers.onFinal?.(this.text);
          this.markFinished();
        }
      };

      ws.onerror = () => {
        window.clearTimeout(timer);
        fail("语音服务连接失败");
      };

      ws.onclose = () => {
        window.clearTimeout(timer);
        fail("语音服务连接已关闭");
        this.markFinished();
        this.handlers.onClose?.();
      };
    });
  }

  sendAudio(chunk: ArrayBuffer) {
    if (!this.ready || this.endSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
  }

  /** 发送结束包，并等待 final 包（最多 3s），返回最终文本。 */
  async end(): Promise<string> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.endSent) {
      this.endSent = true;
      this.ws.send(JSON.stringify({ type: "end" }));
    }
    if (!this.finished) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 3_000);
        this.finalResolvers.push(() => {
          window.clearTimeout(timer);
          resolve();
        });
      });
    }
    this.close();
    return this.text;
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.onclose = null;
      ws.close();
    }
    this.markFinished();
  }

  private markFinished() {
    if (this.finished) return;
    this.finished = true;
    const resolvers = this.finalResolvers;
    this.finalResolvers = [];
    resolvers.forEach((fn) => fn());
  }
}
