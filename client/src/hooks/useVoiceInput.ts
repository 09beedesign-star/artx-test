/**
 * 语音输入提示词 · React Hook。
 *
 * 流程：POST /api/voice/session 拿签名地址 → 打开麦克风 → 浏览器直连腾讯云推 PCM
 *      → 实时回调识别文本 → 停止时发结束包 → POST /api/voice/session/finish 隐形结算。
 *
 * 前端不展示任何扣费文案；仅当后端真实扣了整数积分时广播 artx:credits-updated 刷新顶栏。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_CHUNK_SAMPLES, VOICE_MAX_SECONDS, VOICE_SAMPLE_RATE, type VoiceFinishResponse, type VoiceSessionResponse } from "@shared/voice-input";
import { VoiceWsClient } from "@/lib/voice-ws-client";
import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "@/lib/api-base-url";

export type VoiceInputStatus = "idle" | "connecting" | "recording" | "stopping";

export type UseVoiceInputOptions = {
  /** 识别过程中持续回调当前这一轮的完整文本。 */
  onText?: (text: string) => void;
  /** 本轮结束（含自动停止）时回调最终文本。 */
  onFinish?: (text: string) => void;
  onError?: (message: string) => void;
};

function getVoiceApiBaseUrl() {
  if (typeof window === "undefined") return "";
  const configured = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (configured) return configured;
  return defaultApiBaseUrlForCurrentHost(window.location.origin) || window.location.origin.replace(/\/+$/, "");
}

