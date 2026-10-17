import { isFreePlanId, MEMBERSHIP_PLANS, type MemoryLimits } from "./billing-config";

/**
 * 【2026-10-18】Skill 维度的固定上限 —— 因上传 skill 文档，需容纳完整文档。
 * 
 * 数据：本地 skill 文档 90 分位线约 50-70 KB，极端案例 685 KB。
 * 设为 100,000 字符（约 100 KB）可覆盖绝大部分场景；超过时前端提示精简。
 */
export const SKILL_DIMENSION_LIMIT = 100_000;

/**
 * 按账号的「分层记忆」—— 唯一事实源。
 *
 * 【为什么要分层，而不是把历史全塞进请求】
 * 2026-10-17 用线上真实数据估算过：重度用户三个月累计约 20-30 万 token，
 * 每发一次请求光读历史就要 7-10 元，而一次对话只收 20 积分（约 0.14 元）。
 * 📌 **「把全部历史塞进上下文」不是贵一点，是贵两个数量级**，必须分层 + 封顶。
 *
 * 三层，优先级从高到低：
 *   1. 长期记忆（`longTerm`）—— 用户在个人中心亲手写的设计习惯。
 *      **权重最高**：这是用户显式声明的规则，不是系统猜的。
 *   2. 项目记忆（`projectNotes`）—— 当前项目/画布定下的风格与主体。
 *   3. 近期片段（`recentPrompts`）—— 过去用过的提示词，供"照上次那样"指代。
 *
 * ⚠️⚠️⚠️ 每一层都有**字符硬上限**，且总量再封一次顶。
 * 📌 判据：**没有上界的「压缩」只是把溢出推迟发生，不是解决溢出**
 *    （与 client/src/lib/ai-intent.ts 的 MAX_SUMMARIZED_MESSAGES 同一条教训）。
 */

/**
 * 各层字符上限。
 *
 * 取值口径：汉字约 1 字 ≈ 1 token，英文约 4 字符 ≈ 1 token。
 * 这里按最坏情况（全中文）折算，所以"字符数 ≈ token 数"。
 * 1200 + 1500 + 1500 ≈ 4200 token 封顶，对应每次请求多花约 0.05 元。
 */
export const USER_MEMORY_LIMITS = {
  /** 长期记忆（用户手写）。1200 字够写清十几条设计习惯，再长用户自己也维护不动。 */
  longTerm: 1200,
  /**
   * 四维度长期记忆各维度上限（替代单一 longTerm 的分类方案）。
   * 四维度总量不超过 longTerm 上限（1200），拼进上下文时四个维度合并。
   */
  projectMemoryDimension: 300,
  skillDimension: 300,
  generalRulesDimension: 300,
  regularMemoryDimension: 300,
  /** 单条项目记忆。 */
  projectNote: 500,
  /** 项目记忆条数。 */
  projectNoteCount: 3,
  /** 单条历史提示词。 */
  recentPrompt: 300,
  /** 历史提示词条数。 */
  recentPromptCount: 5,
  /**
   * 拼装后的总字符上限 —— 最后一道闸。
   *
   * ⚠️ 不能只靠分层上限相乘：分层上限是"每层最多多少"，
   *    它们**同时顶格**时总量仍可能超预期。这一道按整体再裁一次。
   */
  total: 4200,
} as const;

/**
 * 【2026-10-17】长期记忆容量按会员档位分级 —— 唯一事实源在 billing-config 的 `memoryLimits`。
 *
 * Free / 未知档 = 现行上限（每维度 300 / 合计 1200），付费档读定价表。
 * 【2026-10-18】Skill 维度**不参与档位分级**：它是上传的文档，统一用 SKILL_DIMENSION_LIMIT，
 *   也不计入 `total`（`total` 只管项目记忆 / 通用规则 / 常规记忆三个手写维度）。
 * ⚠️⚠️ 截断点有三处（归一化保存 / 拼装注入 / 前端输入框），必须全部用这里的结果，
 *    只改一处 = 扩容被静默截断（A2 事故族）。
 */
