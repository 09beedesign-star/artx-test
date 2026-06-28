import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { type AiBillingCapability } from "../shared/ai-credit-policy";
import { AIOrchestrator } from "./ai-orchestrator";
import { createBrandKit, deleteBrandKit, getBrandKit, listBrandKits, parseBrandKitFromImage } from "./brand-kit";
import { createProductBackground, editImageWithPrompt, enhanceImage, eraseImageObjects, extractImageText, generateImages, removeImageBackground, removeImageWatermark } from "./image-generation";
import { searchReferenceImages } from "./reference-search";
import { generateText } from "./text-generation";
import { getSessionUserFromAuthorization, handleAuthAction } from "./auth-store";
import { createBillingOrder, getBillingSnapshotForUser, handleAdminApiRequest, markBillingOrderPaid, quoteAdminAiUsage, recordAiUsage } from "./admin-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BackgroundImageTask = {
  taskId: string;
  status: "pending" | "completed" | "failed";
  input: Record<string, unknown>;
  images?: Array<{ src: string; width: number; height: number }>;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

async function attachAiUsageRecord(
  authorization: unknown,
  input: {
    capability: string;
    capabilityKey?: AiBillingCapability;
    model: string;
    provider?: string;
    generationId?: string;
    backendTaskId?: string;
    providerTaskId?: string;
    providerTaskIds?: string[];
    status: "success" | "failed" | "timeout" | "queued" | "processing" | "recoverable";
    latencyMs?: number;
    failureReason?: string;
    inputUnits?: number;
    outputUnits?: number;
    estimatedCost?: number;
    chargedCredits?: number;
  },
) {
  const session = await getSessionUserFromAuthorization(authorization);
  if (session.status !== 200) return;
  await recordAiUsage({
    userId: session.body.user.id,
    username: session.body.user.username,
    capability: input.capability,
    capabilityKey: input.capabilityKey,
    provider: input.provider || "OpenAI",
    model: input.model,
    generationId: input.generationId,
    backendTaskId: input.backendTaskId,
    providerTaskId: input.providerTaskId,
    providerTaskIds: input.providerTaskIds,
    status: input.status,
    latencyMs: input.latencyMs,
    failureReason: input.failureReason,
    inputUnits: input.inputUnits,
    outputUnits: input.outputUnits,
    estimatedCost: input.estimatedCost,
    chargedCredits: input.chargedCredits,
  });
}

async function buildAiUsageQuote(capability: AiBillingCapability, outputCount = 1) {
  const { policy, chargedCredits, estimatedCost } = await quoteAdminAiUsage({ capability, outputCount });
  return {
    provider: policy.providerDefault,
    chargedCredits,
    estimatedCost,
  };
}

function toBillingCapability(capability: string): AiBillingCapability {
  if (capability === "chat" || capability === "brand_kit_parse") return "text_generation";
  if (capability === "element_erasure") return "image_erase";
  if (capability === "image_expansion") return "image_expansion";
  if (capability === "background_removal") return "background_removal";
  if (capability === "image_edit") return "image_edit";
  if (capability === "text_to_image") return "text_to_image";
  return "text_generation";
}

function labelBillingCapability(capability: AiBillingCapability) {
  const labels: Record<AiBillingCapability, string> = {
    text_generation: "文案生成",
    text_to_image: "文生图",
    background_removal: "去背景",
    image_enhance: "高清图片生成",
    watermark_removal: "去水印",
    smart_background: "智能背景",
    image_edit: "图片编辑",
    image_erase: "AI 擦除",
    image_expansion: "AI 扩图",
    image_ocr: "图片 OCR",
  };
  return labels[capability];
}

const backgroundImageTasks = new Map<string, BackgroundImageTask>();

