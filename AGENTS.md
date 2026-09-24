# ArtX Test Release Rules

- For every new task, keep the change scope strictly limited to the user's explicit request. Frontend and backend live in the same branch, but a frontend task must not modify unrelated backend code, and a backend task must not modify unrelated frontend code. Do not refactor, format, delete, overwrite, or revert unrelated modules unless the user explicitly asks for that.
- Before editing, check the current branch and `git status`; identify existing modified or untracked files and preserve them. Treat unrelated dirty files as user/other-agent work. Do not stage or commit `.env`, backup files, temporary files, build artifacts, or unrelated changes.
- Commit contents must be task-scoped. Before committing, review `git diff --stat` and `git status`, then stage only files required by the current task and its focused tests. If unrelated changes are present, leave them unstaged and mention that they were not included.
- When finishing a task, report the files changed, sensitive/unrelated modules not touched, the commit hash if a commit was made, and which online environment has or has not received the change.
- ⚠️ 汇报时必须明确区分「已推送到 main（用户看不到）」和「已上线到 www.artxsd.com（用户看得到）」，不得混为一谈。

# 发布口令约定（ericbi 2026-09-24 拍板，优先级高于本文件其他历史条目）

**只有一套线上环境**：`www.artxsd.com` / `backstage.artxsd.com` / `artxsd.com` 是**同一台机器
（43.161.241.133）、同一个进程（`artx-gray-backend` :3002）、同一个数据库**的不同名字。
后两个已 301 收口到 `www.artxsd.com`。**不存在隔离的测试环境。**

## 两条口令

| 用户说 | 动作 | 用户能否看到 |
|---|---|---|
| **「推送到分支」** | 只 `git push origin main`，**不触发任何部署** | ❌ 看不到，线上保持原样 |
| **「推送到正式环境」** | `git push origin main` + **手动触发** `Deploy Tencent Cloud Test` 工作流 | ✅ 上线到 `www.artxsd.com` |

手动触发方式（本机无 `gh` CLI，走 REST）：

```bash
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep '^password=' | cut -d= -f2)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/09beedesign-star/artx-test/actions/workflows/deploy-tencent-cloud.yml/dispatches \
  -d '{"ref":"main","inputs":{"run_full_smoke":"false"}}'
```

⚠️⚠️⚠️ **`deploy-tencent-cloud.yml` 与 `sync-main-to-test-framework.yml` 的 `push:` 触发器已刻意移除。**
任何一条加回 push 触发，「推送到分支」就会变成直接上线给真实用户 —— 恢复前必须先问用户。

## 「提交到测试环境」暂不绑定

用户原本希望它指 `backstage.artxsd.com`，但该域名与正式站是同一套环境且已 301 收口，
推它 = 推正式站，**没有隔离**。在真正建出独立测试环境（独立进程 + 独立数据库，
可用已在证书 SAN 内的 `gray.artxsd.com`）之前，**听到这个说法要先向用户确认意图**，
不要默认按「正式环境」执行。

## 发布后必须核验（不可省略）

- `https://www.artxsd.com/deployment.json` 的 `shortCommit` == 刚推的 commit
- `environment` 必须是 `production`
- `https://www.artxsd.com/api/health` 以及本次改动涉及的每个 API 路径
- 任一步失败，**不得声称已上线**，要指明卡在哪一步。
- ⚠️ 「产物已上线」≠「用户看得到」：还要探线上压缩产物里是否真含本次逻辑。

# Shared Components and Global Capabilities

- When a task involves shared UI components, visual states used across pages, shortcuts, copy, paste, delete, undo/redo, authentication, requests, caching, logging, internationalization, or other cross-page behavior, use `$global-capabilities` to inspect the existing implementation before proposing a global change.
- If `docs/global-capabilities.md` exists, read it before changing any shared component or common operation. Treat its registered owners, consumers, exclusions, and verification rules as the project source of truth.
- Classify affected UI as a global shared component, business-shared component, page-local component, or repeated-but-unconfirmed candidate before editing. Unregistered components default to page-local scope.
- Prefer registered shared components and common commands. Do not introduce broad global CSS selectors, duplicate command logic, or expand a local change across unrelated pages without evidence and user confirmation.
- When repeated implementations are found, report their locations, behavior differences, affected consumers, and migration risk before performing a global refactor.
- Buttons, menus, context menus, and keyboard shortcuts that represent the same user intent must call one shared command. Preserve native copy, paste, delete, and text-editing behavior inside `input`, `textarea`, `select`, and `contenteditable` unless the product explicitly owns that editing context.
- A shared-component or common-operation change must identify all known consumers and run focused regression checks. Use component or visual checks for isolated UI states and real browser checks for complete user workflows.
- Ordinary local UI edits do not require `$global-capabilities` when they do not affect registered shared components or cross-page behavior.