export const FREE_MEMORY_LIMITS: MemoryLimits = {
  perDimension: USER_MEMORY_LIMITS.projectMemoryDimension,
  total: USER_MEMORY_LIMITS.longTerm,
};

export type { MemoryLimits };

/**
 * 存储侧上限 = 所有档位中的最大值。
 * 读库归一化必须用它：用户降级后，已存内容保留（注入时再按当前档位裁），
 * 重新升级即恢复 —— 不能因为读一次就把付费期写的内容永久截掉。
 */
export const STORAGE_MEMORY_LIMITS: MemoryLimits = MEMBERSHIP_PLANS.reduce<MemoryLimits>(
  (max, plan) => ({
    perDimension: Math.max(max.perDimension, plan.memoryLimits?.perDimension ?? 0),
    total: Math.max(max.total, plan.memoryLimits?.total ?? 0),
  }),
  { perDimension: USER_MEMORY_LIMITS.projectMemoryDimension, total: USER_MEMORY_LIMITS.longTerm }
);

export function getMemoryLimitsForPlan(planId?: string | null): MemoryLimits {
  if (!planId || isFreePlanId(planId)) return FREE_MEMORY_LIMITS;
  const plan = MEMBERSHIP_PLANS.find(item => item.id === planId);
  return plan?.memoryLimits ?? FREE_MEMORY_LIMITS;
}

/** 手写维度（受档位限制）。Skill 单独处理。 */
const WRITTEN_DIMENSIONS = ["projectMemory", "generalRules", "regularMemory"] as const;

/**
 * 拼装注入的总上限 = 手写维度合计 + 项目/近期两层固定 3000 + 本次 Skill 实际长度。
 * ⚠️ 按 Skill **实际长度**放宽而非加 SKILL_DIMENSION_LIMIT：后者会让没传 Skill 的用户
 *    总闸门也放宽 10 万字 → 最后一道闸形同虚设。Free 且无 Skill 时恰好 = 原 4200。
 */
export function getMemoryContextTotalLimit(limits: MemoryLimits = FREE_MEMORY_LIMITS, skillLength = 0): number {
  return limits.total + (USER_MEMORY_LIMITS.total - USER_MEMORY_LIMITS.longTerm) + Math.max(0, skillLength);
}

/** Skill 文档是否超限（前后端共用同一判据）。 */
export function isSkillOversized(text: string | undefined | null): boolean {
  return typeof text === "string" && text.trim().length > SKILL_DIMENSION_LIMIT;
}

/**
 * 手写维度按「每维度上限」裁剪后，再按「合计上限」依次裁剪（维度顺序即保留优先级）；
 * Skill 按 SKILL_DIMENSION_LIMIT 单独裁。
 */
function clampDimensions(
  values: Record<"projectMemory" | "skill" | "generalRules" | "regularMemory", string>,
  limits: MemoryLimits
) {
  let remaining = limits.total;
  const out = { ...values, skill: clampText(values.skill, SKILL_DIMENSION_LIMIT) };
  for (const key of WRITTEN_DIMENSIONS) {
    const text = clampText(out[key], Math.min(limits.perDimension, Math.max(remaining, 0)));
    out[key] = text;
    remaining -= text.length;
  }
  return out;
}

/** 一条项目记忆。 */
export type UserProjectMemory = {
  /** 项目 id（画布 id 或工作台项目 id）。 */
  projectId: string;
  /** 项目名，仅用于拼进提示词时给模型一个称呼。 */
  title?: string;
  /** 这个项目定下的风格 / 主体 / 约束。 */
  note: string;
  updatedAt: string;
};

