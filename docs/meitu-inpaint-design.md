# 美图 AI「局部重绘」接入设计（智能注释 → AI 修改）

> 状态：设计定稿，待实施（M1 连通性验证 → M2 后端 → M3 前端 → M4 联调发布）
> 关联文档：美图开放平台 [局部重绘 API doc/312](https://ai.meitu.com/doc/?id=312&type=api&lang=zh)、[签名 doc/218](https://ai.meitu.com/doc/?id=218&type=api&lang=zh)、[异步任务查询 doc/222](https://ai.meitu.com/doc/?id=222&type=api&lang=zh)

## 1. 目标与范围

| 项 | 内容 |
|---|---|
| **目标能力** | 在「智能注释 → AI 修改」流程中接入美图**局部重绘**：用户给图片加注释 → 点击"AI 修改" → 用美图 inpaint 在注释标注区域重绘，输出结果图 |
| **外部依赖** | 美图 AI 开放平台「局部重绘」API（v3 同步接口） |
| **密钥** | `.env` 已配置 `ACCESS_KEY` / `SECRET_KEY`；需同步登记 `.env.example` 与腾讯云部署模板 |
| **范围边界** | 仅扩展智能注释 → AI修改链路；不动其他画布功能与无关模块 |

## 2. 现有「智能注释 → AI 修改」实现剖析（接入基线）

### 前端（`client/src/components/canvas/InfiniteCanvas.tsx`）

| 环节 | 位置 | 说明 |
|---|---|---|
| 注释标签"AI 修改"按钮 | `L5958-5961` | 每个注释上有 `AI 修改`（WandSparkles 图标） |
| 处理函数 | `handleAnnotationAiEdit`（`L22311`） | 校验注释文本/图片节点 → 取注释点坐标（x%, y%）→ 生成蒙版 → 拼编辑提示词 → 调 `editImageWithPrompt({ operation: "annotation_edit", maskSrc, preserveSource: true })` → `runDerivedImageGeneration` 在原图旁落结果 |
| 蒙版生成 | `createAnnotationEditMask`（`L11575`） | **全图尺寸** canvas：黑底 + 注释点透明圆形（头部配饰=椭圆、面部配饰=眼位椭圆特化）；**透明=可编辑区，黑=保留区**；`expanded` 参数放大重试 |
| 无可见修改重试 | `L22386-22404` | 捕获 `智能注释模型没有在标记区域做出可见修改` → 扩大蒙版重试一次 |

### 后端（`server/image-generation.ts`）

| 环节 | 位置 | 说明 |
|---|---|---|
| 路由分发 | `L3698` | `operation === "annotation_edit"` → `editSmartAnnotationImage` |
| 主路径 | `L3250-3316` | `callImageEditProvider`（gpt-image 系 `images/edits`，image+mask+n=1） |
| 兜底路径 | `L3324-3364` | 不支持 mask 的模型 → 参考图生成（源图+橙色编辑区引导图） |
| 合成+校验 | `L3278-3316` | `__testCompositeSourcePreservingImageEdit` 蒙版合成 → `hasVisibleLocalEdit` 检测无可见修改则抛错 |
| 现有蒙版转换先例 | `createPicWishEraseMask`（`L1909-1959`） | **透明→白（编辑区）、不透明→黑（保留区）** —— 与美图 mask 语义完全一致 |

> **关键结论**：现有蒙版（透明=编辑区）经 `createPicWishEraseMask` 式转换（透明→白）后，**恰好满足美图局部重绘的 mask 要求**（白=重绘区、黑=保留区），蒙版无需前端改动。

## 3. 美图 API 调研结论（官方文档直读）

### 3.1 当前版接口（推荐目标）—— `v3/image_manipulation`（同步）

```
POST https://openapi.mtlab.meitu.com/v3/image_manipulation?api_key=${APPKEY}&api_secret=${SECRETID}
Content-Type: application/json
```

> 官方文档注明：**该接口直接携带密钥查询参数调用，无需额外签名认证**。

```jsonc
{
  "parameter": {
    "rsp_media_type": "url",           // "jpg"(base64) | "url"
    "prompt_pos": "lipstick lying on satin fabric",  // 正向提示词
    "seed": 12345,                      // [-1, 2147483647]，不传随机
    "num_samples": 1,                   // 返回张数，默认3；消除类关键词固定1
    "return_format_type": "png"         // 默认 png；jpeg/jpg/png/webp
  },
  "media_info_list": [
    { "media_data": "<原图 base64或url>", "media_profiles": { "media_data_type": "jpg" } },   // ① 用户图
    { "media_data": "<mask 图 base64或url>", "media_profiles": { "media_data_type": "jpg" } } // ② 涂抹 mask 图
  ],
  "extra": {}
}
```

**同步响应**：`media_info_list[].media_data` = 结果图（url 或 base64）。**图片要求**：JPG/PNG。

**失败响应**：`{ "ErrorCode": 20008, "ErrorMsg": "UNSUITABLE_IMAGE", "Data": null }`。

**专项错误码**：20001 处理错误 · 20003 人脸缺失 · 20008 照片不符合规范 · 20013 分辨率过大 · 20014 找不到图片 · 20015 图片超限 · 30001 生成错误 等；通用错误码见 [doc/36](https://ai.meitu.com/doc/?id=36)。

### 3.2 备选通道（同步超时 / 密钥不兼容时）

| 通道 | 地址 | 说明 |
|---|---|---|
| 异步（旧 v1） | `POST /v1/image_manipulation_async?api_key=&api_secret=` → `msg_id` | 轮询 `POST /v1/query?api_key=&api_secret=&msg_id=` 取结果 |
| 新 AIGCP 网关 | `POST openapi.meitu.com/api/v1/sdk/sync/push` + `GET /api/v1/sdk/status?task_id=` | 需 **SDK-HMAC-SHA256 签名**（doc/218）：`CanonicalRequest` → `StringToSign` → HMAC-SHA256(SK)；头含 `X-Sdk-Date`（UTC `YYYYMMDDTHHMMSSZ`）；body ≤ 12MB；官方 JS `sign.js` 可下载，支持 `X-Sdk-Content-Sha256: UNSIGNED-PAYLOAD` 跳过 body 签名 |

### 3.3 待实测项（实施首步 M1）

1. `ACCESS_KEY`/`SECRET_KEY` 是否可直接作为 v3 的 `api_key`/`api_secret`
2. mask 是否须与原图同尺寸（安全做法：服务端 sharp 强制同尺寸）
3. 同步接口真实耗时（定超时阈值，默认 120s + 降级）

## 4. 总体架构（接入点 = 智能注释链路）

```
 智能注释标签 ──AI 修改──▶ handleAnnotationAiEdit（前端，不变）
                              │  createAnnotationEditMask（全图尺寸蒙版，不变）
                              ▼
                    editImageWithPrompt({ operation:"annotation_edit",
                                          provider:"meitu",   ← 新增字段
                                          imageSrc, maskSrc, prompt })
                              ▼
   ┌──────────────────────────────────────────────┐
   │ editSmartAnnotationImage（后端）               │
   │   ├─ 主路径：callImageEditProvider(gpt)        │  ← 保持现状
   │   └─ 新增分支 provider=meitu：                  │
   │        buildMeituMask(maskSrc) 透明→白/黑       │  ← 复用 createPicWishEraseMask 语义
   │        inpaintWithMeitu(imageSrc, mask,         │
   │          prompt_pos=用户注释文本, num_samples=1) │
   │        → 下载结果 → 同尺寸校验 → 落存储          │
   │        → hasVisibleLocalEdit 校验（沿用）        │
   └──────────────────────────────────────────────┘
                              │
                      原图旁生成结果节点（不变）
```

- 密钥只存在于后端，前端流程、蒙版、重试、落节点逻辑**全部复用**
- 提供方切换做成**可选项**（美图 / 默认模型），不破坏现有 gpt 路径

## 5. 后端设计

### 5.1 环境变量（`server/env.ts` 模式，三处同步：`.env` / `.env.example` / `deploy/tencent-cloud/artx-server.env.example`）

```bash
ACCESS_KEY=xxx                    # 已存在 .env，补登记 example
SECRET_KEY=xxx                    # 同上
MEITU_BASE_URL=https://openapi.mtlab.meitu.com   # 新增
MEITU_INPAINT_TIMEOUT_MS=120000                  # 新增
MEITU_MASK_EXPAND_PX=6            # 蒙版重绘区向外扩展像素（建议 5-10，防补丁感）
MEITU_MASK_FEATHER_PX=6           # 蒙版边缘羽化像素（建议 4-8，防接缝）
MEITU_INPAINT_DENOISE=0.65        # 重绘强度（0.6-0.7 日常推荐；仅 formula 通道生效）
```

### 5.2 新模块 `server/meitu-client.ts`

| 函数 | 职责 |
|---|---|
| `inpaintWithMeitu({ imageBuffer, maskBuffer, promptPos, seed?, numSamples=1 })` | 组装 v3 请求（image+mask 走 base64，`rsp_media_type=url`）→ 调接口 → 解析结果 URL |
| `buildMeituMask(maskBuffer, { width, height })` | sharp：透明→白（重绘区）、不透明→黑（保留区），强制缩放到原图尺寸，输出 PNG —— 语义与 `createPicWishEraseMask` 一致，优先重构共用 |
| `downloadMeituResult(url)` | 下载结果图 → 交 `storeGeneratedImagesForUser` 入库 |
| `mapMeituError(ErrorCode)` | 20001–30001 → 中文提示（与现有 `isSmartAnnotationNoVisibleChangeError` 兼容：美图无可见修改类错误也走前端扩大蒙版重试） |
| `(备选) signMeituRequest(...)` | SDK-HMAC-SHA256，仅实测失败/换新网关时启用 |

**超时降级**：同步 120s 超时 → 自动走 `image_manipulation_async` + `msg_id` 轮询（复用 PicWish 提交→轮询→下载骨架）。

### 5.3 集成点（最小改动）

`server/image-generation.ts`：
- `EditImageInput` 增加可选 `provider?: "auto" | "meitu" | "default"`
- `editSmartAnnotationImage` 增加分支：`provider === "meitu"` → 走美图（跳过 `callImageEditProvider` 主路径与参考图兜底路径）
- 结果归一：美图结果与源图**同尺寸**天然一致，仍复用 `__testNormalizeGeneratedImagesToTargetAspect` + `hasVisibleLocalEdit`（用原透明蒙版做可见性校验，不改变语义）
- 配额：`shared/ai-credit-policy.ts` 将 `annotation_edit` 的美图通道按局部重绘计费（或新增 capability `meitu_inpaint`，实施时按现有计费表对齐）

## 6. 前端设计（最小改动，入口不变）

| 改动点 | 位置 | 内容 |
|---|---|---|
| 提供方开关 | `handleAnnotationAiEdit` 附近或注释弹窗 | "AI 修改引擎：美图局部重绘 / 默认模型"，存本地偏好（仿 `getStoredCanvasAssistantImageEditModel`） |
| 传参 | `runAnnotationEdit` | `editImageWithPrompt({ ..., operation: "annotation_edit", provider: "meitu" })` 仅当选中美图时 |
| 提示词映射 | `runAnnotationEdit` | `prompt_pos` = 用户注释文本 `reference.text`（中文可直接用）；现有冗长英文约束提示词仅服务于 gpt，美图分支不拼接 |
| 结果 | `runDerivedImageGeneration` | 不变：原图旁生成"注释修改结果"节点；`num_samples=1` 保持单结果 UX |
| 错误/重试 | 既有 `isSmartAnnotationNoVisibleChangeError` | 美图无可见修改 → 同样触发扩大蒙版重试（错误文案对齐） |
| `client/src/lib/ai.ts` | `editImageWithPrompt` 请求体 | 透传 `provider` 字段 |

> 前端**不新增涂抹 UI**——智能注释本来就是"标注点 + 文字建议"，蒙版由 `createAnnotationEditMask` 按注释点自动生成，用户无感知新增操作。

## 7. 接口契约（前后端对齐）

```ts
// EditImageInput 扩展（shared 或 server 类型）
interface EditImageInput {
  imageSrc: string;
  maskSrc: string;
  prompt: string;
  operation: "annotation_edit";
  provider?: "auto" | "meitu" | "default";  // 新增，缺省走现有 gpt 逻辑
  preserveSource: true;
  targetWidth?: number;
  targetHeight?: number;
}
// 响应保持 { images: GeneratedImage[] } 不变 —— 前端 runDerivedImageGeneration 零改动
```

## 8. 测试与验收标准

| 阶段 | 验证项 | 通过标准 |
|---|---|---|
| 连通性验证（M1） | 真实 key 调 v3（最小请求） | HTTP 200；401/403 → 切签名通道 |
| mask 语义 | `buildMeituMask` 输出 白=注释区/黑=其余，与原图同尺寸 | sharp 输出核对；重绘仅发生在注释标注区域 |
| 功能 | 加注释 → AI 修改（美图）→ 结果 | 原图旁生成结果节点；未标注区域保持 |
| 无可见修改 | 注释区域过小/描述模糊 | 触发既有扩大蒙版重试；仍失败给中文提示 |
| 配额/回归 | 额度扣减；现有 gpt 编辑路径不受影响 | `recordAiRouteUsage` 生效；`provider` 缺省时行为与现在完全一致 |
| 安全 | key 不进前端构建产物 | 构建产物 grep 无 `api_secret` |

## 9. 上线发布路径（遵循 AGENTS.md）

1. 本地 commit（仅任务相关文件）→ push `feature/interaction-framework`
2. GitHub Pages 重部署 → 校验 `https://09beedesign-star.github.io/artx-test/deployment.json`
3. 腾讯云前端页同步 → 校验 `https://backstage.artxsd.com/deployment.json`，两处 `shortCommit` 一致
4. 校验 `https://backstage.artxsd.com/api/health`
5. 不触碰生产 `www.artxsd.com`，不使用旧 Render 作为默认后端

## 10. 风险与待确认项

| # | 事项 | 处置 |
|---|---|---|
| 1 | ACCESS/SECRET 与 v3 `api_key/api_secret` 对应关系 | 连通性验证脚本实测 |
| 2 | mask 尺寸/格式约束 | 服务端 sharp 强制同尺寸、PNG 输出 |
| 3 | 同步耗时 → 超时 | 120s + 异步降级 |
| 4 | 试用配额（1000 次 / 1 QPS） | 复用配额体系限流 |
| 5 | 美图对多张返回（num_samples>1）的适配 | 本期固定 1，多结果对比列为后续增强 |

## 11. 实施里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M1 连通性验证** | 临时脚本用真实 key 调 v3（最小请求），确认认证方式、mask 约束、真实耗时 | 请求成功返回结果图 URL |
| **M2 后端** | `server/meitu-client.ts` + `editSmartAnnotationImage` 美图分支 + 配额 + `.env*` 三处登记 | `tsc --noEmit` 通过；单元/手动调通美图分支 |
| **M3 前端** | `client/src/lib/ai.ts` 透传 `provider` + 注释弹窗引擎选择 | 画布中选中美图引擎 → AI 修改成功出图 |
| **M4 联调发布** | 走第 9 节发布路径到测试环境 | 双前端 `deployment.json` shortCommit 一致 + 后端 health 通过 |

## 待用户确认

1. ~~**美图引擎默认状态**~~：~~已确认（2026-08-11）——智能注释「AI 修改」默认使用美图局部重绘，注释弹窗中仍保留"默认模型"选项可手动切换（localStorage 记忆）。~~
2. **引擎选择器已移除（2026-08-12）**：智能注释「AI 修改」**固定使用美图局部重绘**，不再提供引擎选择下拉框，前端 `handleAnnotationAiEdit` 直接传 `provider: "meitu"`；已清理 `AnnotationEditProvider` 类型与 `artx:annotation-edit-provider` 存储逻辑。

## 12. 实施记录（M1–M3 已完成）

### M1 连通性验证结论（2026-08-11）

用 `.env` 中真实 key 实测：

| 端点 | 结果 | 结论 |
|---|---|---|
| `v3/image_manipulation` | HTTP 200 + `error_code:80001 权限错误 record not found` | 网关认可密钥（query 参数认证有效），但策略中心无该 API 资源授权 |
| `v1/image_manipulation`（旧同步） | HTTP 415 + `权益已耗尽:no right package found` | 认证通过，账号无权益包 |
| `v1/facedetect`（对照组） | HTTP 401 `GATEWAY_AUTHORIZED_ERROR` | 该 key 无此 API 权限 |
| `openapi.meitu.com` 新网关（SDK-HMAC-SHA256 签名） | HTTP 400 `GATEWAY_AUTHORIZED_ERROR` | key 亦不适用于新网关 |

**结论**：`ACCESS_KEY`/`SECRET_KEY` 网关层认证有效，但**账号未开通「局部重绘」权益**（需到美图开放平台申请接入/购买，或更换已开通的 key）。**端到端出图验证被此平台侧前置条件阻塞**，其余代码链路均已按官方契约实现并验证。

### M2–M3 已完成代码

| 文件 | 改动 |
|---|---|
| `server/meitu-client.ts`（新增） | **双通道客户端**：通道 A = 新 AIGCP 网关 formula 任务式（`openapi.meitu.com/api/v1/sdk/sync/push` + `/sdk/status` 轮询，SDK-HMAC-SHA256 签名，`MEITU_INPAINT_TASK` 配方 ID 由 env 配置，status 9→轮询/10→成功 urls/2,20→失败）；通道 B = mtlab v3 同步（`/v3/image_manipulation` query 密钥 + 超时降级 v1 异步轮询）。配置了配方 ID 走 formula，否则走 v3。另有 `buildMeituMask`（透明→白=重绘区/黑=保留区，强制同尺寸）、`mapMeituError`（业务码 + 网关码 401/403/404/424/433/500/502/503/504/599/80001/90002） |
| `server/image-generation.ts` | `EditImageInput` 增加 `provider` / `promptPos`；`editSmartAnnotationImage` 增加 `provider="meitu"` 分支（buildMeituMask → inpaintWithMeitu → 复用既有归一化/合成/可见性校验） |
| `server/index.ts` | `/api/images/edit` 路由 provider 标签按 meitu 请求显示为 `MEITU` |
| `.env.example` / `deploy/tencent-cloud/artx-server.env.example` | 登记 `ACCESS_KEY`/`SECRET_KEY`/`MEITU_BASE_URL`/`MEITU_FORMULA_BASE_URL`/`MEITU_INPAINT_TASK`（配方 ID，留空走 v3）/`MEITU_INPAINT_TIMEOUT_MS` |
| `client/src/lib/ai.ts` | `editImageWithPrompt` 透传 `provider`/`promptPos` |
| `client/src/components/canvas/InfiniteCanvas.tsx` | `AnnotationBubble` 增加"AI 修改引擎"选择（默认模型/美图局部重绘，**默认美图**，localStorage 记忆）；`handleAnnotationAiEdit` 按偏好透传 `provider:"meitu"` + `promptPos`=注释文本 |

### 验证记录（更新）

- `npm run check`（tsc --noEmit）：通过，零错误
- `vitest run server/image-generation.test.ts`：39/39 通过
- `npm run build`：通过（Vite 前端 + esbuild 后端 bundle）
- 功能实测：
  - formula 路径（配置 `MEITU_INPAINT_TASK` 后）：正确路由到新网关 + 签名 push，真实网关返回 `90002 GATEWAY_AUTHORIZED_ERROR` 并正确映射（账号无权益，符合预期）
  - v3 路径（未配置配方 ID）：真实网关返回 `80001 权限错误` 并正确映射
  - `buildMeituMask` 输出 白=255/黑=0 正确

### 待权益开通后的动作

1. 在美图开放平台申请「局部重绘」权益（详见上文开通流程）
2. 获取 formula 配方 ID（如 `/v1/Inpainting/xxxxxx`），填入 `.env` 的 `MEITU_INPAINT_TASK`（腾讯云部署模板同步）
3. 端到端联调：智能注释 → AI 修改（默认美图）出图；若 formula 通道不可用可临时清空配方 ID 走 v3 通道对比

### 补充调研确认（2026-08-11 后台 agent 全量文档扫描）

- **配方 ID 在公开文档中不存在**（doc 300-500 全范围扫描无「局部重绘」formula 任务）——doc/312 仅记录旧 mtlab v3 端点，配方 ID 只能申请权益后由官方提供，env 配置设计正确
- **status 码官方定义**（doc/222）：`-1`=任务不存在（已加显式报错）、`0`=已创建、`1`=处理中、`2`=失败、`9`=超时需继续轮询、`10`=成功
- **formula 结构验证**：与 doc/315（AI 生视频）、doc/369（路人消除）的 `POST /api/v1/sdk/sync/push` + `task` + `task_type:formula` + `init_images[].url/profile` 结构一致
- **JS SDK**：官方支持 `X-Sdk-Content-Sha256: UNSIGNED-PAYLOAD` 跳过 body 签名（后续可选优化）；AK/SK 通道 body ≤ 12MB（JPEG 重编码已控制体积）
- **explore 审计确认**：原 v3 实现的 6 项结构性差距（请求体/认证/任务流/蒙版参数/错误结构/结果提取）已在双通道重构中全部修复

### doc/312 复核调整（2026-08-12，直读官方文档 `close.mtlab.meitu.com/api/v1/doc/312`）

对照官方文档原文逐项复核现有实现，修复 3 处偏差：

| # | 问题 | 修复 |
|---|---|---|
| 1 | **蒙版二次转换 bug（功能级）**：`editSmartAnnotationImage` 已用 `buildMeituMask` 把注释蒙版转成白=重绘/黑=保留，`meitu-client` 内部又对**已转换**的蒙版再调 `buildMeituMask`（其 alpha 已全为 255 → 判定全部为保留区）→ **发给美图的 mask 全黑、无重绘区域**，端到端必然失败 | 新增 `encodeMeituMask`（仅尺寸归一 + JPEG 编码，**不再做 alpha→白/黑 语义转换**），v3 与 formula 两个通道统一改用；转换只由 `buildMeituMask` 完成一次 |
| 2 | 错误码表不全：doc/312 完整表格含 20010/20011/20012/20020–20023/21001–21006/21009–21013，旧表仅 14 个 | `MEITU_ERROR_MESSAGES` 补齐全部 30 个业务码（20001–21013、30001） |
| 3 | 请求体缺 `media_extra` 字段（doc 输入示例中每个 `media_info_list` 元素均含） | v3 请求体两个元素补 `media_extra: {}` |

复核确认与文档一致、无需改动的项：调用 URL（`v3/image_manipulation?api_key=&api_secret=`，无需签名）、`parameter`（rsp_media_type/prompt_pos/seed/num_samples/return_format_type）、`media_profiles.media_data_type="jpg"`（base64）、`extra`、失败结构 `{ErrorCode, ErrorMsg, Data}` 解析、超时降级通道设计。

新增 `server/meitu-client.test.ts`（7 用例）：蒙版透明→白/不透明→黑语义、hat 模式 30% 裁剪、**回归：v3 请求体中已转换蒙版保持白/黑不被二次转换**、请求体契约、失败结构映射、错误码全覆盖。

验证：`npm run check` 通过；`vitest run server/meitu-client.test.ts` 7/7；`npm run build` 通过。全量 `vitest run` 264 通过、1 失败（`cross-border-commerce-agent.test.ts` 为既有孤儿用例，其源文件在 HEAD 即不存在，与本任务无关）。

> 提示：正式出图仍受账号权益限制（v3=80001 / formula=90002），开通「局部重绘」权益后即可端到端验证。

### 签名算法修正 + 端到端出图成功（2026-08-13，直读 doc/331 + 官方 JS SDK）

**推翻 M1"权益未开通"结论——真正根因是签名算法用错**：

| 之前误用（返回 90002） | 官方正确（doc/218 + 官方 sign.js SDK） | 实测结果 |
|---|---|---|
| `MT4-HMAC-SHA256`（V4 派生链 + credentialScope） | **`SDK-HMAC-SHA256`**（直接 `HMAC(SK, stringToSign)`） | ✅ 通过 |
| `Authorization: MT4-HMAC-SHA256 Credential=...` | **`Bearer ${base64("SDK-HMAC-SHA256 Access=AK, SignedHeaders=..., Signature=...")}`** | ✅ 通过 |
| 仅签 `host;x-sdk-date` | **全部请求头**（`content-type;host;x-sdk-date`）小写排序 | ✅ 通过 |
| xSdkDate 带毫秒 `.149Z` | **`YYYYMMDDTHHMMSSZ` 无毫秒** | ✅ 通过 |
| canonicalURI 不补斜杠 | **必须补尾斜杠 `/`** | ✅ 通过 |
| canonicalHeaders 每行尾 `\n` | **`\n` join（无尾换行）** | ✅ 通过 |
| base64 带 `data:image/jpeg;base64,` 前缀 | **纯 base64**（`media_data_type:"jpg"`） | ✅ 图片下载成功 |

- 关键证据：官方 JS SDK zip（`AIGCP-API-javaScript-sdk-1.0.3.zip`，doc/232）内 `sign.js` 源码即为 `SDK-HMAC-SHA256` 算法；用户提供的 V4 `MT4-HMAC-SHA256` 示例代码为误导。
- **端到端实测通过**：项目 `inpaintWithMeitu` + `buildMeituMask` 调真实网关 → `push` → `status=10` → 返回结果图 URL（`https://obs-large.mtlab.meitu.com/...png`，HTTP 200 / image/png / 53KB）。密钥有效、权益可用。
- 代码修正：`server/meitu-client.ts` `buildSignedHeaders` 重写为官方 sign.js 算法；v3 通道已删除（doc/331 只有 formula 一条路）；`.env.example`/腾讯云模板同步。
- 验证：`npm run check` ✅；`vitest run server/meitu-client.test.ts` 13/13 + `ai-orchestrator.test.ts` 3/3 ✅；`npm run build` ✅。
