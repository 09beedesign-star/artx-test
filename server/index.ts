import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { AIOrchestrator } from "./ai-orchestrator";
import { createBrandKit, deleteBrandKit, getBrandKit, listBrandKits, parseBrandKitFromImage } from "./brand-kit";
import { editImageWithPrompt, enhanceImage, eraseImageObjects, generateImages, removeImageBackground } from "./image-generation";
import { searchReferenceImages } from "./reference-search";
import { generateText } from "./text-generation";
import { handleAuthAction } from "./auth-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
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
