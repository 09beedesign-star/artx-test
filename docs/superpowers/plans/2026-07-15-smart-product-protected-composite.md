# Smart Product Protected Composite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep uploaded product pixels intact while generating market-aware, background-reference-aware ecommerce scenes.

**Architecture:** PicWish segmentation supplies one reusable transparent product cutout. Image2 generates background-only plates using the commerce context and optional background reference; Gemini retries the same background-only request only when Image2 fails or returns no images. Sharp composites the unchanged cutout over each plate and adds an alpha-derived contact shadow. PicWish `r-background` remains the final fallback when both background models fail.

**Tech Stack:** TypeScript, Sharp, PicWish visual APIs, Gemini chat-compatible image API, Vitest.

---

### Task 1: Protect the product cutout

**Files:**
- Modify: `server/image-generation.ts`
- Test: `server/image-generation.smart-product.test.ts`

- [ ] **Step 1: Write a failing test**

```ts
expect(source).toContain("removeBackgroundPreservingForegroundPixels(input.imageSrc)");
expect(source).toContain("const protectedProduct = cutout.images[0]");
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run server/image-generation.smart-product.test.ts`

- [ ] **Step 3: Add the cutout once before output batching**

```ts
const cutout = await removeBackgroundPreservingForegroundPixels(input.imageSrc);
const protectedProduct = cutout.images[0];
if (!protectedProduct) throw new Error("PicWish did not return a product cutout");
```

- [ ] **Step 4: Re-run the test and verify it passes**

Run: `pnpm exec vitest run server/image-generation.smart-product.test.ts`

### Task 2: Generate background-only plates

**Files:**
- Modify: `server/image-generation.ts`
- Test: `server/image-generation.smart-product.test.ts`

- [ ] **Step 1: Write a failing test**

```ts
expect(source).toContain("Generate the empty ecommerce background plate only");
expect(source).toContain("backgroundReferenceSrc");
expect(source).toContain('model: "gpt-image-2"');
expect(source).toContain('model: "gemini-3.1-flash-image"');
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run server/image-generation.smart-product.test.ts`

- [ ] **Step 3: Generate backgrounds in batches of four**

```ts
const backgroundPrompt = [
  input.prompt || "创建商业化产品背景",
  "Generate the empty ecommerce background plate only. Do not include any product, person, packaging, logo, or foreground object.",
  "Reserve a grounded central placement area with matching floor perspective and contact-shadow space.",
].join("\n");
const backgrounds = await generateImages({
  prompt: backgroundPrompt,
  model: "gpt-image-2",
  ratio: input.ratio || "1:1",
  count: batchCount,
  images: input.backgroundReferenceSrc ? [{ src: input.backgroundReferenceSrc, title: "background reference" }] : [],
});
const resolvedBackgrounds = backgrounds.images.length > 0 ? backgrounds : await generateImages({
  prompt: backgroundPrompt,
  model: "gemini-3.1-flash-image",
  ratio: input.ratio || "1:1",
  count: batchCount,
  images: input.backgroundReferenceSrc ? [{ src: input.backgroundReferenceSrc, title: "background reference" }] : [],
});
```

- [ ] **Step 4: Re-run the test and verify it passes**

Run: `pnpm exec vitest run server/image-generation.smart-product.test.ts`

### Task 3: Composite and blend without changing product pixels

**Files:**
- Modify: `server/image-generation.ts`
- Test: `server/image-generation.smart-product.test.ts`

- [ ] **Step 1: Write a failing test**

```ts
expect(source).toContain("compositeProtectedProductOnBackground");
expect(source).toContain("createProductContactShadow");
expect(source).toContain("return { images: composites }");
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run server/image-generation.smart-product.test.ts`

- [ ] **Step 3: Add server-local helpers**

