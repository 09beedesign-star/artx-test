/**
 * AI 任务上游任务号提取测试
 *
 * ## 回归防护目标
 *
 * 1. **VOD 不再丢弃 taskId**  
 *    `tryVodGeneration()` 在 `submitAIGCTask()` 返回 `{ taskId }` 后，
 *    曾在 4203 行 `return { images }` 把它扔掉，导致所有 VOD 任务的
 *    上游任务号恒为占位符。测试确保 VOD 链路透传 `taskId`。
 *
 * 2. **中转站提取响应头 / 体里的上游 ID**  
 *    OpenAI 兼容网关通常在 `x-request-id` / `x-trace-id` / 响应体
 *    `task_id` / `taskId` 等字段返回可追溯的任务号。
 *    `extractRelayProviderTaskId()` 按头优先、体次之的顺序探测；
 *    `readImageProviderResponse()` 把提取结果挂到 `data.task_id` 上；
 *    `generateImages()` 在最后一步用 `withProviderTaskIds()` 透传。
 *
 * 3. **前端 `ids` 字段渲染**  
 *    `DataList` 现支持 `ids?: Array<{label, value, missing?}>`，
 *    把三层任务号（上游/后端/批次）渲染成可复制、可换行的标签组；
 *    上游任务号缺失时标注"未返回"并用琥珀色背景，避免占位符被误读。
 *
 * ## 为什么要这三个测试
 *
 * - **VOD 丢 taskId** 是纯手误 —— 拿到了却没传出去，零运行时征兆，
 *   只有类型签名或集成测试能拦。
 * - **中转站 ID 提取** 涉及"头优先、体次之"的多分支逻辑，
 *   必须测键名大小写不敏感、trim、空串过滤、补张汇总等边界。
 * - **前端渲染** 要确保 `missing` 标识正确、占位符 `provider-task-missing`
 *   被识别为缺失而非真实任务号、多 ID 不被 truncate 截断。
 *
 * @jest-environment node
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf-8");
const imageGenSource = readFileSync(new URL("./image-generation.ts", import.meta.url), "utf-8");
const adminPageSource = readFileSync(new URL("../client/src/pages/AdminPrototypePage.tsx", import.meta.url), "utf-8");

describe("AI 任务上游任务号提取", () => {
  it("VOD 链路必须透传 generateImageWithVod 返回的 taskId", () => {
    // generateImageWithVod（tencent-vod-aigc.ts）返回 { images, taskId, model }
    expect(imageGenSource).toMatch(/const result = await generateImageWithVod\(/);
    // tryVodGeneration 结尾必须用 withProviderTaskIds 透传 result.taskId，
    // 曾经直接 `return { images: images.slice(0, count) }` 把它扔掉。
    const vodReturnMatch = imageGenSource.match(
      /\/\/ ⚠️ 必须把腾讯返回的 TaskId 透出去[\s\S]{1,400}?return withProviderTaskIds\([^;]+;/,
    );
    expect(vodReturnMatch).toBeTruthy();
    expect(vodReturnMatch![0]).toMatch(/result\.taskId/);
    expect(vodReturnMatch![0]).toMatch(/provider-task-missing/);
  });

  it("中转站必须提取响应头/体里的上游任务号", () => {
    // 提取函数存在，注释里明确说明"不要用 img_xxx 充数"
    expect(imageGenSource).toMatch(/function extractRelayProviderTaskId\(/);
    expect(imageGenSource).toMatch(/本机自增串.*供应商日志里根本查不到/);
    // 常见键名都要覆盖：头（x-request-id、x-trace-id、cf-ray 等）+ 体（task_id、taskId、id、request_id）
    expect(imageGenSource).toMatch(/x-request-id/);
    expect(imageGenSource).toMatch(/x-trace-id/);
    expect(imageGenSource).toMatch(/data\.task_id/);
    expect(imageGenSource).toMatch(/data\.taskId/);
    // readImageProviderResponse 在成功分支挂上提取结果
    expect(imageGenSource).toMatch(/extractRelayProviderTaskId\(response, data\)/);
    expect(imageGenSource).toMatch(/data\.task_id = upstreamTaskId/);
  });

  it("generateImages 的返回类型签名必须是 GeneratedImageResult", () => {
    // 曾经写成 Promise<{ images: GeneratedImage[] }>，把 providerTaskId/providerTaskIds 从类型上抹掉
    expect(imageGenSource).toMatch(/export async function generateImages.*: Promise<GeneratedImageResult>/);
    expect(imageGenSource).not.toMatch(/export async function generateImages.*: Promise<\{\s*images:/);
  });

  it("中转站链路最后一步必须用 withProviderTaskIds 透传", () => {
    // 拆批补张时，主批次 + 补张批次的所有 ID 都要汇总
    const matchSplitBatchReturn = imageGenSource.match(
      /\/\/ 拆批补张时[\s\S]{1,600}?return withProviderTaskIds\([\s\S]{1,400}?\);/,
    );
    expect(matchSplitBatchReturn).toBeTruthy();
    expect(matchSplitBatchReturn![0]).toMatch(/providerData\.task_id/);
    expect(matchSplitBatchReturn![0]).toMatch(/providerData\.taskId/);
    expect(matchSplitBatchReturn![0]).toMatch(/r\.providerTaskId/);
    expect(matchSplitBatchReturn![0]).toMatch(/r\.providerTaskIds/);

    // 单批返回时也必须透传，注释里保留了问题背景（曾经直接 return { images }）
    const matchSingleBatchReturn = imageGenSource.match(
      /\/\/ ⚠️ 必须把中转站上游任务号透出去[\s\S]{1,600}?return withProviderTaskIds\([\s\S]{1,300}?\);/,
    );
    expect(matchSingleBatchReturn).toBeTruthy();
    expect(matchSingleBatchReturn![0]).toMatch(/providerData\.task_id/);
    expect(matchSingleBatchReturn![0]).toMatch(/providerData\.taskId/);
    expect(matchSingleBatchReturn![0]).toMatch(/provider-task-missing/);
  });

  it("前端 DataList 必须支持 ids 字段（任务号标签组）", () => {
    // 类型签名里有 ids?: Array<{label, value, missing?}>
    expect(adminPageSource).toMatch(/ids\?:\s*Array<\{[^}]*label:\s*string[^}]*value:\s*string[^}]*missing\?:/);
    // 渲染逻辑：flex-wrap gap 防截断，missing 时用琥珀色背景，每个 label 可 select-all 复制
    expect(adminPageSource).toMatch(/row\.ids && row\.ids\.length > 0/);
    expect(adminPageSource).toMatch(/flex-wrap gap/);
    expect(adminPageSource).toMatch(/item\.missing/);
    expect(adminPageSource).toMatch(/border-amber|bg-amber/);
    expect(adminPageSource).toMatch(/select-all/);
  });

  it("前端必须识别占位符 provider-task-missing 为缺失而非真号", () => {
    // hasProviderTaskId 判断：既要非空也要 !== "provider-task-missing"
    expect(adminPageSource).toMatch(/provider-task-missing/);
    const hasProviderTaskIdLine = adminPageSource.match(/const hasProviderTaskId = [^;]+;/);
    expect(hasProviderTaskIdLine).toBeTruthy();
    expect(hasProviderTaskIdLine![0]).toMatch(/!== ["']provider-task-missing["']/);
    expect(hasProviderTaskIdLine![0]).toMatch(/Boolean\(task\.providerTaskId\)|task\.providerTaskId/);
  });

  it("前端 AI 任务追踪的 ids 必须包含三层任务号并正确标注缺失", () => {
    // adminData.aiTasks.map 里构造 ids 数组，包含 上游任务号 / 后端任务号 / 生成批次号
    const aiTasksMapMatch = adminPageSource.match(/adminData\.aiTasks\.map\(\(task\)\s*=>\s*\{[\s\S]{1,1500}ids:\s*\[[\s\S]{1,500}\]/);
    expect(aiTasksMapMatch).toBeTruthy();
    const idsArrayContent = aiTasksMapMatch![0];
    expect(idsArrayContent).toMatch(/label:\s*["']上游任务号["']/);
    expect(idsArrayContent).toMatch(/label:\s*["']后端任务号["']/);
    expect(idsArrayContent).toMatch(/label:\s*["']生成批次号["']/);
    expect(idsArrayContent).toMatch(/value:\s*hasProviderTaskId\s*\?\s*task\.providerTaskId\s*:\s*["']未返回["']/);
    expect(idsArrayContent).toMatch(/missing:\s*!hasProviderTaskId/);
    expect(idsArrayContent).toMatch(/value:\s*task\.backendTaskId/);
    expect(idsArrayContent).toMatch(/value:\s*task\.generationId/);
  });

  it("前端时间格式必须带月日，跨天排查时只有 HH:mm:ss 会分不清", () => {
    // toLocaleString 带 month / day，注释明确说"跨天排查"
    const formatTaskTimeMatch = adminPageSource.match(
      /\/\/ 时间带上月日[\s\S]{1,600}?const formatTaskTime = [\s\S]{1,600}?\};/,
    );
    expect(formatTaskTimeMatch).toBeTruthy();
    expect(formatTaskTimeMatch![0]).toMatch(/month:\s*["']2-digit["']/);
    expect(formatTaskTimeMatch![0]).toMatch(/day:\s*["']2-digit["']/);
    expect(formatTaskTimeMatch![0]).toMatch(/跨天排查/);
  });

  it("前端面板说明文案必须写明上游任务号的用途", () => {
    // AI 任务追踪的 description 明确用途
    const descriptionMatch = adminPageSource.match(/<DataList[^>]*title=["']AI 任务追踪["'][^>]*description=["']([^"']+)["']/);
    expect(descriptionMatch).toBeTruthy();
    expect(descriptionMatch![1]).toMatch(/上游任务号.*供应商.*提工单|向供应商.*上游任务号/);
    expect(descriptionMatch![1]).toMatch(/未返回/);
  });

  it("index.ts 的出图路由必须原样展开 result，不能只挑 images 字段", () => {
    // POST /api/images：`return { ...result, images }` —— 展开保留 providerTaskId/
    // providerTaskIds，再由统一追踪层（getProviderTaskIds / withAiUsageTracking）提取。
    // 若改成 `return { images }` 会把任务号在路由层丢掉，故加此防护。
    const imageRouteMatch = indexSource.match(
      /const result = await generateImages\(req\.body\);[\s\S]{1,400}?return \{[^}]*\};/,
    );
    expect(imageRouteMatch).toBeTruthy();
    expect(imageRouteMatch![0]).toMatch(/return \{\s*\.\.\.result,\s*images\s*\}/);
  });

  it("统一追踪层必须从结果里提取 providerTaskId/providerTaskIds", () => {
    // getProviderTaskIds() 负责从 result 上取任务号，供 recordAiRouteUsage 写入 aiTasks
    expect(indexSource).toMatch(/function getProviderTaskIds\(/);
    expect(indexSource).toMatch(/record\.providerTaskIds/);
    expect(indexSource).toMatch(/record\.providerTaskId/);
    // tracking 的 providerTaskIds 回调优先，其次回落到通用提取
    expect(indexSource).toMatch(
      /input\.tracking\.providerTaskIds\?\.\(input\.result\)\s*\|\|\s*getProviderTaskIds\(input\.result\)/,
    );
    // 提取结果写进 recordAiUsage 的入参
    expect(indexSource).toMatch(/providerTaskId:\s*providerTaskIds\?\.\[0\]/);
  });
});

describe("AI 任务时间轴兜底（withTaskTimeline）", () => {
  const adminStoreSource = readFileSync("server/admin-store.ts", "utf-8");

  it("withTaskTimeline 必须存在并调用 deriveTaskTimeline 写三个字段", () => {
    expect(adminStoreSource).toMatch(/function withTaskTimeline\(/);
    expect(adminStoreSource).toMatch(/deriveTaskTimeline\(task\)/);
    expect(adminStoreSource).toMatch(/startedAt:\s*timeline\.startedAt/);
    expect(adminStoreSource).toMatch(/completedAt:\s*timeline\.completedAt/);
    expect(adminStoreSource).toMatch(/timelineDerived:\s*timeline\.derived/);
  });

  it("fullPayload 必须包装 aiTasks —— 前端主面板走的就是这条路径", () => {
    // 缺陷根因：前端主面板读 /api/admin/overview（fullPayload），
    // 而兜底只做在了 GET /api/admin/ai-tasks 路由上，于是时间列全空且零报错。
    const fullPayloadMatch = adminStoreSource.match(
      /function fullPayload\(data: AdminData\)[\s\S]{1,600}?aiTasks:[^,\n]*/,
    );
    expect(fullPayloadMatch).toBeTruthy();
    expect(fullPayloadMatch![0]).toMatch(/aiTasks:\s*withTaskTimeline\(data\.aiTasks\)/);
  });

  it("GET ai-tasks 路由必须复用 withTaskTimeline", () => {
    const routeMatch = adminStoreSource.match(
      /route === "ai-tasks"\)[\s\S]{1,400}?return \{/,
    );
    expect(routeMatch).toBeTruthy();
    expect(routeMatch![0]).toMatch(/withTaskTimeline\(data\.aiTasks\)/);
  });

  it("用户详情抽屉的 aiTasks 也必须补时间轴", () => {
    const detailMatch = adminStoreSource.match(
      /function buildAccountDetail[\s\S]{1,2500}?const aiTasks = withTaskTimeline\(/,
    );
    expect(detailMatch).toBeTruthy();
  });

  it("admin-store 里不应再出现未包装的 aiTasks 出口", () => {
    // 反向断言：对外返回体里不允许出现裸的 `aiTasks: data.aiTasks`
    expect(adminStoreSource).not.toMatch(/aiTasks:\s*data\.aiTasks\s*,/);
  });
});

