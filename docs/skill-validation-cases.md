# Skill Validation Cases

This document defines the minimum-cost validation prompts for the 8 ArtX skill MD files.
The validation branch should use these cases to confirm every skill can produce a corresponding visual result on canvas.

| Skill ID | Minimum Prompt | Expected Visual Result | Pass Criteria |
| --- | --- | --- | --- |
| `brand-system-kit` | 为一家面向年轻设计师的 AI 灵感工具生成品牌系统，风格清爽、专业、有一点未来感。 | A brand system board with palette, typography mood, logo zone, graphic language, and multiple application examples. | The output is visibly a brand kit, not a single poster; it contains several organized brand-system areas. |
| `logo-identity-lab` | 为一家名叫 Ember Cafe 的精品咖啡品牌探索 Logo，关键词是温暖、手作、城市通勤。 | A logo exploration sheet with multiple logo directions such as symbol, wordmark, badge, and recommended option. | At least 4 distinct logo concepts are visible and inspectable; marks are simple and not copied from famous brands. |
| `landing-page-visual` | 为一款 AI 图片协作工具生成产品官网首屏，突出多人协作、画布生成和快速出图。 | A website hero or landing page visual with product signal, CTA, feature modules, and responsive UI feel. | The output reads as a real web/product page, with clear hierarchy and UI layout rather than a generic poster. |
| `commerce-poster-social` | 为夏季运动水杯做一张电商活动海报，主打冰感、防漏、限时 8 折，适合社媒投放。 | A commercial poster/social visual with product hero, headline zone, offer, CTA, and brand placement. | Product is prominent, campaign hierarchy is clear, and text zones are readable. |
| `product-photography` | 生成一张高端无线耳机的商品摄影图，哑光黑材质，暗色背景，边缘冷光，适合新品发布。 | A polished product photography or commercial render with clear product subject, material, light, surface, and shadow. | The product remains inspectable, centered or intentionally composed, with realistic lighting and material cues. |
| `video-storyboard` | 为一款智能台灯做 15 秒短视频分镜，开头强调深夜工作，结尾展示自动调光。 | A storyboard board with multiple sequential frames, hook, product reveal, benefit moment, and ending CTA. | Several frames appear in sequence with captions or shot notes; the result is not a single unrelated image. |
| `image-local-edit` | 把这张图片里的背景换成干净的白色电商背景，并保持主体不变。 | An image edit result that preserves the subject while changing or cleaning the background. | Subject identity, proportions, and important details are preserved; background is cleaner and commercially usable. |
| `visual-reference-audit` | 分析这个参考方向并生成一个更高级、更干净的版本，要求层级清楚、留白更好、视觉更统一。 | An improved visual direction that reflects analysis: better hierarchy, alignment, contrast, spacing, and style consistency. | The output visibly improves organization and quality rather than only producing a text report. |

## Suggested Validation Flow

1. Load each skill from the skill store with "快速加载".
2. Confirm the canvas prompt box shows the loaded skill name.
3. Submit the corresponding minimum prompt.
4. Confirm the image generation request includes the same `skillId`.
5. Confirm the generated visual matches the expected result and pass criteria.

## Notes

- The `image-local-edit` case requires one low-cost reference image because it uses `image_edit`.
- The other 7 cases can be tested with text-to-image only.
- Do not judge artistic taste too strictly in minimum validation; the key question is whether the skill changes the output type and structure in the intended direction.
