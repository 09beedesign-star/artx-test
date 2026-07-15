# Smart Product Composite Design

## Goal

Generate ecommerce product images that preserve the uploaded product pixels while adapting the generated background to the selected platform, market, template, user prompt, and optional background reference image.

## Scope

- Applies only to `createProductBackground` and its background-task route.
- Keeps existing platform/market/template composition, output sizes, 1-9 image count, and canvas placement.
- Does not change eraser, expansion, background removal, HD, watermark removal, or general image generation.

## Pipeline

1. Use PicWish segmentation to create one transparent product cutout and alpha mask.
2. Generate background-only plates with Gemini from the background reference image, commerce context, user prompt, and selected output size. The prompt reserves the product placement area and forbids products in the plate.
3. Composite the unchanged PicWish cutout onto every background plate at a stable bottom anchor.
4. Use Sharp to add a soft floor-contact shadow beneath the cutout. The product alpha region and RGB pixels remain unchanged.
5. Normalize each output to the requested dimensions. Reject and retry only the background/fusion stage when no product is visible, the output is invalid, or the protected subject pixels cannot be retained.

## Fallbacks

- If background-reference generation fails, use PicWish `r-background` directly from the uploaded product and the composed commerce prompt.
- If compositing cannot produce a valid image, return the PicWish `r-background` result rather than a result that has redrawn the product.

## Verification

- Unit tests cover PicWish-first subject protection, background-reference routing, protected fusion, output count, and 2K/4K normalization.
- Focused regression covers smart product task recovery and existing commerce context persistence.