function getStoredAuthToken() {
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

async function voiceFetch<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const token = getStoredAuthToken();
  const response = await fetch(`${getVoiceApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
    keepalive: true,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}

/** Float32 [-1,1] 降采样到 16k 并转 Int16。纯函数，便于单测。 */
export function downsampleToInt16(input: Float32Array, inputRate: number, outputRate = VOICE_SAMPLE_RATE) {
  const ratio = inputRate / outputRate;
  const length = ratio <= 1 ? input.length : Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    // 区间均值降采样，比取点抗混叠效果好。
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < input.length; j += 1) {
      sum += input[j];
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function isVoiceInputSupported() {
  return typeof window !== "undefined"
    && typeof WebSocket !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const statusRef = useRef<VoiceInputStatus>("idle");
  const clientRef = useRef<VoiceWsClient | null>(null);
  const sessionIdRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pendingRef = useRef<Int16Array>(new Int16Array(0));
  const timerRef = useRef<number | null>(null);
  const textRef = useRef("");

  /** 读 ref 的最新值（异步等待期间可能被 stop() 改掉，不能让 TS 按赋值收窄）。 */
  const currentStatus = (): VoiceInputStatus => statusRef.current;

  const updateStatus = useCallback((next: VoiceInputStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const releaseAudio = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    pendingRef.current = new Int16Array(0);
  }, []);

  const settle = useCallback(async (recognized: boolean) => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = "";
    if (!sessionId) return;
    try {
      const { ok, data } = await voiceFetch<VoiceFinishResponse>("/api/voice/session/finish", { sessionId, recognized });
      if (ok && data.chargedCredits > 0 && data.balance >= 0) {
        window.dispatchEvent(new CustomEvent("artx:credits-updated", { detail: { balance: data.balance, reason: "voice-input" } }));
      }
    } catch {
      // 结算失败不打扰用户：服务端会在下一次开会话时按「被放弃」兜底结算。
    }
  }, []);

  const fail = useCallback((message: string) => {
    releaseAudio();
    clientRef.current?.close();
    clientRef.current = null;
    void settle(!!textRef.current.trim());
    setError(message);
    updateStatus("idle");
    optionsRef.current.onError?.(message);
  }, [releaseAudio, settle, updateStatus]);

  const stop = useCallback(async () => {
    if (statusRef.current !== "recording" && statusRef.current !== "connecting") return;
    updateStatus("stopping");
    // 先把缓冲里不足一包的尾巴送出去，再停麦克风。
    const tail = pendingRef.current;
    if (tail.length > 0) clientRef.current?.sendAudio(tail.slice().buffer);
    releaseAudio();
    const client = clientRef.current;
    clientRef.current = null;
    const finalText = client ? await client.end() : textRef.current;
    textRef.current = finalText;
    if (finalText) optionsRef.current.onText?.(finalText);
    await settle(!!finalText.trim());
    updateStatus("idle");
    optionsRef.current.onFinish?.(finalText);
  }, [releaseAudio, settle, updateStatus]);

  const start = useCallback(async () => {
    if (statusRef.current !== "idle") return;
    if (!isVoiceInputSupported()) {
      const message = "当前浏览器不支持语音输入";
      setError(message);
      optionsRef.current.onError?.(message);
      return;
    }
    setError("");
    setElapsedSeconds(0);
    textRef.current = "";
    updateStatus("connecting");

    // 1. 先拿麦克风权限：用户拒绝时不创建会话、不产生任何费用。
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      updateStatus("idle");
      const message = "无法访问麦克风，请在浏览器地址栏允许麦克风权限";
      setError(message);
      optionsRef.current.onError?.(message);
      return;
    }
    streamRef.current = stream;

    // 2. 创建会话（余额闸门 / 每日限额都在服务端）。
    let session: VoiceSessionResponse;
    try {
      const { ok, status: httpStatus, data } = await voiceFetch<VoiceSessionResponse>("/api/voice/session");
      if (!ok) {
        if (httpStatus === 401) window.dispatchEvent(new CustomEvent("artx:login-required", { detail: { reason: "voice-input" } }));
        throw new Error(data.error || (httpStatus === 402 ? "积分不足" : "语音输入暂不可用"));
      }
      session = data;
    } catch (err) {
      releaseAudio();
      updateStatus("idle");
      const message = err instanceof Error ? err.message : "语音输入暂不可用";
      setError(message);
      optionsRef.current.onError?.(message);
      return;
    }
    if (currentStatus() !== "connecting") {
      // 用户在连接过程中点了停止。
      releaseAudio();
      void settle(false);
      return;
    }
    sessionIdRef.current = session.sessionId;

    // 3. 连接腾讯云。
    const client = new VoiceWsClient({
      onText: (text) => {
        textRef.current = text;
        optionsRef.current.onText?.(text);
      },
      onError: (message) => {
        if (statusRef.current === "recording") fail(message);
      },
      onClose: () => {
        if (statusRef.current === "recording") void stop();
      },
    });
    clientRef.current = client;
    try {
      await client.connect(session.url);
    } catch (err) {
      fail(err instanceof Error ? err.message : "语音服务连接失败");
      return;
    }
    if (currentStatus() !== "connecting") return;

    // 4. 采集 → 16k Int16 → 每 200ms（3200 采样）推一包。
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioCtor();
    contextRef.current = context;
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    const mute = context.createGain();
    mute.gain.value = 0;
    processor.onaudioprocess = (event) => {
      const samples = downsampleToInt16(event.inputBuffer.getChannelData(0), context.sampleRate);
      const merged = new Int16Array(pendingRef.current.length + samples.length);
      merged.set(pendingRef.current, 0);
      merged.set(samples, pendingRef.current.length);
      let offset = 0;
      while (merged.length - offset >= VOICE_CHUNK_SAMPLES) {
        clientRef.current?.sendAudio(merged.slice(offset, offset + VOICE_CHUNK_SAMPLES).buffer);
        offset += VOICE_CHUNK_SAMPLES;
      }
      pendingRef.current = merged.slice(offset);
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    if (context.state === "suspended") await context.resume().catch(() => undefined);

    updateStatus("recording");
    const startedAt = Date.now();
    const maxSeconds = session.maxSeconds || VOICE_MAX_SECONDS;
    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= maxSeconds) void stop();
    }, 250);
  }, [fail, releaseAudio, settle, stop, updateStatus]);

  const toggle = useCallback(() => {
    if (statusRef.current === "idle") void start();
    else void stop();
  }, [start, stop]);

  // 卸载 / 切页：立即释放麦克风，并尽力结算。
  useEffect(() => () => {
    if (statusRef.current === "idle") return;
    statusRef.current = "idle";
    releaseAudio();
    clientRef.current?.close();
    clientRef.current = null;
    void settle(!!textRef.current.trim());
  }, [releaseAudio, settle]);

  return {
    status,
    isActive: status !== "idle",
    error,
    elapsedSeconds,
    maxSeconds: VOICE_MAX_SECONDS,
    start,
    stop,
    toggle,
  };
}
