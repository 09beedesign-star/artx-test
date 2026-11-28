# 项目长期记忆 — ArtX（`/Users/ericbi/WorkBuddy/artx/artx-test-main`）

## 图片上传功能整合完成（2026-01-latest）
- ✅ UploadDialog.tsx 组件签名改为 `open/onOpenChange/prefilledData`，支持外部集成
- ✅ ProfilePage 新增「我的作品」标签页：加载用户发布作品、删除按钮、空态引导
- ✅ CreationHistoryPage 右键菜单：弹出 UploadDialog 并预填图片 URL 和提示词
- ✅ design-tags.ts 创建：5 个分类、32 个标签定义（风格/介质/主题/技术/氛围）
- ✅ Build 通过：0 errors，所有组件已正确打包
- 📌 下一步：直接 `git commit/push main`，然后 dispatch 生产部署
