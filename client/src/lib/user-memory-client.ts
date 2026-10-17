import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "@/lib/api-base-url";
import {
  createEmptyUserMemoryDocument,
  type UserMemoryDocument,
} from "../../../shared/user-memory";

/**
 * 「长期记忆 / 上下文开关」的前端读写。
 *
 * ⚠️⚠️ 记忆**只存服务端、按账号走**，不进 localStorage。
 *    用户要的是「跟随用户账号」，换电脑、换浏览器都该在；
 *    📌 存本地的后果是用户在公司写的习惯回家就没了，
 *    而且他会以为功能坏了而不是"本来就不同步"。
 *
 * ⚠️ 开关状态也在服务端：它决定服务端是否注入上下文，
 *    只存前端的话，服务端读不到，开关等于是个装饰品（点了没用、零报错）。
 */

function getApiBaseUrl() {
  const normalized = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (normalized) return normalized;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return ART_X_TEST_API_BASE_URL;
  }
  return "";
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token ? { Authorization: `Bearer ${parsed.token}` } : {};
  } catch {
    return {};
  }
}

async function readDocument(response: Response): Promise<UserMemoryDocument> {
  /*
   * ⚠️⚠️⚠️ **先判 status，再判 body。**
   * 反过来的话，413/502 返回的那段 HTML 会在 JSON.parse 处炸掉，
   * 错误信息变成「Unexpected token <」，把人引向"接口没连上"的错误方向。
   * （与 client/src/lib/ai.ts 的 fetchAiJson 同一条教训。）
   */
  if (!response.ok) {
    throw new Error(`读取长期记忆失败（HTTP ${response.status}）`);
  }
  const data = (await response.json()) as { document?: UserMemoryDocument };
  return data.document ? data.document : createEmptyUserMemoryDocument();
}

/** 读取当前账号的记忆文档。未登录时返回空文档，不抛错。 */
export async function fetchUserMemory(): Promise<UserMemoryDocument> {
  const headers = getAuthHeaders();
  // 没有 token 就不必打一次必然 401 的请求。
  if (!headers.Authorization) return createEmptyUserMemoryDocument();
  const response = await fetch(`${getApiBaseUrl()}/api/user/memory`, { headers });
  return readDocument(response);
}

/**
 * 保存长期记忆文本和/或上下文开关。
 *
 * ⚠️ **只传要改的字段。** 服务端是 patch 语义，
 *    但前端若每次都把两个字段都带上，个人中心那次保存就会把
 *    画布开关按页面初始值覆盖回去 —— 用户在画布刚打开的开关会被
 *    个人中心的一次保存悄悄关掉。
 */
export async function saveUserMemory(patch: {
  longTerm?: string;
  projectMemory?: string;
  skill?: string;
  generalRules?: string;
  regularMemory?: string;
  contextEnabled?: boolean;
}): Promise<UserMemoryDocument> {
  const headers = getAuthHeaders();
  if (!headers.Authorization) throw new Error("请先登录后再保存长期记忆");
  const response = await fetch(`${getApiBaseUrl()}/api/user/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(patch),
  });
  return readDocument(response);
}

/** 记一条项目记忆（同 projectId 覆盖；note 传空等于删除）。 */
export async function saveProjectMemory(entry: {
  projectId: string;
  title?: string;
  note: string;
}): Promise<UserMemoryDocument> {
  const headers = getAuthHeaders();
  if (!headers.Authorization) throw new Error("请先登录");
  const response = await fetch(`${getApiBaseUrl()}/api/user/memory/project`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(entry),
  });
  return readDocument(response);
}

/**
 * 开关变化的全站广播事件名。
 *
 * ⚠️ 画布和个人中心是两个页面，各自读一次接口就完事的话，
 *    在一处改了另一处不会刷新 —— 表现是「我明明开了，另一个页面还显示关」。
 *    📌 自派发自监听的事件必须可识别来源，否则会和自己的回写互相打转。
 */
export const USER_MEMORY_CHANGED_EVENT = "artx:user-memory-changed";

export function broadcastUserMemoryChange(document: UserMemoryDocument) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(USER_MEMORY_CHANGED_EVENT, { detail: document })
  );
}