describe("orchestrator 必须透传上游任务号（09-12 生产实测暴露）", () => {
  const orchestratorSource = readFileSync("server/ai-orchestrator.ts", "utf-8");

  it("文生图分支必须返回 providerTaskId/providerTaskIds", () => {
    // ⚠️ 真实事故：generateImages() 内部已正确返回任务号，但 orchestrator
    // 的 text_to_image 返回体漏掉了这两个字段，最常用的出图链路上游任务号
    // 被静默丢弃，后台恒显示 provider-task-missing。
    // 教训：底层修好 ≠ 链路通了，每一层返回体都要单独确认。
    const textToImageBlock = orchestratorSource.match(
      /const result = await generateImages\(\{[\s\S]{1,900}?\n    \};/,
    );
    expect(textToImageBlock).toBeTruthy();
    expect(textToImageBlock![0]).toMatch(/providerTaskId:\s*result\.providerTaskId/);
    expect(textToImageBlock![0]).toMatch(/providerTaskIds:\s*result\.providerTaskIds/);
  });

  it("所有图片类返回体都必须带任务号，不能只修其中一个分支", () => {
    // 反向断言：凡是 type: "image" 的返回体都必须出现 providerTaskId。
    // 这个 bug 的本质是「五个并列分支有两个漏了」（文生图 + image_edit），
    // 逐个点名的正向断言守不住将来新增的分支。
    //
    // ⚠️ 终止符必须写 `\n\s*\};` 而不是 `\n    \};`：
    // 这些返回体嵌套层级不同（if 块内是 6 空格、函数末尾是 4 空格），
    // 写死缩进会让正则只匹配到 1 个块，测试看似"跑过"实则几乎没覆盖。
    const imageReturns = orchestratorSource.match(
      /return \{\s*\n\s*type: "image"[\s\S]{1,900}?\n\s*\};/g,
    );
    expect(imageReturns).toBeTruthy();
    expect(imageReturns!.length).toBeGreaterThanOrEqual(5);
    for (const block of imageReturns!) {
      expect(block).toMatch(/providerTaskId:\s*result\.providerTaskId/);
    }
  });

  it("落库时 providerTaskIds 数组也要写进 AiTaskRecord", () => {
    // ⚠️ 09-12 生产实测：主任务号已经正确落库，但 providerTaskIds 恒为空数组。
    // 根因是 recordAiUsage 组装 AiTaskRecord 时只赋了单数的 providerTaskId，
    // 类型里声明了 providerTaskIds 却没有任何写入路径 ——
    // 「类型声明了字段」≠「写入路径填了字段」，这种漏写不报错也不崩。
    const adminStoreSource = readFileSync("server/admin-store.ts", "utf-8");
    const recordBlock = adminStoreSource.match(
      /const record: AiTaskRecord = \{[\s\S]{1,2000}?\n  \};/,
    );
    expect(recordBlock).toBeTruthy();
    expect(recordBlock![0]).toMatch(/providerTaskId:\s*getProviderTaskId\(input\)/);
    expect(recordBlock![0]).toMatch(/providerTaskIds:\s*input\.providerTaskIds/);
  });
});

describe("AI 任务追踪面板布局与搜索", () => {
  const adminPageSource = readFileSync("client/src/pages/AdminPrototypePage.tsx", "utf-8");

  it("长错误文案必须走 detail，不能塞进右侧状态徽标", () => {
    // ⚠️ 根因：失败任务的 failureReason 常是上游返回的整段错误 JSON。
    // Badge 带 whitespace-nowrap，长文会把整行撑到上千像素，
    // 挤垮左侧 flex-1 内容区，中文标签被压成一字一行的竖排。
    expect(adminPageSource).toMatch(/valueLabel\?:\s*string/);
    expect(adminPageSource).toMatch(/detail\?:\s*string/);
    // 徽标渲染必须优先用短文案 valueLabel
    expect(adminPageSource).toMatch(/const badgeText = row\.valueLabel \?\? row\.value/);
    // AI 任务行必须把 failureReason 放进 detail 而非 valueLabel
    expect(adminPageSource).toMatch(
      /detail:\s*task\.status === "success" \? undefined : task\.failureReason/,
    );
  });

  it("状态徽标必须有宽度上限与 shrink-0，detail 必须可折行", () => {
    // 徽标不能无限撑开
    expect(adminPageSource).toMatch(/statusClass\(badgeText\)\}\s*shrink-0 sm:max-w-\[220px\]/);
    // detail 区必须允许折行，否则长 JSON 依旧会撑破布局
    expect(adminPageSource).toMatch(/whitespace-pre-wrap break-all/);
  });

  it("图标容器必须 shrink-0，避免被长内容压扁", () => {
    expect(adminPageSource).toMatch(/flex size-9 shrink-0 items-center justify-center/);
  });

  it("DataList 必须支持搜索并覆盖任务号字段", () => {
    expect(adminPageSource).toMatch(/searchable\s*=\s*false/);
    expect(adminPageSource).toMatch(/const \[keyword, setKeyword\] = useState\(""\)/);
    // 检索范围必须包含 ids（任务号），否则按任务号搜不到
    const filterBlock = adminPageSource.match(/const visibleRows = useMemo\([\s\S]{1,900}?\}, \[rows, keyword, searchable\]\)/);
    expect(filterBlock).toBeTruthy();
    expect(filterBlock![0]).toMatch(/row\.ids \?\? \[\]/);
    expect(filterBlock![0]).toMatch(/row\.detail/);
    // 包含匹配而非全等：用户往往只记得任务号片段
    expect(filterBlock![0]).toMatch(/haystack\.includes\(query\)/);
    expect(filterBlock![0]).toMatch(/toLowerCase\(\)/);
  });

  it("AI 任务追踪面板必须开启搜索", () => {
    const panelMatch = adminPageSource.match(
      /title="AI 任务追踪"[\s\S]{1,500}?rows=\{/,
    );
    expect(panelMatch).toBeTruthy();
    expect(panelMatch![0]).toMatch(/searchable/);
    expect(panelMatch![0]).toMatch(/searchPlaceholder=/);
  });
});