function pruneBackgroundImageTasks() {
  const now = Date.now();
  Array.from(backgroundImageTasks.entries()).forEach(([taskId, task]) => {
    if (now - task.updatedAt > 24 * 60 * 60 * 1000) {
      backgroundImageTasks.delete(taskId);
    }
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const orchestrator = new AIOrchestrator();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https:\/\/09beedesign-star\.github\.io$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, eraserTaskIdContract: true });
  });

  app.post("/api/images/generate", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await generateImages(req.body);
      const usage = await buildAiUsageQuote("text_to_image", result.images.length);
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "文生图",
        capabilityKey: "text_to_image",
        provider: usage.provider,
        model: String(req.body?.model || "gpt-image-2"),
        generationId: typeof req.body?.generationId === "string" ? req.body.generationId : undefined,
        backendTaskId: typeof req.body?.generationId === "string" ? req.body.generationId : undefined,
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "文生图",
        capabilityKey: "text_to_image",
        provider: "OpenAI",
        model: String(req.body?.model || "gpt-image-2"),
        generationId: typeof req.body?.generationId === "string" ? req.body.generationId : undefined,
        backendTaskId: typeof req.body?.generationId === "string" ? req.body.generationId : undefined,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/tasks", async (req, res) => {
    const taskId = typeof req.body?.taskId === "string" && req.body.taskId.trim()
      ? req.body.taskId.trim()
      : `image-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pruneBackgroundImageTasks();
    const existing = backgroundImageTasks.get(taskId);
    if (existing) {
      res.json(existing);
      return;
    }

    const task: BackgroundImageTask = {
      taskId,
      status: "pending",
      input: req.body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    backgroundImageTasks.set(taskId, task);
    res.json(task);

    void generateImages(req.body)
      .then(result => {
        backgroundImageTasks.set(taskId, {
          ...task,
          status: "completed",
          images: result.images,
          updatedAt: Date.now(),
        });
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : "Image generation failed";
        backgroundImageTasks.set(taskId, {
          ...task,
          status: "failed",
          error: message,
          updatedAt: Date.now(),
        });
      });
  });

  app.get("/api/images/tasks/:taskId", (req, res) => {
    pruneBackgroundImageTasks();
    const task = backgroundImageTasks.get(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Image task not found", taskId: req.params.taskId, status: "failed" });
      return;
    }
    res.json(task);
  });

  app.post("/api/images/remove-background", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await removeImageBackground(req.body);
      const usage = await buildAiUsageQuote("background_removal");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "去背景",
        capabilityKey: "background_removal",
        provider: usage.provider,
        model: String(req.body?.model || "gpt-image-2"),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background removal failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "去背景",
        capabilityKey: "background_removal",
        provider: "PicWish/佐糖",
        model: String(req.body?.model || "gpt-image-2"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/enhance", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await enhanceImage(req.body);
      const usage = await buildAiUsageQuote("image_enhance");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "高清图片生成",
        capabilityKey: "image_enhance",
        provider: usage.provider,
        model: String(req.body?.model || "picwish-enhance"),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image enhancement failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "高清图片生成",
        capabilityKey: "image_enhance",
        provider: "PicWish/佐糖",
        model: String(req.body?.model || "picwish-enhance"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/remove-watermark", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await removeImageWatermark(req.body);
      const usage = await buildAiUsageQuote("watermark_removal");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "去水印",
        capabilityKey: "watermark_removal",
        provider: usage.provider,
        model: "picwish-watermark",
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image watermark removal failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "去水印",
        capabilityKey: "watermark_removal",
        provider: "PicWish/佐糖",
        model: "picwish-watermark",
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/create-background", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await createProductBackground(req.body);
      const usage = await buildAiUsageQuote("smart_background");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "智能背景",
        capabilityKey: "smart_background",
        provider: usage.provider,
        model: String(req.body?.model || "visual-background"),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create background failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "智能背景",
        capabilityKey: "smart_background",
        provider: "PicWish/佐糖",
        model: String(req.body?.model || "visual-background"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/ocr", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await extractImageText(req.body);
      const usage = await buildAiUsageQuote("image_ocr");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "图片 OCR",
        capabilityKey: "image_ocr",
        provider: result.provider || usage.provider,
        model: String(req.body?.model || "vision-chat-ocr"),
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: 1,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image OCR failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "图片 OCR",
        capabilityKey: "image_ocr",
        provider: "OpenAI",
        model: String(req.body?.model || "vision-chat-ocr"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/edit", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await editImageWithPrompt(req.body);
      const usage = await buildAiUsageQuote("image_edit");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "图片编辑",
        capabilityKey: "image_edit",
        provider: usage.provider,
        model: String(req.body?.model || "gpt-image-2"),
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image edit failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "图片编辑",
        capabilityKey: "image_edit",
        provider: "OpenAI",
        model: String(req.body?.model || "gpt-image-2"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/erase", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await eraseImageObjects(req.body);
      const usage = await buildAiUsageQuote("image_erase");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "AI 擦除",
        capabilityKey: "image_erase",
        provider: usage.provider,
        model: String(req.body?.model || "gpt-image-2"),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: result.images.length,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image erase failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "AI 擦除",
        capabilityKey: "image_erase",
        provider: "PicWish/佐糖",
        model: String(req.body?.model || "gpt-image-2"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/expand", async (req, res) => {
    const startedAt = Date.now();
    try {
      const imageSrc = req.body?.imageSrc || req.body?.image_url || req.body?.image_base64;
      const maskSrc = req.body?.maskSrc || req.body?.mask_url || req.body?.mask_base64;
      const result = await orchestrator.run({
        ...req.body,
        capability: "image_expansion",
        imageSrc,
        maskSrc,
        prompt: req.body?.prompt || "Extend the image naturally only inside the masked blank area. Preserve all unmasked pixels exactly and never generate beyond the requested boundary.",
      });
      const outputCount = result.images?.length || (result.image_base64 ? 1 : 1);
      const usage = await buildAiUsageQuote("image_expansion", outputCount);
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "AI 扩图",
        capabilityKey: "image_expansion",
        provider: usage.provider,
        model: result.model,
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: outputCount,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json({ images: result.images || [], image_base64: result.image_base64, model: result.model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image expansion failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "AI 扩图",
        capabilityKey: "image_expansion",
        provider: "OpenAI",
        model: String(req.body?.model || "gpt-image-2"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/llm", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await generateText(req.body);
      const usage = await buildAiUsageQuote("text_generation");
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "文案生成",
        capabilityKey: "text_generation",
        provider: usage.provider,
        model: result.model,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: 1,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed";
      await attachAiUsageRecord(req.headers.authorization, {
        capability: "文案生成",
        capabilityKey: "text_generation",
        provider: "OpenAI",
        model: String(req.body?.model || "gpt-5.4-mini"),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/references/search", async (req, res) => {
    try {
      const query = typeof req.body?.query === "string" ? req.body.query : "";
      const limit = typeof req.body?.limit === "number" ? req.body.limit : 10;
      const result = await searchReferenceImages(query, limit);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reference search failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/ai/orchestrate", async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await orchestrator.run(req.body);
      const billingCapability = toBillingCapability(result.capability);
      const outputCount = result.images?.length || (result.image_base64 ? 1 : 1);
      const usage = await buildAiUsageQuote(billingCapability, outputCount);
      await attachAiUsageRecord(req.headers.authorization, {
        capability: labelBillingCapability(billingCapability),
        capabilityKey: billingCapability,
        provider: result.route === "text" ? "OpenAI" : usage.provider,
        model: result.model,
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        status: "success",
        latencyMs: Date.now() - startedAt,
        inputUnits: 1,
        outputUnits: outputCount,
        estimatedCost: usage.estimatedCost,
        chargedCredits: usage.chargedCredits,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI orchestration failed";
      const billingCapability = toBillingCapability(String(req.body?.capability || req.body?.intent || req.body?.operation || ""));
      await attachAiUsageRecord(req.headers.authorization, {
        capability: labelBillingCapability(billingCapability),
        capabilityKey: billingCapability,
        provider: "OpenAI",
        model: String(req.body?.model || (billingCapability === "text_generation" ? "gpt-5.4-mini" : "gpt-image-2")),
        status: "failed",
        latencyMs: Date.now() - startedAt,
        failureReason: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/brand-kits", async (_req, res) => {
    try {
      const kits = await listBrandKits();
      res.json({ kits });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit list failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/brand-kits", async (req, res) => {
    try {
      const kit = await createBrandKit(req.body);
      res.json({ kit });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit save failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/brand-kits/:id", async (req, res) => {
    try {
      const kit = await getBrandKit(req.params.id);
      if (!kit) {
        res.status(404).json({ error: "Brand kit not found" });
        return;
      }
      res.json({ kit });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit read failed";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/brand-kits/:id", async (req, res) => {
    try {
      const deleted = await deleteBrandKit(req.params.id);
      res.json({ deleted });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit delete failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/brand-kits/parse", async (req, res) => {
    try {
      const imageSrc = req.body?.imageSrc || req.body?.image_url || (
        req.body?.image_base64 ? `data:image/png;base64,${req.body.image_base64}` : ""
      );
      if (!imageSrc) {
        res.status(400).json({ error: "Missing image" });
        return;
      }
      const kit = await parseBrandKitFromImage(imageSrc, generateText);
      res.json({ kit });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brand kit parse failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/auth/:action", async (req, res) => {
    try {
      const action = req.params.action as "register" | "login" | "me" | "logout" | "social";
      const result = await handleAuthAction(action, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth request failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/billing/summary", async (req, res) => {
    try {
      const session = await getSessionUserFromAuthorization(req.headers.authorization);
      if (session.status !== 200) {
        res.status(session.status).json(session.body);
        return;
      }
      const snapshot = await getBillingSnapshotForUser(session.body.user.id);
      if (!snapshot) {
        res.status(404).json({ error: "账本账户不存在" });
        return;
      }
      res.json(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing summary failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/orders", async (req, res) => {
    try {
      const session = await getSessionUserFromAuthorization(req.headers.authorization);
      if (session.status !== 200) {
        res.status(session.status).json(session.body);
        return;
      }
      const result = await createBillingOrder({
        userId: session.body.user.id,
        username: session.body.user.username,
        planId: String(req.body?.planId || ""),
        cycleId: String(req.body?.cycleId || ""),
        paymentMethod: req.body?.paymentMethod === "alipay" ? "alipay" : "wechat",
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing order creation failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/orders/:orderId/pay", async (req, res) => {
    try {
      const session = await getSessionUserFromAuthorization(req.headers.authorization);
      if (session.status !== 200) {
        res.status(session.status).json(session.body);
        return;
      }
      const result = await markBillingOrderPaid({
        orderId: req.params.orderId,
        actorName: `${session.body.user.username} / 模拟支付`,
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing order payment failed";
      res.status(500).json({ error: message });
    }
  });

  app.all("/api/admin/*", async (req, res) => {
    try {
      const result = await handleAdminApiRequest(req.method, req.path, req.headers.authorization, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin request failed";
      res.status(500).json({ error: message });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