```ts
async function compositeProtectedProductOnBackground(background: GeneratedImage, product: GeneratedImage, width: number, height: number) {
  const sharp = (await import("sharp")).default;
  const backgroundBuffer = (await imageSrcToBuffer(background.src)).buffer;
  const productBuffer = (await imageSrcToBuffer(product.src)).buffer;
  const product = await sharp(productBuffer).trim().resize({ width: Math.round(width * 0.72), height: Math.round(height * 0.7), fit: "inside" }).png().toBuffer();
  const metadata = await sharp(product).metadata();
  const left = Math.round((width - (metadata.width || 1)) / 2);
  const top = height - (metadata.height || 1);
  const shadow = await createProductContactShadow(width, height, left, top, metadata.width || 1, metadata.height || 1);
  const png = await sharp(backgroundBuffer).resize(width, height, { fit: "cover" })
    .composite([{ input: shadow, left: 0, top: 0 }, { input: product, left, top }]).png().toBuffer();
  return { src: `data:image/png;base64,${png.toString("base64")}`, width, height };
}

async function createProductContactShadow(width: number, height: number, left: number, top: number, productWidth: number, productHeight: number) {
  const sharp = (await import("sharp")).default;
  const pixels = Buffer.alloc(width * height * 4);
  const centerX = left + productWidth / 2;
  const centerY = Math.min(height - 4, top + productHeight - 4);
  const radiusX = Math.max(12, productWidth * 0.34);
  const radiusY = Math.max(5, productHeight * 0.035);
  for (let y = Math.max(0, Math.floor(centerY - radiusY)); y <= Math.min(height - 1, Math.ceil(centerY + radiusY)); y += 1) for (let x = Math.max(0, Math.floor(centerX - radiusX)); x <= Math.min(width - 1, Math.ceil(centerX + radiusX)); x += 1) {
    const distance = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
    if (distance <= 1) pixels[(y * width + x) * 4 + 3] = Math.round(72 * (1 - distance));
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).blur(8).png().toBuffer();
}
```

- [ ] **Step 4: Keep product pixels untouched and use the direct composite if shadow rendering fails**

```ts
try {
  return await compositeProtectedProductOnBackground(background, protectedProduct, output.width, output.height);
} catch {
  return createBackgroundWithPicWish(input);
}
```

- [ ] **Step 5: Re-run the test and verify it passes**

Run: `pnpm exec vitest run server/image-generation.smart-product.test.ts`

### Task 4: Preserve fallback and task metadata

**Files:**
- Modify: `server/image-generation.ts`, `server/index.ts`, `MEMORY.md`
- Test: `server/background-image-tasks.test.ts`, `server/image-generation.smart-product.test.ts`

- [ ] **Step 1: Write failing route assertions**

```ts
expect(source).toContain("Image2 background plate failed; retrying with Gemini");
expect(source).toContain("Image2 and Gemini background plates failed; using PicWish smart product background fallback");
expect(source).toContain('provider: "PicWish 主体保护 + Image2/Gemini 背景"');
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm exec vitest run server/background-image-tasks.test.ts server/image-generation.smart-product.test.ts`

- [ ] **Step 3: Record the hybrid route and keep `createBackgroundWithPicWish` as the background-generation failure fallback**

```ts
catch (backgroundError) {
  console.warn("Image2 and Gemini background plates failed; using PicWish smart product background fallback", backgroundError);
  return createBackgroundWithPicWish(input);
}
```

- [ ] **Step 4: Update the smart product memory rule and pass focused tests**

Run: `pnpm exec vitest run server/background-image-tasks.test.ts server/image-generation.smart-product.test.ts`

### Task 5: Regression verification

**Files:**
- Test: `server/image-generation.test.ts`, `server/image-generation.smart-product.test.ts`, `server/background-image-tasks.test.ts`, `client/src/components/canvas/InfiniteCanvas.prompt-controls.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec vitest run server/image-generation.test.ts server/image-generation.smart-product.test.ts server/background-image-tasks.test.ts client/src/components/canvas/InfiniteCanvas.prompt-controls.test.ts`

- [ ] **Step 2: Run static type checking and production build**

Run: `pnpm check && pnpm build`

- [ ] **Step 3: Review task-scoped diff and commit**

Run: `git diff --check && git diff --stat`
