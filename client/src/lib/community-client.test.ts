import { afterEach, describe, expect, it, vi } from "vitest";
import { communityAuthHeaders, readCommunityToken } from "./community-client";

afterEach(() => vi.unstubAllGlobals());
describe("社区登录态唯一事实源", () => {
  it("读取真实会话，不读取旧的 authToken", () => {
    const getItem = vi.fn((key: string) => key === "artx-auth-session" ? JSON.stringify({ token: "valid-session" }) : "wrong-token");
    vi.stubGlobal("localStorage", { getItem });
    expect(communityAuthHeaders({ "Content-Type": "application/json" })).toEqual({ "Content-Type": "application/json", Authorization: "Bearer valid-session" });
    expect(getItem).toHaveBeenCalledWith("artx-auth-session");
    expect(getItem).not.toHaveBeenCalledWith("authToken");
  });
  it.each([null, "{", "{}", '{"token":null}', '{"token":123}'])("无效会话 %s 不发送伪造凭据", value => {
    vi.stubGlobal("localStorage", { getItem: () => value });
    expect(readCommunityToken()).toBe("");
    expect(communityAuthHeaders()).toEqual({});
  });
  it("存储不可读时不崩溃", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(communityAuthHeaders()).toEqual({});
  });
});
