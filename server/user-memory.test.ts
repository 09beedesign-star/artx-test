import { describe, expect, it } from "vitest";
import {
  USER_MEMORY_LIMITS,
  appendPromptMemory,
  buildUserMemoryContext,
  createEmptyUserMemoryDocument,
  normalizeUserMemoryPayload,
  upsertProjectMemory,
  FREE_MEMORY_LIMITS,
  SKILL_DIMENSION_LIMIT,
  STORAGE_MEMORY_LIMITS,
  getMemoryContextTotalLimit,
  getMemoryLimitsForPlan,
  isSkillOversized,
} from "../shared/user-memory";
import { MEMBERSHIP_PLANS } from "../shared/billing-config";

describe("默认值", () => {
  it("上下文开关默认关闭", () => {
    /*
     * 用户原话是「默认用户点击激活这个按钮之后就会开启上下文」——
     * 即点击后开启，不是一上来就开着。
     * 📌 测默认值时**不能传那个字段**，传了就是作弊解。
     */
    expect(createEmptyUserMemoryDocument().contextEnabled).toBe(false);
    expect(normalizeUserMemoryPayload({}).contextEnabled).toBe(false);
  });

  it("只有显式 true 才算开启，字符串 'true' 不算", () => {
    expect(normalizeUserMemoryPayload({ contextEnabled: true }).contextEnabled).toBe(true);
    expect(
      normalizeUserMemoryPayload({ contextEnabled: "true" as unknown as boolean }).contextEnabled
    ).toBe(false);
  });
});

describe("服务端归一化不信客户端", () => {
  it("超长长期记忆被截断到上限", () => {
    const payload = normalizeUserMemoryPayload({ longTerm: "习".repeat(5000) });
    expect(payload.longTerm.length).toBe(USER_MEMORY_LIMITS.longTerm);
  });

  it("丢弃缺 projectId 或空 note 的项目记忆", () => {
    const payload = normalizeUserMemoryPayload({
      projects: [
        { projectId: "p1", note: "黑金配色" },
        { note: "没有 projectId" },
        { projectId: "p2", note: "   " },
      ],
    });
    expect(payload.projects.map(item => item.projectId)).toEqual(["p1"]);
  });

  it("非数组字段不会让归一化抛错", () => {
    const payload = normalizeUserMemoryPayload({
      projects: "nope",
      recentPrompts: 42,
    });
    expect(payload.projects).toEqual([]);
    expect(payload.recentPrompts).toEqual([]);
  });
});