/**
 * 一条历史提示词。
 * 
 * 2026-10-17 新增 conversationId：对话记忆现在**按对话隔离**
 * —— 每条提示词必须打上它来自哪个对话，才能让「对话 A 的记忆」
 * 不会泄漏进「对话 B 的记忆」。
 * 电商画布使用特殊 scope `"ecommerce"`。
 */
export type UserPromptMemory = {
  prompt: string;
  /** 关联的项目,便于按项目检索。 */
  projectId?: string;
  /**
   * 记忆作用域：画布 = `canvas:<projectId>:<conversationId>`，电商 = `ecommerce`。
   *
   * ⚠️ 老数据没有此字段 → **不属于任何对话**，按作用域筛选时一律排除。
   *    若把它当「全局」，它会同时出现在每一个对话里，
   *    正好违反「对话之间记忆相互独立」。
   */
  conversationId?: string;
  createdAt: string;
};

/** 某个账号的完整记忆文档。 */
export type UserMemoryDocument = {
  /** 用户在个人中心亲手写的长期记忆（旧版单一字段，向后兼容）。 */
  longTerm: string;
  /**
   * 四维度长期记忆（新版分类方案）。
   * 优先使用四维度；若四维度全空且 longTerm 有值，迁移到 regularMemory。
   */
  projectMemory?: string;
  skill?: string;
  generalRules?: string;
  regularMemory?: string;
  /**
   * 画布上下文开关。
   *
   * ⚠️ 默认 **false**：记忆会把用户过去的偏好带进每一次生成，
   *    这是对结果有实质影响的行为，必须由用户显式打开。
   *    📌 「全站默认都要 X」时默认才应该是 X —— 这里用户的原话是
   *    「默认用户点击激活这个按钮之后就会开启上下文」，
   *    即**点击后开启**，而不是一上来就开着。
   */
  contextEnabled: boolean;
  /**
   * 【2026-10-17】电商画布专属记忆开关（与画布对话记忆、长期记忆彼此独立）。
   * 默认 false。画布对话的开关不在这里，在每条会话元数据的 memoryEnabled 上。
   */
  ecommerceMemoryEnabled?: boolean;
  projects: UserProjectMemory[];
  recentPrompts: UserPromptMemory[];
  revision: number;
  updatedAt: string;
};

