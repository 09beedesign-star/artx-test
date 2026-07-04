import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import "./env";
import { AIOrchestrator } from "./ai-orchestrator";
import { createBrandKit, deleteBrandKit, getBrandKit, listBrandKits, parseBrandKitFromImage } from "./brand-kit";
import { createProductBackground, editImageWithPrompt, enhanceImage, eraseImageObjects, extractImageText, generateImages, removeImageBackground, removeImageWatermark } from "./image-generation";
import { searchReferenceImages } from "./reference-search";
import { generateText } from "./text-generation";
import { createApiKeyForAuthorization, getAdminSessionFromAuthorization, getApiKeyUserFromAuthorization, getSessionUserFromAuthorization, handleAuthAction, listApiKeysForAuthorization } from "./auth-store";
import { createBillingOrder, createCreditRechargeOrder, getBillingOrderForPayment, getBillingSnapshotForUser, handleAdminApiRequest, markBillingOrderPaid, recordBillingPaymentCreated, recordBillingPaymentFailure } from "./admin-store";
import {
  createWallytPayment,
  getClientIp,
  getWallytConfig,
  getWallytConfigStatus,
  isWallytPaymentSuccess,
  parseWallytXml,
  queryWallytOrder,
  verifyWallytSignature,
} from "./wallyt-payment";

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

type SessionUser = {
  id: string;
  username: string;
};

const backgroundImageTasks = new Map<string, BackgroundImageTask>();

function isAdminRequestHost(hostHeader: string | undefined) {
  const host = (hostHeader || "").split(":")[0]?.toLowerCase() || "";
  const configuredAdminHost = (process.env.VITE_ADMIN_HOST || "").toLowerCase();
  return Boolean(host && (host.startsWith("admin.") || (configuredAdminHost && host === configuredAdminHost)));
}

function getAdminEntryPath() {
  const token = (process.env.VITE_ADMIN_ACCESS_TOKEN || "").trim();
  const query = token ? `?admin_token=${encodeURIComponent(token)}` : "";
  return `/admin-prototype${query}`;
}

function pruneBackgroundImageTasks() {
  const now = Date.now();
  Array.from(backgroundImageTasks.entries()).forEach(([taskId, task]) => {
    if (now - task.updatedAt > 24 * 60 * 60 * 1000) {
      backgroundImageTasks.delete(taskId);
    }
  });
}

async function requireSessionUser(req: express.Request, res: express.Response): Promise<SessionUser | null> {
  const result = await getSessionUserFromAuthorization(req.headers.authorization);
  if (result.status !== 200 || !("user" in result.body)) {
    res.status(result.status).json(result.body);
    return null;
  }
  return {
    id: result.body.user.id,
    username: result.body.user.username,
  };
}

async function requireApiKeyUser(req: express.Request, res: express.Response): Promise<SessionUser | null> {
  const result = await getApiKeyUserFromAuthorization(req.headers.authorization);
  if (result.status !== 200 || !("user" in result.body)) {
    res.status(result.status).json(result.body);
    return null;
  }
  return {
    id: result.body.user.id,
    username: result.body.user.username,
  };
}

function getMcpTools() {
  return [
    {
      name: "artx_generate_image",
      description: "Use ArtX image generation to create one or more images from a text prompt.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image prompt." },
          model: { type: "string", description: "Optional model id." },
          ratio: { type: "string", description: "Aspect ratio, for example 1:1, 16:9, 9:16." },
          count: { type: "number", description: "Image count, 1-4." },
          style: { type: "string", description: "Optional style name." },
        },
        required: ["prompt"],
      },
    },
  ];
}

