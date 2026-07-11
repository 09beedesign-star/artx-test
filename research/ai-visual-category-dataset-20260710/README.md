# AI Visual Category Dataset - 2026-07-10

目标：按 ArtX 分类收集公开 AI 视觉参考链接、公开 prompt/描述、热度信号，并下载可公开访问的预览图。

边界：不绕过登录、付费、robots 或反爬；不下载受限原图；图片仅作为研究样本与风格分析素材，需要商业使用时必须重新确认授权。

结构：
- taxonomy.json：用户提供的分类树
- dataset.csv：采集明细
- dataset-links.csv：链接型采集明细，不要求下载图片到本地
- images/：下载成功的预览图
- sources/：站点可采集性评估与采集日志
- scripts/：保守采集脚本，默认只采公开 API 或公开页面可访问资源

采集目标规模：
- 45 个子类目
- 每个子类目 20 条
- 理论总量 900 条

当前执行边界：
- Civitai 是优先工程化来源，公开 API 字段最完整。
- Tensor.Art、PixAI、Ideogram、SeaArt 更适合先做浏览器抽取小样本。
- 当前本机网络访问 Civitai / Tensor / Ideogram 等动态站点存在超时，脚本会记录失败项，不会伪造下载成功。
- 如果只接入链接数据，不下载到本地，则优先使用 `dataset-links.csv`。前端可直接读 `image_url` 或通过 ArtX 图片代理加载。

## 当前验证结果

- 已完成站点评估：`sources/site-assessment.md`
- 已完成关键词映射：`sources/keyword-map.md`
- 已完成 Civitai 采集脚本语法验证：`python3 -m py_compile scripts/collect_civitai.py`
- 已执行 Civitai 单类测试：`服装`，当前网络返回超时，`dataset.csv` 中已记录 `metadata_failed`
- 已完成图片下载链路 smoke test：PromptBase 公开缩略图 8/8 下载成功，见 `images/promptbase-smoke/` 和 `sources/promptbase-smoke.csv`
- 已完成链接型数据 smoke test：PromptBase 公开页面抽取 62 条图片预览 URL，见 `dataset-links.csv`

## 链接模式

链接模式不把图片下载到本地，只保存：

- `source_url`：作品页或来源页
- `image_url`：公开图片预览 URL
- `title`：公开标题
- `public_prompt_or_description`：公开标题、prompt 或描述
- `style_prompt_en`：可复用的英文提示词方向
- `download_status=link_only`

这更适合接入产品数据库。前端展示时建议走你们已有的 `/api/images/proxy`，避免跨域和远程站点防盗链问题。

## 后续全量采集命令

```bash
python3 research/ai-visual-category-dataset-20260710/scripts/collect_civitai.py --limit 20 --timeout 30 --download
```

建议先分批跑：

```bash
python3 research/ai-visual-category-dataset-20260710/scripts/collect_civitai.py --only-subcategory '服装' --limit 20 --timeout 30 --download
```

链接采集样例：

```bash
python3 research/ai-visual-category-dataset-20260710/scripts/collect_promptbase_links.py --limit 100
```
