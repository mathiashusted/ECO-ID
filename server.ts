import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Groq } from "groq-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isDev = process.env.NODE_ENV === "development";

  app.use(cors());
  app.use(express.json());

  // --- AI Provider Endpoints ---
  app.post("/api/ai/proxy", async (req, res) => {
    const { provider, apiKey, prompt } = req.body;
    try {
      if (provider === "OpenAI") {
        const openai = new OpenAI({ apiKey });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });
        return res.json(JSON.parse(response.choices[0].message.content || "{}"));
      }
      if (provider === "Anthropic") {
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with a valid JSON object." }],
        });
        const content = response.content[0].type === 'text' ? response.content[0].text : "";
        return res.json(JSON.parse(content));
      }
      if (provider === "Groq") {
        const groq = new Groq({ apiKey });
        const response = await groq.chat.completions.create({
          model: "llama-3.1-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });
        return res.json(JSON.parse(response.choices[0].message.content || "{}"));
      }
      res.status(400).json({ error: `Provider ${provider} not supported.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // --- Ollama Utility Endpoint ---
  app.post("/api/ollama/hello", async (req, res) => {
    const model = req.body?.model || "qwen3.6";
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

    try {
      const ollamaResponse = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: "Hello world",
          stream: false,
        }),
      });

      if (!ollamaResponse.ok) {
        const text = await ollamaResponse.text();
        return res.status(502).json({
          error: `Ollama request failed (${ollamaResponse.status}): ${text}`,
        });
      }

      const data = await ollamaResponse.json() as { response?: string };
      return res.json({
        model,
        prompt: "Hello world",
        response: data.response || "",
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || "Failed to contact Ollama",
      });
    }
  });

  // --- Static Files & Vite Integration ---
  if (isDev) {
    const vite = await createViteServer({
      configLoader: "native",
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve from dist folder
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running in ${isDev ? 'development' : 'production'} mode on port ${PORT}`);
  });
}

// START SERVER - REQUIRED FOR RENDER
startServer().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
