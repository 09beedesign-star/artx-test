# AI Visual Category Dataset - 2026-07-10

目标：按 ArtX 分类收集公开 AI 视觉参考链接、图片自身公开 prompt、热度信号，并下载可公开访问的预览图。

边界：不绕过登录、付费、robots 或反爬；不下载受限原图；图片仅作为研究样本与风格分析素材，需要商业使用时必须重新确认授权。

结构：
- taxonomy.json：用户提供的分类树
- dataset.csv：采集明细
- images/：下载成功的预览图
- sources/：站点可采集性评估与采集日志
- scripts/：保守采集脚本，默认只采公开 API 或公开页面可访问资源

采集目标规模：
- 目标总量 900 条
- 每条必须满足“展示图片 = 该图片公开生成 prompt 对应的图片”
- 没有 `meta.prompt` / `Prompt` 的图片不进入用户可见灵感推荐池

当前执行边界：
- Civitai 是优先工程化来源，公开 API 字段最完整。
- Lexica Search API 是补充工程化来源，公开结果包含 `src` 和 `prompt`，适合补足 verified prompt-image 数据。
- Tensor.Art、PixAI、Ideogram、SeaArt 更适合先做浏览器抽取小样本。
- 当前本机网络访问 Civitai / Tensor / Ideogram 等动态站点存在超时，脚本会打印失败项，不会伪造下载成功。
- PromptBase 公开页通常只有商品描述或标题，不保证是展示图的原始 prompt；相关 62 条描述与预览图已删除，不再采集、导入或进入用户可见推荐池。
- 当前可用的 900 条用户可见数据来自公开 curated prompt-image gallery：YouMind GPT Image 2 / Nano Banana Pro、WeShop GPT Image 2、PicoTrex Nano Banana、Awesome GPT Image 2 Gallery 等。每条都必须同时有可访问图片 URL 和同条目展示的 prompt。

## 当前验证结果

- 已完成站点评估：`sources/site-assessment.md`
- 已完成关键词映射：`sources/keyword-map.md`
- 已完成 Civitai 采集脚本语法验证：`python3 -m py_compile scripts/collect_civitai.py`
- 已执行 Civitai 单类测试：`服装`，当前网络返回超时；后续需要在网络可达环境继续跑可续采脚本。
- PromptBase smoke 数据已移除：删除 62 条外部描述、8 张公开缩略图样本、链接 CSV 与采集脚本，等待 Civitai / Lexica verified 数据重新补足。
- 已完成 GitHub curated gallery 采集：`dataset-github-curated.csv` 写入 900 条去重 prompt-image 对，`build_reference_data.py` 已生成 `server/inspiration-reference-data.ts`。

## 后续全量采集命令

```bash
python3 research/ai-visual-category-dataset-20260710/scripts/collect_civitai.py --limit 25 --target-total 900 --pages-per-query 20 --timeout 30
python3 research/ai-visual-category-dataset-20260710/scripts/collect_lexica.py --limit 25 --target-total 900 --timeout 30
python3 research/ai-visual-category-dataset-20260710/scripts/collect_github_prompt_galleries.py --target-total 900 --timeout 80
python3 research/ai-visual-category-dataset-20260710/scripts/build_reference_data.py --limit 900
```

建议先分批跑：

```bash
python3 research/ai-visual-category-dataset-20260710/scripts/collect_civitai.py --only-subcategory '服装' --limit 20 --timeout 30 --download
```
