# 交接：feature/credit-gifting → main 合并说明

> ## ✅ 已于 2026-09-13 07:40 完成合并，本文档转为历史存档，无需再执行。
>
> 合并提交：`532cb6f`。**下面第三节描述的两处冲突已实际融合并带测试锁住**，
> 请不要再按本文档重做一遍。融合的最终实现以 `server/admin-store.ts` 的
> `resolveMembershipBatchExpiry()` 与 `loadAdminData()` 内的四步链为准。
>
> ⚠️ 合并时发现文档**漏列了一个隐藏冲突点**：`extendMembershipBatchesExpiry()`
> （续费顺延）git 不会标记为冲突，但原实现会把批次无条件拉齐到新会员到期日，
> 当场撤销滚存封顶。三个调用点必须一起改，详见 `532cb6f` 的提交说明。
>
> 📌 第四节的 `confirmHighRisk` 缺陷**尚未修复**，仍然有效，需单独处理。
>
> ---
>
> 来源：另一个 WorkBuddy 会话（负责「赠送积分服务层 / 规则三 / 转赠禁令 / 续费语义」）
> 原状态：该会话已**停止改动一切积分文件**，本分支不再更新，可安全合并。
> 生成时间：2026-09-13 00:29

---

## 一、本分支有什么（4 个提交，都在 `feature/credit-gifting`，**未合 main**）

| commit | 内容 |
|---|---|
| `8d75685` | 统一赠送服务层 `server/credit-gifting.ts` + 管理员批量赠送 API |
| `3f6248a` | **规则三**：会员到期后，订阅赠送的积分同步失效 |
| `8583843` | 锁死「禁止用户之间转赠积分」产品边界（含 10 条防护测试） |
| `4743dd0` | 会员续费「顺延」语义定案 + 3 条行为锁 |

新增文件（main 上完全没有，合并时不会冲突）：
- `server/credit-gifting.ts` —— 赠送服务层，**所有积分发放的唯一入口**
- `server/credit-gifting.test.ts`
- `server/credit-transfer-ban.test.ts` —— 转赠禁令三层防护
- `server/admin-credit-gift.test.ts`
- `server/admin-membership-expiry.test.ts`

修改文件：
- `server/admin-store.ts` （**唯一与 main 冲突的文件**）
- `client/src/pages/AdminPrototypePage.tsx` （main 未动，不冲突）

---

## 二、⚠️ 合并冲突只有 2 处，但**都不能简单二选一**

`git merge-tree` 空跑结果：真实冲突 2 处，均在 `server/admin-store.ts`。
两边各对一半，**必须做语义融合**。

### 冲突 1：会员积分批次的 `expiresAt`

```
main 侧:  expiresAt: addMonthsIso(paidAt, MEMBERSHIP_BATCH_VALID_MONTHS)
本分支:   expiresAt: membershipExpiresAt || addMonthsIso(paidAt, getBillingCycleMonths(order.cycleId))
```

- **只取 main 侧 → 规则三失效**：会员身份已到期，但积分批次按「滚存期数」独立计时，
  仍然有效 → 出现「不是会员了，会员积分还能用」。
- **只取本分支 → 滚存失效**：每期批次都被拉齐到账号会员到期日，
  按月发放 + 滚存 1 个月等于没做。

**✅ 正解：取两者的较小值**

```ts
// 批次有效期 = min(滚存自然有效期, 账号会员到期日)
// 前者保证「按月发放+滚存1个月」的额度节奏，后者保证「会员没了积分也没」。
const rolloverExpiry = addMonthsIso(paidAt, MEMBERSHIP_BATCH_VALID_MONTHS);
const expiresAt = membershipExpiresAt && Date.parse(membershipExpiresAt) < Date.parse(rolloverExpiry)
  ? membershipExpiresAt
  : rolloverExpiry;
```

> 背景：`membershipExpiresAt` 是 `createCreditBatchForPaidOrder()` 的**第 6 个参数**，
> 由调用方 `markBillingOrderPaid` 透传。**不能在函数内重算** —— 顺延语义下
> 到期日以「当前到期日」为基准，函数内重算会让月卡变两个月。

### 冲突 2：`loadAdminData()` 里的惰性任务链

```
main 侧:  补发到期期数 → 按自然有效期过期 → 滚存封顶      （共用一个 now）
本分支:   过期 → expireMemberships() 会员降级              （共用一个 now）
```

**✅ 正解：合成一条四步链，全程共用同一个 `now`**

```ts
const checkedAt = nowIso();
const issuedMembership   = issueDueMembershipCredits(data, checkedAt);  // 1 补发
const shouldPersistCreditExpiry = expireCreditBatches(data, checkedAt); // 2 过期
const shouldPersistMembershipExpiry = expireMemberships(data, checkedAt); // 3 降级
const cappedMembership   = capMembershipRollover(data, checkedAt);      // 4 封顶
```

