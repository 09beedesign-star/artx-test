/** 社区所有出口共用真实会话，禁止另建 authToken 登录态。 */
export function readCommunityToken(): string {
  try {
    const raw = localStorage.getItem("artx-auth-session");
    const session = raw ? JSON.parse(raw) : null;
    return typeof session?.token === "string" ? session.token : "";
  } catch {
    return "";
  }
}

export function communityAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = readCommunityToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
