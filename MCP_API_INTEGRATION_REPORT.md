# ArtX MCP / API 外部调用接入说明

> 本文所有 schema、响应结构、错误码均摘自源码（`server/index.ts`、`server/auth-store.ts`、
> `shared/image-models.ts`，对应提交 `c90d4d5`），不是推测。
> 线上验证：`BACKEND_URL=https://www.artxsd.com ARTX_MCP_API_KEY=... npm run verify:mcp`
> → **4 ok / 1 skipped / 0 failed**（skipped = 出图，未开 `RUN_IMAGE=1`，因为会扣积分）。

---

## 1. 端点一览

| 用途 | 方法 + 路径 | 鉴权 |
|---|---|---|
| 服务健康检查 | `GET /api/health` | 无 |
| MCP 清单（工具列表） | `GET /api/mcp/manifest` | 无 |
| MCP 主入口（JSON-RPC 2.0） | `POST /api/mcp` | `Authorization: Bearer artx_sk_...` |
| 列出我的 API key | `GET /api/developer/api-keys` | 登录会话 token |
| 创建 API key | `POST /api/developer/api-keys` | 登录会话 token |

- 生产：`https://www.artxsd.com`
- 本地开发：`http://localhost:3000`（由 `vite.config.ts` 的 `vitePluginDeveloperApi()` 镜像同样的路由）

### Manifest 响应

```json
{
  "name": "artx-image",
  "version": "1.0.0",
  "transport": "streamable-http",
  "endpoint": "/api/mcp",
  "tools": [ /* 见第 4 节 */ ]
}
```

---

## 2. API key

- 格式：`artx_sk_` + 约 43 位 URL-safe 字符，**总长 51 位**。
- 服务端只存前 16 位前缀 + 哈希；**完整 key 只在创建时返回一次**，丢了只能重建。
- key 被吊销、或所属用户被停用 → 401。每次使用会更新 `lastUsedAt`。

### 创建 key

请求体可选 `name`（最长 48 字符，缺省 `"ArtX API Key"`）：

```bash
curl -X POST https://www.artxsd.com/api/developer/api-keys \
  -H "Authorization: Bearer <登录会话token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent"}'
```

响应：

```json
{
  "key": {
    "id": "...",
    "name": "my-agent",
    "prefix": "artx_sk_xxxxxxxx",
    "createdAt": "...",
    "value": "artx_sk_...（完整 key，仅此一次）"
  }
}
```

未登录调用这两个接口 → `401 {"error":"登录已失效，请重新登录"}`。

> 本地开发 token `artx-dev-auto-login-token` 仅在 `ARTX_DEV_AUTO_LOGIN=true` 且
> `NODE_ENV !== "production"` 时有效，**生产环境已实测拒绝（401 / -32001）**。

---

## 3. MCP 协议流程

所有响应都是 JSON-RPC 2.0 信封：

```jsonc
// 成功
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }
// 失败
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "...", "data": { ... } } }
```

`id` 缺省时回 `null`；`error.data` 只在有附加信息时出现。

### 3.1 initialize

```bash
curl -X POST https://www.artxsd.com/api/mcp \
  -H "Authorization: Bearer $ARTX_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "artx-image", "version": "1.0.0" }
  }
}
```

### 3.2 notifications/initialized

返回 HTTP 202，`{"ok":true}`。

### 3.3 tools/list

```bash
curl -X POST https://www.artxsd.com/api/mcp \
  -H "Authorization: Bearer $ARTX_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

`result.tools` 为第 4 节两个工具。

### 3.4 tools/call

```bash
# 免费：验证 key
curl -X POST https://www.artxsd.com/api/mcp \
  -H "Authorization: Bearer $ARTX_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"artx_health","arguments":{}}}'

# 扣积分：出图
curl -X POST https://www.artxsd.com/api/mcp \
  -H "Authorization: Bearer $ARTX_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"artx_generate_image","arguments":{"prompt":"一只橘猫坐在窗台上，水彩风格","model":"vod-og25-sunburst-low","ratio":"1:1","count":1}}}'
