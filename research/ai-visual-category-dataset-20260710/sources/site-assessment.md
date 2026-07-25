# 全球 AI 视觉站点可采集性评估

结论：优先级按“公开可访问、能拿到图片链接、能看到 prompt/描述/标签、能看到热度信号”排序为：

1. Civitai
2. Tensor.Art
3. PixAI
4. Ideogram
5. SeaArt

## 推荐站点

| 站点 | URL | 可采集性 | 热度信号 | Prompt / 描述 | 图片 URL | 结论 |
|---|---|---|---|---|---|---|
| Civitai | https://civitai.com/images | 有公开图库和公开 API | API 支持 Most Reactions / Most Comments / Newest，并返回 like / heart / comment 等统计 | API meta 常包含 prompt、negativePrompt、模型参数 | API 返回图片 URL、尺寸、hash | 最适合工程化采集 |
| Tensor.Art | https://tensor.art/ | 有公开作品和 tag 页面 | 公开页常见 Trending / Latest / Most Liked | 部分作品有描述、标签、模型信息 | 浏览器渲染后可取预览图 URL | 适合浏览器抽取，小样本先验证 |
| PixAI | https://pixai.art/en | 有公开作品、tag、ranking | Trending / Daily Ranking | 部分公开 prompt / tag | 浏览器 DOM 可取缩略图 | 适合二次元、角色、插画，不适合所有商业品类 |
| Ideogram | https://ideogram.ai/t/explore | 有公开 explore / top creations | hour / day / week / month top creations | 公开图通常可根据 prompt 搜索 / remix | 页面可见图片，API 偏生成而非图库检索 | 部分适合，建议半自动采集 |
| SeaArt | https://www.seaart.ai/ | 有公开社区 / 模板 / Explore | 有社区热度但结构化不稳定 | 部分有模板描述、标签 | 浏览器渲染后可取预览图 | 部分适合，需限速和抽样验证 |

## 排除或降级站点

| 站点 | 原因 |
|---|---|
| Midjourney Explore | 名气极高，但无稳定公开图库 API，Cloudflare / 登录 / 反爬风险较高 |
| Leonardo.Ai | 影响力强，但社区 feed 多在登录态内，公开结构化采集链路不稳定 |
| OpenArt | 可作为关键词验证和灵感搜索源，但当前公开热度字段与可批量结构化能力弱于前 5 |
| NightCafe | 社区成熟，公开页能看到部分热度和 prompt，但缺少稳定公开检索 API |
| Adobe Firefly Gallery | 品牌可信，版权边界相对清楚，但批量热度排序和字段完整性不足 |
| Freepik / Pikaso | 更偏授权素材和生成工具，不适合直接做公开 AI 社区热度图采集 |
| Krea | 商业视觉和建筑方向强，但缺少足够明确的公开社区热度 / 排序采集入口 |

## 合规边界

- 只采公开页面、公开 API、公开预览图。
- 不绕过登录、付费墙、robots、Cloudflare、人机校验、站点反爬。
- 不采私密图、受限原图、用户不可公开访问内容。
- 所有条目必须保留来源 URL、站点名、授权备注和下载状态。
- 图片只作为研究样本与风格分析素材；商业使用前必须重新确认授权。