**顺序不能换**，四步各有理由：
1. 补发必须最先 —— 否则新到期的这一期还没发出来就被过期逻辑跳过。
2. 过期在降级前 —— 先按各批次自己的 `expiresAt` 正常过期。
3. **降级必须在过期之后、封顶之前**：
   - 放在过期**之前** → 会员刚降级，`expireCreditBatches` 会把本来还在有效期内的
     批次一起清掉（多清）。
   - 放在封顶**之后** → 封顶是按「月额度倍数」算的，此时用户档位已经不该是 Pro，
     会按错误的档位额度封顶（漏清 / 算错）。
4. 封顶最后。

⚠️ 四步共用同一个 `checkedAt` 是硬要求。各自调 `nowIso()` 会出现
「积分过期了但档位还挂着 Pro」的中间态，以及边界上的漏网批次。

持久化条件记得把四个标志都并进去：
```ts
if (shouldPersistCleanup || shouldPersistOrderTimestampRepair
    || shouldPersistCreditExpiry || shouldPersistMembershipExpiry
    || issuedMembership || cappedMembership) { ... }
```

---

## 三、🔴 一个**两条线都还没修**的真实缺陷，合并时请一并处理

**位置**：`client/src/pages/AdminPrototypePage.tsx:961`（在本分支上）

**现象**：后台批量赠送积分的「大额二次确认」闸门**永远不会触发**。

**代码**：

前端提交时自己算好了 `confirmHighRisk` 并直接发给后端：
```ts
body: JSON.stringify({
  userIds: giftSelectedUserIds,
  amount: giftAmount,
  reason: giftReason.trim(),
  expiryDays: giftExpiryDays,
  confirmHighRisk: giftAmount * giftSelectedUserIds.length >= 10000,   // ← :961
}),
```

而后端 `server/admin-store.ts:3199` 的拦截条件是：
```ts
if (amount * userIds.length >= 10000 && body.confirmHighRisk !== true) {
  // 返回 409，要求二次确认
}
```

**两个表达式完全相同** → 每当后端想拦截时，前端恰好已经送上 `true`
→ 409 永远不会返回，二次确认形同虚设。

`AdminPrototypePage.tsx` 全文件**没有任何 `confirm(` 调用**；
`:3668` 只是渲染了一段静态文字「（大额，需二次确认）」，没有任何实际交互。

同一问题在 `:3107`（后台人工调整积分，阈值 `Math.abs(delta) >= 10000`）
也需要顺带检查。

**建议修法**：前端命中阈值时先弹确认，用户确认后才带 `confirmHighRisk: true`。

```ts
const isHighRisk = giftAmount * giftSelectedUserIds.length >= 10000;
if (isHighRisk) {
  const total = (giftAmount * giftSelectedUserIds.length).toLocaleString("zh-CN");
  const ok = window.confirm(
    `即将向 ${giftSelectedUserIds.length} 个账号共发放 ${total} 积分，该操作不可撤销。确认继续？`
  );
  if (!ok) { setGiftSubmitting(false); return; }
}
// ...
body: JSON.stringify({ ..., confirmHighRisk: isHighRisk }),
```

> 更好的做法是用项目里的 Dialog 组件而不是 `window.confirm`，但先堵住闸门最重要。

---

## 四、本分支已定案、请勿推翻的产品语义

1. **会员续费 = 顺延**（用户 09-13 确认）。
   未到期时新周期从**原到期日**往后接，不是从付款日重算；已过期则从付款日起算。
   实现：`resolveMembershipExpiry()`。
   防护：`admin-membership-expiry.test.ts` 的 `describe("续费语义锁")` 3 条。
   **看到这几条用例失败不是测试写错了，是有人在推翻已确认的产品决策。**

2. **禁止用户之间转赠积分**（硬边界）。
   积分只能平台单向发放。运行时闸门在 `credit-gifting.ts` 的
   `ALLOWED_GIFT_SOURCE_PREFIXES = ["admin/", "rule/", "order/", "system/", "test/"]`，
   `grantCredits()` 写入前校验 `source`。**必须前缀匹配**，
   用「包含」会让 `evil-admin/`、`user/admin/` 蒙混过关。
   防护：`credit-transfer-ban.test.ts` 10 条三层（运行时闸门 / 源码扫描 / 越权收款人）。

3. ⚠️ **新增全局校验后务必回扫既有测试夹具**。
   合并后若给 `grantCredits` 加了新的前置校验，请检查所有测试里的 `source` 取值 ——
   本分支就踩过：`credit-gifting.test.ts` 里占位的 `source: "s"` 被闸门提前拦下，
   原本要测的金额/日期分支根本走不到，**测试静默失效比测试失败更危险**。

---

## 五、验收基线

- `npx tsc --noEmit` 应干净。
- **没有 `npm test`**，用 `npx vitest run`。
- **基线 = 12 failed**（vitest 不加载 `.env` 导致，恒定）。
  零回归的判断标准是 **failed 仍为 12**，不要看 passed 绝对值。
- ⚠️ FAIL 清单 diff 前**两边都要归一化**，否则会出现「12 条全是新增」的假回归：
  `grep FAIL | sed 's/^ *FAIL  *//' | sort -u` 之后再 `comm -13`。
- ⚠️ `admin-credit-gift.test.ts > 赠送会写入审计日志` 是**间歇性失败**
  （共享数据文件串扰），单独跑必过，不是代码缺陷。