describe("buildUserMemoryContext 分层拼装", () => {
  const doc = {
    longTerm: "偏好极简北欧风，主色 #1F2937，不要用卡通质感",
    projects: [
      { projectId: "p1", title: "春季新品", note: "浅灰水泥台面，柔和自然光", updatedAt: "2026-10-17T00:00:00.000Z" },
      { projectId: "p2", title: "无关项目", note: "赛博朋克霓虹", updatedAt: "2026-10-16T00:00:00.000Z" },
    ],
    recentPrompts: [
      { prompt: "白色马克杯，北欧风", projectId: "p1", createdAt: "2026-10-17T01:00:00.000Z" },
      { prompt: "霓虹夜景", projectId: "p2", createdAt: "2026-10-16T01:00:00.000Z" },
    ],
  };

  it("没有任何记忆时返回空串，而不是占位文字", () => {
    // 返回占位文字会白烧 token，且让模型以为"用户没有偏好"是一条偏好。
    expect(buildUserMemoryContext({ document: createEmptyUserMemoryDocument() })).toBe("");
  });

  it("长期记忆始终在最前面", () => {
    const context = buildUserMemoryContext({ document: doc });
    expect(context.startsWith("【用户长期设计习惯】")).toBe(true);
  });

  it("给了 projectId 就只带该项目的记忆与提示词", () => {
    const context = buildUserMemoryContext({ document: doc, projectId: "p1" });
    expect(context).toContain("浅灰水泥台面");
    expect(context).toContain("白色马克杯");
    // 另一个项目的内容绝不能串进来 —— 否则「以项目为单位」的记忆就失去意义。
    expect(context).not.toContain("赛博朋克霓虹");
    expect(context).not.toContain("霓虹夜景");
  });

  it("includeRecentPrompts=false 时只带规则层，不带历史提示词", () => {
    const context = buildUserMemoryContext({
      document: doc,
      projectId: "p1",
      includeRecentPrompts: false,
    });
    expect(context).toContain("浅灰水泥台面");
    expect(context).not.toContain("白色马克杯");
  });

  it("长期记忆在关闭画布开关时依然生效", () => {
    // 用户在个人中心写的规则是显式声明，不该被画布开关关掉。
    const context = buildUserMemoryContext({
      document: { longTerm: doc.longTerm, projects: [], recentPrompts: [] },
      includeRecentPrompts: false,
    });
    expect(context).toContain("极简北欧风");
  });

  it("总量超上限时从尾部裁，长期记忆必须保住", () => {
    const context = buildUserMemoryContext({
      document: {
        longTerm: "A".repeat(USER_MEMORY_LIMITS.longTerm),
        projects: Array.from({ length: 10 }, (_, i) => ({
          projectId: "p1",
          note: "B".repeat(USER_MEMORY_LIMITS.projectNote),
          updatedAt: `2026-10-1${i}T00:00:00.000Z`,
        })),
        recentPrompts: Array.from({ length: 10 }, (_, i) => ({
          prompt: "C".repeat(USER_MEMORY_LIMITS.recentPrompt),
          projectId: "p1",
          createdAt: `2026-10-1${i}T00:00:00.000Z`,
        })),
      },
      projectId: "p1",
    });
    expect(context.length).toBeLessThanOrEqual(USER_MEMORY_LIMITS.total);
    expect(context).toContain("A".repeat(100));
  });
});

describe("appendPromptMemory", () => {
  it("同项目同文本去重，避免重试把配额占满", () => {
    let prompts = appendPromptMemory([], { prompt: "马克杯", projectId: "p1", createdAt: "2026-10-17T00:00:00.000Z" });
    prompts = appendPromptMemory(prompts, { prompt: "马克杯", projectId: "p1", createdAt: "2026-10-17T00:01:00.000Z" });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].createdAt).toBe("2026-10-17T00:01:00.000Z");
  });

  it("同文本不同项目各记一条", () => {
    let prompts = appendPromptMemory([], { prompt: "马克杯", projectId: "p1", createdAt: "2026-10-17T00:00:00.000Z" });
    prompts = appendPromptMemory(prompts, { prompt: "马克杯", projectId: "p2", createdAt: "2026-10-17T00:01:00.000Z" });
    expect(prompts).toHaveLength(2);
  });

  it("空提示词不入库", () => {
    expect(appendPromptMemory([], { prompt: "   ", createdAt: "2026-10-17T00:00:00.000Z" })).toEqual([]);
  });

  it("超出容量时丢最老的", () => {
    let prompts: ReturnType<typeof appendPromptMemory> = [];
    for (let i = 0; i < 60; i += 1) {
      prompts = appendPromptMemory(prompts, { prompt: `p${i}`, createdAt: `2026-10-17T00:${String(i).padStart(2, "0")}:00.000Z` });
    }
    expect(prompts).toHaveLength(50);
    expect(prompts[0].prompt).toBe("p59");
  });
});

describe("upsertProjectMemory", () => {
  it("同 projectId 覆盖而不是追加", () => {
    const first = upsertProjectMemory([], { projectId: "p1", note: "黑金", updatedAt: "2026-10-17T00:00:00.000Z" });
    const second = upsertProjectMemory(first, { projectId: "p1", note: "白银", updatedAt: "2026-10-17T01:00:00.000Z" });
    expect(second).toHaveLength(1);
    expect(second[0].note).toBe("白银");
  });

  it("空 note 等于删除该项目记忆", () => {
    const first = upsertProjectMemory([], { projectId: "p1", note: "黑金", updatedAt: "2026-10-17T00:00:00.000Z" });
    expect(upsertProjectMemory(first, { projectId: "p1", note: "", updatedAt: "2026-10-17T01:00:00.000Z" })).toEqual([]);
  });
});

