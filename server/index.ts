import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { eraseImageObjects, generateImages, removeImageBackground } from "./image-generation";
import { generateText } from "./text-generation";
import { handleAuthAction } from "./auth-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https:\/\/09beedesign-star\.github\.io$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

  app.post("/api/images/erase", async (req, res) => {
    try {
      const result = await eraseImageObjects(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image erase failed";
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

  app.post("/api/auth/:action", async (req, res) => {
    try {
      const action = req.params.action as "register" | "login" | "me" | "logout";
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
