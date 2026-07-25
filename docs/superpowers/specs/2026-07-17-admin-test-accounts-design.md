# 后台测试账号管理设计

## 目标

在现有 `/admin-prototype` 后台的用户管理与账户详情中，发放和管理测试账号，并对其额度、日限额、有效期、注销和 AI 使用进行统一、可审计的控制。不新建站点、不新建独立用户库。

## 已确认范围

- 测试账号是现有用户的一种 `accountType`，不是后台管理员 `role`。
- 后台可新建测试账号并生成一次性临时密码，也可将已有用户授予测试账号类型。
- 每个测试账号有可调整测试积分、单日 AI 积分上限与到期时间。
- 文本模型仅在上游响应提供 usage 时记录真实输入/输出 Token；图像任务记录模型、生成张数、积分、任务 ID，不能伪造 Token。
- 所有 AI 使用记录保存 ISO 时间；后台显示为 Asia/Shanghai 时区的 `YYYY-MM-DD HH:mm:ss`。
- 注销不可恢复：禁用登录、清零测试额度、禁止 AI 请求、后台隐藏可识别身份；保留匿名化审计和 AI 使用记录。
- 仅 `super_admin` 能发放、调整额度/限额和注销；其他后台角色只能查看。

## 方案比较

### 推荐：扩展既有账户、积分和 AI 任务统一入口

在 `auth-store` 管理登录可用性，在 `admin-store` 管理测试档案、积分台账、用量审计和操作审计。`AdminPrototypePage` 只调用现有 `/api/admin/*` 系列中的新增受控接口。

优点：一套用户 ID、同一积分流水、同一 AI 任务记录、服务端权限最终校验；改动限制在后台与 AI 请求拦截链路。

### 不采用：把测试账号做成管理员角色

会把产品账户类型与后台权限混在一起，存在测试用户意外获得管理权限的风险。

### 不采用：独立测试账号站点或用户库

会重复登录、积分、注销和审计逻辑，且不符合现有后台统一管理要求。

## 数据模型

在后台用户投影中增加可选 `testProfile`，普通账户不创建该字段：

```ts
type TestAccountProfile = {
  issuedAt: string;
  expiresAt: string;
  initialCredits: number;
  dailyCreditLimit: number;
  usageDate: string; // Asia/Shanghai calendar date
  reservedCredits: number;
  cancelledAt?: string;
  cancelledBy?: string;
};
```

余额继续使用现有 `credits` 字段，所有调整都通过现有积分台账写入；`initialCredits` 用于识别测试发放来源而不是复制余额。

AI 任务记录扩展为：

```ts
type AiTaskUsage = {
  usageKind: "tokens" | "images" | "credits";
  promptTokens?: number;
  completionTokens?: number;
  imageCount?: number;
};
```

任务原有的 `generationId`、`backendTaskId`、`providerTaskId`、模型、状态、积分和 `createdAt` 保持不变。没有上游 Token 数据时不补零冒充真实 Token，而是显示“上游未提供”。

## 服务端契约

所有写接口由现有管理员会话解析 actor，并在服务端要求 `super_admin`。

- `POST /api/admin/test-accounts`：创建新测试账号，或向已有 `userId` 发放测试档案；新账号生成仅展示一次的临时密码。输入包括 email、可选 displayName、initialCredits、dailyCreditLimit、expiresAt。
- `POST /api/admin/users/:id/test-profile`：调整测试积分、日限额或到期时间。积分变动调用同一台账与审计逻辑，不能直接覆盖余额。
- `POST /api/admin/users/:id/test-account/cancel`：二次确认后注销。禁用 auth 登录、清零测试余额、移除待用测试额度、标记注销，并追加不可逆审计事件。
- `GET /api/admin/users/:id/detail`：返回测试档案和该账号 AI 任务审计，时间精确到秒。

AI 请求在真正调用上游前经统一的测试账号预检：账号必须未注销、未过期、余额足够，且当日已成功消耗加上进行中预约额度不超过日限额。预检为本次任务写入预约额度；成功时将预约转换为真实扣费，失败/超时则释放预约，防止并发请求绕过限额。

## 界面与交互

在现有后台用户列表内增加“测试账号”筛选和账户类型标签，不新增路由。账户详情侧栏增加：

- 测试档案卡：可用测试积分、单日已用/上限、到期时间、状态。
- 发放/调整：新建测试账号、已有账号授予测试类型、积分调整、日上限与到期时间编辑。
- 注销：危险操作按钮，使用现有 `Dialog` 二次确认，明确不可恢复。
- AI 使用记录：时间（秒）、能力、模型、状态、真实 Token 或图像计量、积分、任务关联 ID。

注销和额度调整只通过同一服务端操作执行；列表操作和详情操作不各自实现业务规则。

## 权限与隐私

- 前端只据角色隐藏/禁用危险操作；服务端始终再次校验 `super_admin`。
- 临时密码不得写入审计日志、AI 日志、前端持久化或响应缓存；仅在创建成功响应中显示一次。
- 注销后管理界面和审计展示使用匿名账号标识；审计保留操作人、时间、目标匿名 ID、变更前后限额，不保留可识别内容。
- 所有写操作记录 who/when/what/why；不记录模型 API 密钥、会话令牌或用户提示词全文。

## 验收与测试

1. `super_admin` 可创建/发放测试账号；非 `super_admin` 写请求返回拒绝。
2. 测试积分调整产生台账、后台通知和审计记录；日限额和到期时间可更新。
3. 预检在调用模型前阻止已注销、已过期、余额不足或超日限额账号；失败任务释放预约额度。
4. 文本任务有上游 usage 时记录真实 Token；无 usage 的文本和图像任务明确展示可用计量，时间精确到秒。
5. 注销禁用登录和 AI 生成，清零测试余额，保留匿名化 AI/管理审计。
6. 后台真实浏览器流程覆盖：筛选测试账号、发放、调整、查看用量、注销确认。
7. 既有普通用户、管理员、积分调整、AI 计费和现有 `/admin-prototype` 路径回归通过。

## 非目标

- 不新增独立后台站点或独立测试账号数据库。
- 不修改模型供应商、API Key、用户侧订阅套餐或正式支付流程。
- 不对没有 usage 字段的供应商猜测或折算 Token。