describe("【2026-10-18】长期记忆容量按会员档位分级 + Skill 固定上限", () => {
  const big = (ch: string, n: number) => ch.repeat(n);

  it("Free / 未知档 = 每维度 300、合计 1200（与改造前一致）", () => {
    expect(getMemoryLimitsForPlan("free")).toEqual({ perDimension: 300, total: 1200 });
    expect(getMemoryLimitsForPlan(undefined)).toEqual(FREE_MEMORY_LIMITS);
    expect(getMemoryLimitsForPlan("no-such-plan")).toEqual(FREE_MEMORY_LIMITS);
  });

  it("付费档读定价表 memoryLimits，且档位越高容量不减", () => {
    const ids = ["lite", "creator", "pro", "studio", "business"];
    const per = ids.map(id => getMemoryLimitsForPlan(id).perDimension);
    for (let i = 1; i < per.length; i++) expect(per[i]).toBeGreaterThanOrEqual(per[i - 1]);
    expect(getMemoryLimitsForPlan("studio").perDimension).toBe(10000);
    for (const id of ids) {
      expect(getMemoryLimitsForPlan(id)).toEqual(MEMBERSHIP_PLANS.find(p => p.id === id)!.memoryLimits);
    }
  });

  it("保存归一化按档位截断手写维度：Free 截到 300，Studio 保留 1 万字", () => {
    const payload = { projectMemory: big("P", 10000) };
    expect(normalizeUserMemoryPayload(payload).projectMemory).toHaveLength(300);
    expect(normalizeUserMemoryPayload(payload, getMemoryLimitsForPlan("studio")).projectMemory).toHaveLength(10000);
  });

  it("手写维度合计受 total 约束（三维度顶格时后面的被裁）", () => {
    const doc = normalizeUserMemoryPayload(
      { projectMemory: big("P", 500), generalRules: big("G", 500), regularMemory: big("R", 500) },
      { perDimension: 500, total: 1200 }
    );
    expect(doc.projectMemory!.length + doc.generalRules!.length + doc.regularMemory!.length).toBe(1200);
    expect(doc.regularMemory).toHaveLength(200);
  });

  it("Skill 不走档位：Free 也能存 SKILL_DIMENSION_LIMIT 字，且不占手写维度合计", () => {
    const doc = normalizeUserMemoryPayload({ skill: big("S", SKILL_DIMENSION_LIMIT), regularMemory: big("R", 300) });
    expect(doc.skill).toHaveLength(SKILL_DIMENSION_LIMIT);
    expect(doc.regularMemory).toHaveLength(300);
  });

  it("isSkillOversized 以 SKILL_DIMENSION_LIMIT 为界", () => {
    expect(isSkillOversized(big("S", SKILL_DIMENSION_LIMIT))).toBe(false);
    expect(isSkillOversized(big("S", SKILL_DIMENSION_LIMIT + 1))).toBe(true);
    expect(isSkillOversized(undefined)).toBe(false);
  });

  it("注入按当前档位裁：降级后库里的超额内容不再进提示词", () => {
    const document = { ...createEmptyUserMemoryDocument(), projectMemory: big("P", 5000) };
    const asFree = buildUserMemoryContext({ document });
    const asPro = buildUserMemoryContext({ document, limits: getMemoryLimitsForPlan("pro") });
    expect(asFree).toContain(big("P", 300));
    expect(asFree).not.toContain(big("P", 301));
    expect(asPro).toContain(big("P", 5000));
  });

  it("Skill 整份进注入，不被总闸门截掉；无 Skill 时 Free 总闸门仍是 4200", () => {
    const skill = big("S", 50000);
    const ctx = buildUserMemoryContext({ document: { ...createEmptyUserMemoryDocument(), skill } });
    expect(ctx).toContain(skill);
    expect(getMemoryContextTotalLimit()).toBe(USER_MEMORY_LIMITS.total);
  });

  it("存储侧上限 = 全档最大值（读库不能把付费期内容截掉）", () => {
    expect(STORAGE_MEMORY_LIMITS.perDimension).toBe(
      Math.max(...MEMBERSHIP_PLANS.map(p => p.memoryLimits?.perDimension ?? 0))
    );
  });
});
