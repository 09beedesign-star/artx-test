# MEMORY

## Project

- Project name: New project 2
- Date initialized: 2026-06-20
- Visible stack: Vite/TypeScript web app with client, server, shared, pnpm, Render config, and GitHub Pages-style static build artifacts.

## Working Notes

- Follow `AGENTS.md` for ArtX test release workflow before any test environment publishing.
- Log lookup rule: when the user says "查看日志" in this workspace, read `docs/dev-log.md` by default.
- Development log rule: when the user says "添加日志", "记一下日志", or asks to log a task, append the record to `docs/dev-log.md` using the established template; AI-related records must include `generationId`, `backendTaskId`, and `providerTaskId` or explicitly mark missing IDs as `N/A`.
- Credential values are not stored here; only credential locations may be recorded if needed.
- Product model: users pay for compute, compute is converted into platform credits/points, and admin tooling should track feedback, payments, accounts, and quota/credit operations.
- Admin prototype should include a top-right notification center for urgent operations such as payment exceptions, runtime errors, integration latency, and credit/risk events.
- Admin backend is connected at `/admin-prototype`, but it must not be exposed in the main website navigation; production access should use an independent admin subdomain such as `admin.*` or `VITE_ADMIN_HOST`.
- Formal admin access uses role-based permissions: ordinary users are `viewer`, default `09bee` is `super_admin`, and admin routes require `admin:access` instead of only checking login.
- Canvas persistence rule: real user projects use `canvas-*` IDs and must keep the latest edited nodes/edges in local storage; non-real test canvas states can be reset without touching user projects.
- Image generation recovery rule: text-to-image tasks with a `generationId` are also started on the backend `/api/images/tasks` background endpoint, so closing the browser can still recover completed or failed results when the user returns.
- Canvas assistant composer rule: image reference chips and annotation reference chips are ordered prompt segments; drag reordering must preserve the same order in both displayed prompt text and the reference image array sent to AI.
- Eraser AI rule: canvas eraser strokes call PicWish/佐糖 image object removal through `server/image-generation.ts#eraseWithPicWish`, using the official remove-objects `POST /api/tasks/visual/watermark` and `GET /api/tasks/visual/watermark/{task_id}` flow. It supports `sync=0` and `sync=1`, `image_file` or `image_url`, `mask_file` or `mask_url` or `rectangles`, provider task ID tracing, frontend transparent-hole masks, and white-remove/black-protect masks matching PicWish masked removal.
- Eraser isolation rule: the eraser path must not use local blur fallback, old masked compositing, or old result-guessing heuristics. If PicWish inpaint fails or returns no image, surface the failure instead of fabricating a blurred result; do not change outpaint, annotation, smart background, HD, layer editing, watermark, or background-removal paths when tuning eraser.
- PicWish logging rule: all PicWish/佐糖 calls must log server-side `[picwish]` JSON events for request, created task, polling, success, failure, and result download. Logs may include task type, endpoint, taskId, state, progress, duration, dimensions, and errors, but must never include API key values.
- PicWish response ID rule: all successful PicWish/佐糖 image capabilities must include provider task IDs in API responses as `providerTaskId` and, when multiple PicWish tasks are involved, `providerTaskIds`, so browser-side verification and `docs/dev-log.md` can trace each call without relying only on Render logs.
- Watermark removal rule: the image toolbar `去水印` command calls `client/src/lib/ai.ts#removeImageWatermark`, `POST /api/images/remove-watermark`, and PicWish/佐糖 `watermark` visual task; it must stay separate from eraser `inpaint`.
- Gemini image model rule: selectable Gemini/Nano Banana image models are exposed through `IMAGE_AI_MODELS` and routed as chat-compatible image models in `server/image-generation.ts`, so they avoid the unsupported Images API path.
- BKEEL image generation rule: `https://token.bkeel.com/v1/images/generations` returns an async `task_id`; image generation must poll the task result instead of expecting a synchronous `data[0].b64_json` response.
- Font design dialog layout rule: the panel must sit horizontally centered under the top canvas toolbar with 16px visual spacing, avoid horizontal scrolling, keep all style category labels/descriptions visible, keep every category preview image visible as a real proportional card instead of thin strips, and fit common browser heights with vertical-only internal scrolling.
- AI client routing rule: GitHub Pages builds must never send AI requests back to the Pages frontend; `client/src/lib/ai.ts` falls back to `https://artx-test.onrender.com`, and text-to-image requests with `generationId` should fall back to direct orchestration if the background task endpoint returns HTML/non-JSON.
- Smart background dialog layout rule: the panel must sit horizontally centered under the top canvas toolbar with 16px visual spacing, may use a wider content-led width, must keep upload, style, prompt, ratio, resolution, custom size, cancel, and create controls visible through vertical-only internal scrolling, and must not overflow the browser viewport.
- Smart background output rule: when product image, background reference image, prompt, ratio, and resolution/custom size are provided together, the reference image is only a style/lighting/material/background guide; the prompt still controls the specific requirements, and the returned bitmap must be normalized to the selected output size/aspect ratio with no black bars or empty gutters.
- AI image regenerate rule: AI-generated image nodes expose a 60px green hover button labeled `再次生成`; successful nodes rerun into a new nearby image node, while failed nodes retry in place using the original prompt/model/ratio metadata.