```

---

## 4. 工具定义（源码原文）

### 4.1 `artx_health`

- 描述：「验证 ArtX API key 和 MCP 服务是否可用，不消耗积分。」
- inputSchema：

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

- 响应（`content[0].text` 是一段 JSON 字符串）：

```json
{
  "jsonrpc": "2.0", "id": 3,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"user\": \"<用户名/邮箱>\",\n  \"apiKeyPrefix\": \"artx_sk_xxxxxxxx\",\n  \"tools\": [\"artx_health\", \"artx_generate_image\"]\n}"
    }]
  }
}
```

### 4.2 `artx_generate_image`

- 描述：「使用 ArtX 图片生成能力根据提示词生成图片。该工具会消耗账号积分。」
- inputSchema：

| 参数 | 类型 | 必填 | 说明（源码原文） |
|---|---|---|---|
| `prompt` | string | ✅ | 图片生成提示词 |
| `model` | string | | 可选模型 id 或展示名，例如 vod-gg36 / banana 2.1、vod-og25-sunburst-medium / image2.5 medium。不传或传 auto 用默认模型；**无法识别的模型直接报错，不会静默回落**。 |
| `ratio` | string | | 可选画幅比例，例如 1:1、4:5、16:9（自由字符串，非枚举） |
| `count` | number | | 生成数量，默认 1，最多 9（限制写在描述里，schema 未设 min/max） |
| `skillId` | string | | 可选 ArtX Skill ID |

`additionalProperties: true`（多余字段不会被拒）。

- **可用模型 id**（`IMAGE_MODEL_PRIORITY_IDS`，共 15 个）：

```
vod-og25-sunburst-medium   vod-og25-flare-medium
vod-og25-sunburst-low      vod-og25-flare-low
vod-gem                    vod-gem-lite
vod-gg36                   vod-jimeng
vod-og                     vod-mj
vod-kling                  vod-si
vod-qwen
vod-og25-sunburst-high     vod-og25-flare-high
```

展示名（如 `banana 2.1`）会先经 `normalizeImageModelId()` 归一成 id 再校验。

- 成功响应：

```json
{
  "jsonrpc": "2.0", "id": 4,
  "result": {
    "content": [
      { "type": "text", "text": "<下方 structuredContent 的 JSON 字符串>" },
      { "type": "image_url", "image_url": { "url": "https://www.artxsd.com/..." } }
    ],
    "structuredContent": {
      "ok": true,
      "type": "...",
      "capability": "...",
      "model": "vod-og25-sunburst-low",
      "route": "...",
      "images": [ { "...": "原图字段", "index": 0, "url": "公网可访问地址" } ],
      "providerTaskId": "...",
      "providerTaskIds": ["..."]
    }
  }
}
```

每张图在 `content` 里各有一条 `image_url`；推荐程序读 `structuredContent.images[].url`。
注意：用户上传/生成的图服务端**保留 15 天**，调用方需要长期保存请自行下载。

---

## 5. MCP 客户端配置

支持 streamable-http 的客户端（Cursor / Claude Desktop 新版 / Cline 等）：

```json
{
  "mcpServers": {
    "artx": {
      "type": "streamable-http",
      "url": "https://www.artxsd.com/api/mcp",
      "headers": { "Authorization": "Bearer artx_sk_你的key" }
    }
  }
}
```

（字段名 `type` / `transport` 各客户端略有差异，以客户端文档为准。）

---

## 6. 错误码

| HTTP | JSON-RPC code | message | 触发场景 |
|---|---|---|---|
| 401 | -32001 | 请使用有效的 ArtX API key | 未带 `Authorization` |
| 401 | -32001 | API key 无效或已被停用 | key 错误 / 已吊销 / 用户被停用 |
| 400 | -32600 | Invalid MCP request | 请求体不是合法 JSON-RPC |
| 404 | -32601 | Unknown MCP method: xxx | `method` 不在支持列表 |
| 404 | -32601 | Unknown tool: xxx | `tools/call` 的 `name` 不存在 |
| 400 | -32602 | prompt is required | 出图未传 `prompt` 或为空 |
| 400 | -32602 | Unknown image model: xxx. Use one of: ... | `model` 认不出；`data.supportedModels` 列出 15 个可用 id |
| 视错误而定 | -32000 | 上游/计费错误信息 | 出图失败；积分不足时 `data` 带扣费与余额信息 |

示例（未知模型）：

```json
{
  "jsonrpc": "2.0", "id": 4,
  "error": {
    "code": -32602,
    "message": "Unknown image model: foo. Use one of: vod-og25-sunburst-medium, ...",
    "data": { "supportedModels": ["vod-og25-sunburst-medium", "..."] }
  }
}
```

> 本地 dev（Vite 插件）鉴权失败的 message 为英文 `Unauthorized`，code 相同。

---

## 7. 计费与限流

- `artx_health` 免费；`artx_generate_image` 按模型单价预占积分（`AiUsageReservation`），失败退回。
- 出图路由共用限流：默认 **12 次/分/IP**（`AI_RATE_LIMIT_PER_MINUTE`），超出返回 429。

---

## 8. 自检脚本

```bash
# 不扣积分
BACKEND_URL=https://www.artxsd.com ARTX_MCP_API_KEY=artx_sk_... npm run verify:mcp
# 额外真实出一张最便宜的图（会扣积分）
RUN_IMAGE=1 MCP_IMAGE_MODEL=vod-og25-sunburst-low BACKEND_URL=... ARTX_MCP_API_KEY=... npm run verify:mcp
```
