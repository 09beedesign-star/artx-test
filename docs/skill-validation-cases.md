# Skill Validation Cases

This document defines the minimum-cost validation prompts for the 28 ArtX skill MD files.
The validation branch should use these cases to confirm every skill can produce a corresponding result on canvas.
Text skills (`capability: chat`) return their result as an assistant message in the canvas assistant panel instead of an image.

| Skill ID | Minimum Prompt | Expected Visual Result | Pass Criteria |
| --- | --- | --- | --- |
| `brand-system-kit` | 为一家面向年轻设计师的 AI 灵感工具生成品牌系统，风格清爽、专业、有一点未来感。 | A brand system board with palette, typography mood, logo zone, graphic language, and multiple application examples. | The output is visibly a brand kit, not a single poster; it contains several organized brand-system areas. |
| `logo-identity-lab` | 为一家名叫 Ember Cafe 的精品咖啡品牌探索 Logo，关键词是温暖、手作、城市通勤。 | A logo exploration sheet with multiple logo directions such as symbol, wordmark, badge, and recommended option. | At least 4 distinct logo concepts are visible and inspectable; marks are simple and not copied from famous brands. |
| `landing-page-visual` | 为一款 AI 图片协作工具生成产品官网首屏，突出多人协作、画布生成和快速出图。 | A website hero or landing page visual with product signal, CTA, feature modules, and responsive UI feel. | The output reads as a real web/product page, with clear hierarchy and UI layout rather than a generic poster. |
| `commerce-poster-social` | 为夏季运动水杯做一张电商活动海报，主打冰感、防漏、限时 8 折，适合社媒投放。 | A commercial poster/social visual with product hero, headline zone, offer, CTA, and brand placement. | Product is prominent, campaign hierarchy is clear, and text zones are readable. |
| `cross-border-commerce-agent` | 为阿联酋 Noon 平台生成一张高端香氛身体乳商品图，模板用生活场景图，保留阿拉伯语/英语标题、卖点、价格和 CTA 安全区，不直接写价格。 | A Gulf-market ecommerce product visual with modest lifestyle context, product clarity, locked safe areas, and Arabic/English editable copy zones. | The output avoids alcohol, exposed models, religious-symbol decoration, and baked-in price/claims; it reads as a cross-border marketplace visual. |
| `product-photography` | 生成一张高端无线耳机的商品摄影图，哑光黑材质，暗色背景，边缘冷光，适合新品发布。 | A polished product photography or commercial render with clear product subject, material, light, surface, and shadow. | The product remains inspectable, centered or intentionally composed, with realistic lighting and material cues. |
| `video-storyboard` | 为一款智能台灯做 15 秒短视频分镜，开头强调深夜工作，结尾展示自动调光。 | A storyboard board with multiple sequential frames, hook, product reveal, benefit moment, and ending CTA. | Several frames appear in sequence with captions or shot notes; the result is not a single unrelated image. |
| `image-local-edit` | 把这张图片里的背景换成干净的白色电商背景，并保持主体不变。 | An image edit result that preserves the subject while changing or cleaning the background. | Subject identity, proportions, and important details are preserved; background is cleaner and commercially usable. |
| `visual-reference-audit` | 分析这个参考方向并生成一个更高级、更干净的版本，要求层级清楚、留白更好、视觉更统一。 | An improved visual direction that reflects analysis: better hierarchy, alignment, contrast, spacing, and style consistency. | The output visibly improves organization and quality rather than only producing a text report. |
| `art-poster-design` | 为一场独立电子音乐节做一张艺术海报，核心概念是「城市夜里的低频共振」，中文主标题要能远距离读出。 | An art poster with one dominant idea, a clear compositional device, three typographic levels, and deliberate empty space. | The poster reads as a designed poster rather than a text overlay; one idea dominates, and the main title is legible. |
| `knowledge-comic` | 用 6 格漫画解释「为什么熬夜会让第二天决策变差」，第一格用场景提出问题。 | A six-panel comic strip with a scene-based opening, mechanism panels, and a closing takeaway panel. | Panel count and order are clear, character styling stays consistent across panels, and the mechanism is shown rather than captioned. |
| `xhs-carousel-images` | 把「租房党如何用 500 元改造厨房」做成 6 页小红书轮播，封面标题在缩略图下可读。 | A carousel cover plus inner pages sharing identical margins, title position, and footer position, with one accent colour. | The set reads as one series, each page carries one idea, and the cover title survives thumbnail downscaling. |
| `infographic-designer` | 用一张信息图说明中国咖啡连锁门店三年增长，要求带单位、时间范围和清晰阅读顺序。 | An infographic with a named layout, one reading order, visible hierarchy, and units on every number. | The layout matches the data shape, numbers carry units, and the hierarchy makes the headline claim obvious. |
| `ui-visual-mockup` | 生成一款团队协作工具的桌面端看板页面，要真实内容密度，不要紫蓝渐变和玻璃拟态。 | A desktop interface mockup with realistic content density, one accent colour, and a single clear primary action. | It reads as a real product interface, not an AI placeholder; alignment is consistent and text is legible. |
| `article-illustrator` | 为一篇讲「供应链牛鞭效应」的文章配一张图，画最难用文字说清的那个环节。 | An editorial illustration explaining the argument's hard-to-state moment, in one consistent visual language. | The image illustrates the mechanism rather than the topic noun, and stays readable at column width. |
| `cover-image-lab` | 为《2026 城市通勤报告》生成封面，标题要能在 200 像素宽下读清，并预留标题安全区。 | A cover with one focal point, one legible title treatment, and a clean reserved area for title overlay. | The cover still reads at thumbnail size and the reserved title area is visibly clean. |
| `slide-deck-visual` | 把「Q3 增长复盘」做成 6 页幻灯片视觉，标题写成结论，数据页只放一张图加一句洞察。 | Six slide visuals sharing one master layout, with claim-style titles and one chart plus one insight on the data slide. | Slides share margins and title positions, each slide carries one idea, and titles read as conclusions. |
| `diagram-flowchart` | 画一张用户注册到首次付费的流程图，决策分支必须带条件标签，连线尽量少交叉。 | A flowchart with one entry, one exit, consistent node shapes, orthogonal connectors, and labeled decision branches. | The diagram is readable at slide width, connectors are mostly crossing-free, and every decision branch is labeled. |
| `photo-organic-knit` | 把参考照片（一只橘猫坐在窗台）做成毛线针织海报，加一行毛线拼出的标题 SUNNY CAT。 | A warm ivory poster with a centered knitted-wool emblem of the cat, visible stitches and loose yarn ends, plus a yarn-strand title. | The subject reads as handmade yarn craft rather than a filter, with clear negative space around it and no plastic or vector look. |
| `photo-travel-sketch` | 把参考照片（欧洲小镇街角咖啡馆）画成针管笔旅行速写，只保留咖啡馆和一棵树。 | A loose black-line sketch on off-white paper with sparse dry marker colour and lots of blank paper. | Lines are hand-drawn and open, colour is sparse strokes rather than washes, and at least about half the paper is blank. |
| `surreal-pop-collage` | 把参考照片（在京都街头的人像）做成超现实波普拼贴，巨物元素用一只巨大的招财猫。 | A black-and-white person cut-out over large flat colour blocks, with one giant lucky cat and small graduated elements with white doodles. | The subject is monochrome, the background is flat colour fields, exactly one giant surreal element appears, and there is no text. |
| `photo-stamp-archive` | 用参考照片（雪山日出）做一张照片图章档案，标题 ALPINE DAWN。 | A landscape layout with the untouched photo on the left and a warm paper panel on the right holding a ridge-shaped ink stamp and typewriter caption. | The photo half is unchanged, the seam is straight, the stamp echoes the subject shape, and most of the paper panel stays blank. |
| `washi-tape-collage` | 把参考照片（一束郁金香）做成和纸胶带拼贴。 | Tulips rebuilt from translucent torn washi tape strips on plain paper with visible overlaps and lots of empty paper. | The image reads as physical tape collage with translucent overlaps and negative space, not a painted illustration. |
| `pulp-print-poster` | 把参考照片（骑摩托车的人）做成高彩印刷电影海报，标题 MIDNIGHT RIDE。 | A 2:3 poster with a flat saturated background, a hard-edged posterised rider, a big golden condensed title and a tiny credit block. | Only 3-4 colours are used, the title is golden condensed uppercase, and no real film or actor names appear. |
| `halftone-dot-poster` | 把参考照片（一位女生侧脸）做成双色网点印刷海报，小标题 QUIET HOURS。 | A vertical poster where the portrait is rendered from fine halftone dots in one or two inks on warm paper with a small title. | The subject is made of fine dots rather than chunky game pixels, with at most two ink colours and no neon. |
| `minimal-zine-poster` | 用参考照片（海边的一把空椅子）做一张极简纸刊海报，标题「夏日尾声」。 | A vertical paper-textured poster with a small photo-collage focal element, lots of white space, one accent colour and a delicate title. | Most of the canvas is intentional white space, only one accent colour is used, and the typography looks editorial. |
| `xiaohei-object-scenes` | 小黑费力地推着一个巨大的咖啡杯往前走，标注「周一早上」。 | A small flat black character pushing a realistic oversized coffee cup on a pure white 16:9 canvas with a short Chinese label. | The character is flat black, the object is realistic, the action is clear, the background is pure white and the label is legible Chinese. |
| `ip-mascot-logo` | 为一款记账 App 设计 IP 吉祥物 Logo，角色是一只圆滚滚的小仓鼠。 | A 1:1 icon with a simple hamster mascot made of a few big shapes, two character colours on a muted solid background, peeking from a lower corner. | The mascot is readable at icon size, uses two colours plus background, is not centred, and has no text or frame. |

## Suggested Validation Flow

1. Load each skill from the skill store with "快速加载".
2. Confirm the canvas prompt box shows the loaded skill name.
3. Submit the corresponding minimum prompt.
4. Confirm the image generation request includes the same `skillId`.
5. Confirm the generated visual matches the expected result and pass criteria.

## Notes

- Cases with `requiresReferenceImage: true` in the JSON need one low-cost reference photo attached before submitting: `image-local-edit`, `photo-organic-knit`, `photo-travel-sketch`, `surreal-pop-collage`, `photo-stamp-archive`, `washi-tape-collage`, `pulp-print-poster`, `halftone-dot-poster`, `minimal-zine-poster`.
- `image-local-edit` uses `image_edit`; the photo-art skills use `text_to_image` with the photo passed as a reference so the server skill MD is injected.
- All other cases can be tested with text-to-image only.
- Do not judge artistic taste too strictly in minimum validation; the key question is whether the skill changes the output type and structure in the intended direction.