async function runMcpTool(name: string, args: Record<string, unknown>) {
  if (name !== "artx_generate_image") {
    return { status: 404 as const, body: { error: `Unknown MCP tool: ${name}` } };
  }
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) {
    return { status: 400 as const, body: { error: "prompt is required" } };
  }
  const result = await generateImages({
    prompt,
    model: typeof args.model === "string" ? args.model : undefined,
    ratio: typeof args.ratio === "string" ? args.ratio : "1:1",
    count: Math.max(1, Math.min(4, Number(args.count || 1))),
    style: typeof args.style === "string" ? args.style : "智能判断",
  });
  const providerMeta = result as typeof result & { providerTaskId?: string; providerTaskIds?: string[] };
  return {
    status: 200 as const,
    body: {
      content: [
        {
          type: "text",
          text: `ArtX generated ${result.images?.length || 0} image(s).`,
        },
      ],
      images: result.images || [],
      providerTaskId: providerMeta.providerTaskId,
      providerTaskIds: providerMeta.providerTaskIds,
    },
  };
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

  app.get("/", (req, res, next) => {
    if (!isAdminRequestHost(req.headers.host)) {
      next();
      return;
    }

    res.redirect(302, getAdminEntryPath());
  });

  app.post("/api/billing/wallyt/callback", express.text({ type: ["text/xml", "application/xml", "*/xml", "*/*"], limit: "1mb" }), async (req, res) => {
    try {
      const rawBody = typeof req.body === "string" ? req.body : "";
      const payload = parseWallytXml(rawBody);
      const config = getWallytConfig();
      const orderId = payload.out_trade_no || "";
      const totalFee = Number(payload.total_fee || 0);
      const signatureValid = verifyWallytSignature(payload);

      if (!rawBody || !orderId || !signatureValid || payload.mch_id !== config.mchId || !isWallytPaymentSuccess(payload)) {
        await recordBillingPaymentFailure({
          orderId,
          actorName: "wallyt",
          expectedAmountCents: Number.isFinite(totalFee) ? totalFee : undefined,
          providerTransactionId: payload.transaction_id,
          signatureValid,
          eventType: "wallyt_callback_failed",
          message: !rawBody
            ? "威富通回调为空"
            : !orderId
              ? "威富通回调缺少本地订单号"
              : !signatureValid
                ? "威富通回调验签失败"
                : payload.mch_id !== config.mchId
                  ? "威富通回调商户号不匹配"
                  : `威富通回调支付状态非成功：status=${payload.status || "-"} result_code=${payload.result_code || "-"} pay_result=${payload.pay_result || "-"}`,
        });
        res.type("text/plain").status(400).send("fail");
        return;
      }

      const order = await getBillingOrderForPayment(orderId);
      if (!order || order.amountCents !== totalFee) {
        await recordBillingPaymentFailure({
          orderId,
          actorName: "wallyt",
          expectedAmountCents: totalFee,
          providerTransactionId: payload.transaction_id,
          signatureValid,
          eventType: "wallyt_callback_amount_mismatch",
          message: !order ? "威富通回调对应本地订单不存在" : "威富通回调金额与本地订单不一致",
        });
        res.type("text/plain").status(409).send("fail");
        return;
      }

      const result = await markBillingOrderPaid({
        orderId,
        actorName: "wallyt",
        expectedAmountCents: totalFee,
        providerTransactionId: payload.transaction_id,
        eventType: "wallyt_callback",
      });

      res.type("text/plain").status(result.status === 200 ? 200 : 409).send(result.status === 200 ? "success" : "fail");
    } catch (error) {
      console.error("[wallyt] callback failed", error instanceof Error ? error.message : error);
      res.type("text/plain").status(500).send("fail");
    }
  });

  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/images/generate", async (req, res) => {
    try {
      const result = await generateImages(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed";
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
    try {
      const result = await removeImageBackground(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background removal failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/enhance", async (req, res) => {
    try {
      const result = await enhanceImage(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image enhancement failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/remove-watermark", async (req, res) => {
    try {
      const result = await removeImageWatermark(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image watermark removal failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/create-background", async (req, res) => {
    try {
      const result = await createProductBackground(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create background failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/ocr", async (req, res) => {
    try {
      const result = await extractImageText(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image OCR failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/edit", async (req, res) => {
    try {
      const result = await editImageWithPrompt(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image edit failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/erase", async (req, res) => {
    try {
      const result = await eraseImageObjects(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image erase failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/images/expand", async (req, res) => {
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
      res.json({ images: result.images || [], image_base64: result.image_base64, model: result.model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image expansion failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/llm", async (req, res) => {
    try {
      const result = await generateText(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed";
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
    try {
      const result = await orchestrator.run(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI orchestration failed";
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

  app.get("/api/developer/api-keys", async (req, res) => {
    try {
      const result = await listApiKeysForAuthorization(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "API key list failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/developer/api-keys", async (req, res) => {
    try {
      const result = await createApiKeyForAuthorization(req.headers.authorization, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "API key create failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/mcp/manifest", (_req, res) => {
    res.json({
      name: "ArtX Image MCP",
      version: "0.1.0",
      transport: "streamable-http",
      endpoint: "/api/mcp",
      tools: getMcpTools(),
    });
  });

  app.post("/api/mcp/tools/image-generate", async (req, res) => {
    try {
      const user = await requireApiKeyUser(req, res);
      if (!user) return;
      const result = await runMcpTool("artx_generate_image", req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {});
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP image generation failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/mcp", async (req, res) => {
    try {
      const id = req.body?.id ?? null;
      const method = typeof req.body?.method === "string" ? req.body.method : "";
      if (method === "initialize") {
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "ArtX Image MCP", version: "0.1.0" },
          },
        });
        return;
      }
      const user = await requireApiKeyUser(req, res);
      if (!user) return;
      if (method === "tools/list") {
        res.json({ jsonrpc: "2.0", id, result: { tools: getMcpTools() } });
        return;
      }
      if (method === "tools/call") {
        const params = req.body?.params && typeof req.body.params === "object" ? req.body.params as Record<string, unknown> : {};
        const name = typeof params.name === "string" ? params.name : "";
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
        const result = await runMcpTool(name, args);
        res.status(result.status).json(result.status === 200
          ? { jsonrpc: "2.0", id, result: result.body }
          : { jsonrpc: "2.0", id, error: { code: -32602, message: result.body.error } });
        return;
      }
      res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP request failed";
      res.status(500).json({ jsonrpc: "2.0", id: req.body?.id ?? null, error: { code: -32000, message } });
    }
  });

  app.get("/api/billing/config", (_req, res) => {
    res.json(getWallytConfigStatus());
  });

  app.get("/api/billing/summary", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const snapshot = await getBillingSnapshotForUser(user.id);
      res.json(snapshot || { balance: 0, frozenCredits: 0, expiredCredits: 0, orders: [], ledger: [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing summary failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/orders", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const paymentMethod = req.body?.paymentMethod === "alipay" ? "alipay" : "wechat";
      const result = req.body?.type === "recharge"
        ? await createCreditRechargeOrder({
          userId: user.id,
          username: user.username,
          amount: Number(req.body?.amount || 0),
          paymentMethod,
        })
        : await createBillingOrder({
          userId: user.id,
          username: user.username,
          planId: typeof req.body?.planId === "string" ? req.body.planId : "",
          cycleId: typeof req.body?.cycleId === "string" ? req.body.cycleId : "",
          paymentMethod,
        });
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing order create failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/billing/orders/:orderId/pay", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const order = await getBillingOrderForPayment(req.params.orderId);
      if (!order) {
        res.status(404).json({ error: "订单不存在" });
        return;
      }
      if (order.userId !== user.id) {
        res.status(403).json({ error: "不能支付其他用户的订单" });
        return;
      }
      if (order.status === "paid") {
        res.json({ order, paid: true });
        return;
      }

      const paymentMethod = req.body?.paymentMethod === "alipay" || order.channel === "支付宝" ? "alipay" : "wechat";
      const mode = req.body?.mode === "wap" ? "wap" : "native";
      const payment = await createWallytPayment({
        orderId: order.id,
        body: order.packageName === "积分充值" ? "ArtX 积分充值" : `ArtX ${order.packageName} 会员服务`,
        amount: order.amount,
        paymentMethod,
        mode,
        callbackUrl: typeof req.body?.callbackUrl === "string" ? req.body.callbackUrl : undefined,
        clientIp: getClientIp(req.headers, req.socket.remoteAddress),
      });

      await recordBillingPaymentCreated({
        orderId: order.id,
        actorName: "wallyt",
        providerTransactionId: payment.transactionId,
        paymentMethod,
        payUrlType: payment.payUrlType,
        service: payment.service,
      });

      res.json({ order, payment });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing payment failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/billing/orders/:orderId/status", async (req, res) => {
    try {
      const user = await requireSessionUser(req, res);
      if (!user) return;
      const order = await getBillingOrderForPayment(req.params.orderId);
      if (!order) {
        res.status(404).json({ error: "订单不存在" });
        return;
      }
      if (order.userId !== user.id) {
        res.status(403).json({ error: "不能查询其他用户的订单" });
        return;
      }

      if (order.status !== "paid") {
        const raw = await queryWallytOrder(order.id).catch((error) => ({ queryError: error instanceof Error ? error.message : "query failed" }));
        if (!("queryError" in raw) && raw.status === "0" && raw.result_code === "0" && raw.trade_state === "SUCCESS") {
          await markBillingOrderPaid({
            orderId: order.id,
            actorName: "wallyt-query",
            expectedAmountCents: Number(raw.total_fee || order.amountCents),
            providerTransactionId: raw.transaction_id,
            eventType: "wallyt_query",
          });
        } else if (!("queryError" in raw) && raw.status === "0" && raw.result_code === "0" && (raw.trade_state === "CLOSED" || raw.trade_state === "PAYERROR")) {
          await recordBillingPaymentFailure({
            orderId: order.id,
            actorName: "wallyt-query",
            expectedAmountCents: Number(raw.total_fee || order.amountCents),
            providerTransactionId: raw.transaction_id,
            signatureValid: true,
            eventType: "wallyt_query_failed",
            message: `威富通查询返回交易异常：${raw.trade_state}`,
          });
        }
      }

      const latest = await getBillingOrderForPayment(order.id);
      res.json({ order: latest || order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing status failed";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/admin/session", async (req, res) => {
    try {
      const result = await getAdminSessionFromAuthorization(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin session check failed";
      res.status(500).json({ error: message });
    }
  });

  app.all("/api/admin/*", async (req, res) => {
    try {
      const result = await handleAdminApiRequest(req.method, req.path.replace(/^\/api\/admin\/?/, ""), req.headers.authorization, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin API request failed";
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