export function createEmptyUserMemoryDocument(): UserMemoryDocument {
  return {
    longTerm: "",
    projectMemory: "",
    skill: "",
    generalRules: "",
    regularMemory: "",
    contextEnabled: false,
    ecommerceMemoryEnabled: false,
    projects: [],
    recentPrompts: [],
    revision: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

function clampText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function asIso(value: unknown): string {
  return typeof value === "string" && value ? value : new Date().toISOString();
}

/**
 * 归一化外部载荷（可能来自旧版前端或被改过的请求）。
 *
 * ⚠️ 服务端必须**再归一化一次**，不能信客户端已经裁过。
 *    📌 判据：凡是「体积会决定服务能不能用」的约束，校验点必须在服务端
 *    （与 server/workspace-sync-store.ts 的 stripInlineImagesForSync 同一条）。
 */
export function normalizeUserMemoryPayload(
  input: unknown,
  limits: MemoryLimits = FREE_MEMORY_LIMITS
): Omit<UserMemoryDocument, "revision" | "updatedAt"> {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<UserMemoryDocument>;

  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const recentPrompts = Array.isArray(raw.recentPrompts) ? raw.recentPrompts : [];

  // 向后兼容：若四维度全空但 longTerm 有值，迁移到 regularMemory
  const legacyLongTerm = clampText(raw.longTerm, USER_MEMORY_LIMITS.longTerm);
  const hasNewDimensions =
    (raw.projectMemory && typeof raw.projectMemory === "string" && raw.projectMemory.trim()) ||
    (raw.skill && typeof raw.skill === "string" && raw.skill.trim()) ||
    (raw.generalRules && typeof raw.generalRules === "string" && raw.generalRules.trim()) ||
    (raw.regularMemory && typeof raw.regularMemory === "string" && raw.regularMemory.trim());

  const dims = clampDimensions(
    {
      projectMemory: typeof raw.projectMemory === "string" ? raw.projectMemory : "",
      skill: typeof raw.skill === "string" ? raw.skill : "",
      generalRules: typeof raw.generalRules === "string" ? raw.generalRules : "",
      regularMemory: typeof raw.regularMemory === "string" ? raw.regularMemory : "",
    },
    limits
  );

  return {
    longTerm: legacyLongTerm,
    projectMemory: dims.projectMemory,
    skill: dims.skill,
    generalRules: dims.generalRules,
    regularMemory: hasNewDimensions
      ? dims.regularMemory
      : legacyLongTerm
        ? legacyLongTerm
        : dims.regularMemory,
    contextEnabled: raw.contextEnabled === true,
    ecommerceMemoryEnabled: raw.ecommerceMemoryEnabled === true,
    projects: projects
      .filter((item): item is UserProjectMemory => Boolean(item && typeof item === "object" && (item as UserProjectMemory).projectId))
      .map(item => ({
        projectId: String(item.projectId),
        ...(item.title ? { title: clampText(item.title, 60) } : {}),
        note: clampText(item.note, USER_MEMORY_LIMITS.projectNote),
        updatedAt: asIso(item.updatedAt),
      }))
      .filter(item => item.note.length > 0)
      // 最近更新的排前面：裁剪时保留最新的几条。
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50),
    recentPrompts: recentPrompts
      .filter((item): item is UserPromptMemory => Boolean(item && typeof item === "object"))
      .map(item => ({
        prompt: clampText(item.prompt, USER_MEMORY_LIMITS.recentPrompt),
        ...(item.projectId ? { projectId: String(item.projectId) } : {}),
        ...(item.conversationId ? { conversationId: clampText(item.conversationId, 160) } : {}),
        createdAt: asIso(item.createdAt),
      }))
      .filter(item => item.prompt.length > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      // 库里最多留 50 条,拼进提示词时再按 recentPromptCount 取前几条。
      .slice(0, 50),
  };
}

export type BuildMemoryContextInput = {
  document: Pick<UserMemoryDocument, "longTerm" | "projectMemory" | "skill" | "generalRules" | "regularMemory" | "projects" | "recentPrompts">;
  /** 当前项目 id。给了就只取这个项目的记忆与提示词。 */
  projectId?: string;
  /**
   * 是否带上「近期提示词」这一层。
   *
   * 长期记忆是用户显式写的规则，**任何时候都该生效**；
   * 而近期提示词属于"会话上下文"，只在用户打开画布开关后才带。
   */
  includeRecentPrompts?: boolean;
  /**
   * 记忆作用域（见 memoryScopeId）。给了就只取**这个对话 / 电商画布**的近期提示词。
   * 2026-10-17 用户拍板：对话记忆与对话窗口强制绑定，对话之间相互独立。
   */
  conversationId?: string;
  /** 该用户会员档位的长期记忆容量；不传 = Free 上限。 */
  limits?: MemoryLimits;
};

/** 电商画布专属记忆的作用域 id —— 与画布对话、长期记忆彼此独立。 */
export const ECOMMERCE_MEMORY_SCOPE = "ecommerce";

/**
 * 画布对话的记忆作用域 id。
 *
 * ⚠️ 必须带 projectId：老数据迁移出的那条会话 id 是空串，
 *    每个画布都有一条 —— 只用 conversationId 会让所有画布的老对话共用一份记忆。
 */
export function canvasMemoryScopeId(projectId: string, conversationId: string): string {
  return `canvas:${projectId || "p1"}:${conversationId || "legacy"}`;
}

/**
 * 请求体里携带的记忆作用域 —— 前后端唯一约定。
 * 前端在 fetchAiJson 统一附加，服务端 withUserMemory / rememberPromptQuietly 读取。
 */
export type MemoryScopePayload = {
  memoryScopeId?: string;
  memoryEnabled?: boolean;
};

export function readMemoryScope(body: unknown): { scopeId?: string; enabled: boolean } {
  if (!body || typeof body !== "object") return { enabled: false };
  const raw = body as Record<string, unknown>;
  const scopeId =
    typeof raw.memoryScopeId === "string" && raw.memoryScopeId.trim()
      ? raw.memoryScopeId.trim().slice(0, 160)
      : undefined;
  // ⚠️ 没有作用域 = 没有任何对话记忆被开启 → 只用长期记忆（用户定的全局规则）。
  return { scopeId, enabled: Boolean(scopeId) && raw.memoryEnabled === true };
}

/**
 * 把分层记忆拼成一段可直接塞进提示词的文本。
 *
 * 返回空串表示「没有任何记忆可用」—— 调用方据此跳过注入，
 * 而不是塞一段「（无记忆）」进去浪费 token。
 */
/**
 * 各层实际会被采用的条目 —— buildUserMemoryContext 与
 * listUserMemorySourcesByPriority 共用，保证「注入给模型的」和
 * 「参与尺寸仲裁的」是同一批内容（两处各写一遍筛选 = 多出口事故）。
 */
function selectMemoryLayers(input: BuildMemoryContextInput) {
  const { document, projectId, includeRecentPrompts = true, conversationId, limits = FREE_MEMORY_LIMITS } = input;
  // 降级用户库里可能留着超出新档位的内容：存储保留，注入按当前档位裁。
  const dims = clampDimensions(
    {
      projectMemory: document.projectMemory || "",
      skill: document.skill || "",
      generalRules: document.generalRules || "",
      regularMemory: document.regularMemory || "",
    },
    limits
  );
  
  // 四维度长期记忆合并（优先使用新版，向后兼容旧版 longTerm）
  const hasNewDimensions =
    (document.projectMemory && document.projectMemory.trim()) ||
    (document.skill && document.skill.trim()) ||
    (document.generalRules && document.generalRules.trim()) ||
    (document.regularMemory && document.regularMemory.trim());
  
  const longTermText = hasNewDimensions
    ? [
        dims.projectMemory && `项目记忆：${dims.projectMemory}`,
        dims.skill && `Skill：${dims.skill}`,
        dims.generalRules && `通用规则：${dims.generalRules}`,
        dims.regularMemory && `常规记忆：${dims.regularMemory}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : clampText(document.longTerm, USER_MEMORY_LIMITS.longTerm);
  
  const projects = (document.projects || [])
    // 给了 projectId 就只认这个项目；没给则取最近更新的几条。
    .filter(item => (projectId ? item.projectId === projectId : true))
    .slice(0, USER_MEMORY_LIMITS.projectNoteCount);
  const prompts = includeRecentPrompts
    ? (document.recentPrompts || [])
        // 给了作用域就严格按作用域隔离（老数据无作用域 → 排除）；作用域已唯一，不再叠加 projectId。
        .filter(item =>
          conversationId
            ? item.conversationId === conversationId
            : projectId
              ? item.projectId === projectId
              : true
        )
        // 从新到旧：越新的对话越能代表用户当下的意图。
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, USER_MEMORY_LIMITS.recentPromptCount)
    : [];
  return { longTerm: longTermText, projects, prompts, skillLength: hasNewDimensions ? dims.skill.length : 0 };
}

export type UserMemorySource = {
  layer: "recent" | "project" | "longTerm";
  text: string;
};

/**
 * 按冲突裁决优先级列出记忆来源（高 → 低）。
 *
 * 2026-10-17 用户拍板：「单个对话记忆的优先级会高于长期记忆。
 *   对话里提到的内容与长期记忆冲突时，以对话记忆为主要判断依据。」
 *
 * 所以顺序是：近期对话（新 → 旧）> 当前项目约束 > 长期记忆。
 * ⚠️ 不能把 buildUserMemoryContext 的整段文本拿去从头扫：
 *    那段文本为了裁剪安全把长期记忆放在最前，从头扫 = 长期记忆永远先命中，
 *    正好与用户要求相反，且零报错。
 */
export function listUserMemorySourcesByPriority(
  input: BuildMemoryContextInput
): UserMemorySource[] {
  const { longTerm, projects, prompts } = selectMemoryLayers(input);
  return [
    ...prompts.map(item => ({ layer: "recent" as const, text: item.prompt })),
    ...projects.map(item => ({ layer: "project" as const, text: item.note })),
    ...(longTerm ? [{ layer: "longTerm" as const, text: longTerm }] : []),
  ];
}

export function buildUserMemoryContext(input: BuildMemoryContextInput): string {
  const { longTerm, projects, prompts, skillLength } = selectMemoryLayers(input);
  const sections: string[] = [];

  /*
   * ⚠️ 排列顺序 ≠ 优先级。长期记忆放最前只是为了总量裁剪时（从尾部裁）保住它；
   *    冲突时谁说了算写在标题里：本次指令 > 近期对话 > 项目约束 > 长期习惯。
   */
  if (longTerm) {
    sections.push(
      [
        "【用户长期设计习惯】（用户本人设定的默认偏好；与本次指令或近期对话冲突时，以本次指令为准，其次以近期对话为准）",
        longTerm,
      ].join("\n")
    );
  }

  if (projects.length > 0) {
    sections.push(
      [
        "【当前项目已确认的风格与约束】",
        ...projects.map(item => `- ${item.title ? `${item.title}：` : ""}${item.note}`),
      ].join("\n")
    );
  }

  if (prompts.length > 0) {
    sections.push(
      [
        "【该用户近期对话中的要求】（从新到旧排列，越新越优先；与长期习惯冲突时以这里为准；不要直接照搬画面内容）",
        ...prompts.map(item => `- ${item.prompt}`),
      ].join("\n")
    );
  }

  if (sections.length === 0) return "";

  const joined = sections.join("\n\n");
  /*
   * 总量兜底裁剪。
   *
   * ⚠️ 从**尾部**裁：尾部是优先级最低的近期提示词，
   *    从头裁会先砍掉用户亲手写的长期记忆 —— 那是整个功能的核心价值。
   */
  const totalLimit = getMemoryContextTotalLimit(input.limits, skillLength);
  return joined.length > totalLimit ? joined.slice(0, totalLimit) : joined;
}

/**
 * 把一条新提示词记进记忆，并维持容量上界。
 *
 * ⚠️ 去重按「同项目 + 同文本」判定：用户反复点重试会产生大量相同提示词，
 *    不去重的话五条配额会被同一句话占满，记忆等于失效。
 */
export function appendPromptMemory(
  prompts: UserPromptMemory[],
  entry: UserPromptMemory,
  limit = 50
): UserPromptMemory[] {
  const prompt = clampText(entry.prompt, USER_MEMORY_LIMITS.recentPrompt);
  if (!prompt) return prompts;
  const next = prompts.filter(
    item =>
      !(
        item.prompt === prompt &&
        item.projectId === entry.projectId &&
        item.conversationId === entry.conversationId
      )
  );
  next.unshift({ ...entry, prompt, createdAt: asIso(entry.createdAt) });
  return next.slice(0, limit);
}

/** 合并一条项目记忆（同 projectId 覆盖）。 */
export function upsertProjectMemory(
  projects: UserProjectMemory[],
  entry: UserProjectMemory
): UserProjectMemory[] {
  const note = clampText(entry.note, USER_MEMORY_LIMITS.projectNote);
  const rest = projects.filter(item => item.projectId !== entry.projectId);
  // 空 note 等于删除这条项目记忆。
  if (!note) return rest;
  return [{ ...entry, note, updatedAt: asIso(entry.updatedAt) }, ...rest].slice(0, 50);
}
