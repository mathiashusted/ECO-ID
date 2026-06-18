import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Groq } from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isDev = process.env.NODE_ENV === "development";

  app.use(cors());
  app.use(express.json());

  // --- Diagnostics to see which keys are populated at server runtime ---
  const keyDiagnostics = Object.keys(process.env).filter(k => 
    k.toUpperCase().includes("KEY") || 
    k.toUpperCase().includes("API") || 
    k.toUpperCase().includes("SECRET") ||
    k.toUpperCase().includes("GEMINI")
  );
  console.log("=== SERVER DIAGNOSTICS ===");
  console.log("Available key env vars:", keyDiagnostics);
  for (const k of keyDiagnostics) {
    const val = process.env[k] || "";
    console.log(`- ${k}: exists=${!!val}, length=${val.length}, startsWith=${val.slice(0, 6)}`);
  }
  console.log("==========================");

  // --- Helper to sanitize and select valid API Key representing the intent ---
  function getValidApiKey(provider: string, clientKey?: string): string | null {
    const sanitize = (val?: string) => {
      if (!val) return "";
      return val.trim().replace(/^["']|["']$/g, "").trim();
    };

    const key = sanitize(clientKey);

    const isPlaceholder = (val: string) => {
      const v = val.toLowerCase().trim();
      if (!v || v.length < 10) return true;
      
      const commonPlaceholders = [
        "placeholder",
        "your_gemini_api_key",
        "your_api_key_here",
        "your_api_key",
        "api_key",
        "gemini_api_key",
        "enter_gemini_api_key",
        "enter_api_key",
        "add_api_key",
        "add_your_api_key",
        "your_openai_api_key",
        "your_anthropic_api_key",
        "your_groq_api_key"
      ];
      
      return (
        commonPlaceholders.includes(v) || 
        v.includes("your_") || 
        v.includes("_here") ||
        v.includes("api_key")
      );
    };

    if (key && !isPlaceholder(key)) {
      return key;
    }

    // Fallback to environment keys
    if (provider === "Google Gemini") {
      const envKeyGemini = sanitize(process.env.GEMINI_API_KEY);
      if (envKeyGemini && !isPlaceholder(envKeyGemini)) {
        return envKeyGemini;
      }
      const envKeyApi = sanitize(process.env.API_KEY);
      if (envKeyApi && !isPlaceholder(envKeyApi)) {
        return envKeyApi;
      }
    } else if (provider === "OpenAI") {
      const envKey = sanitize(process.env.OPENAI_API_KEY);
      if (envKey && !isPlaceholder(envKey)) return envKey;
    } else if (provider === "Anthropic") {
      const envKey = sanitize(process.env.ANTHROPIC_API_KEY);
      if (envKey && !isPlaceholder(envKey)) return envKey;
    } else if (provider === "Groq") {
      const envKey = sanitize(process.env.GROQ_API_KEY);
      if (envKey && !isPlaceholder(envKey)) return envKey;
    }

    return null;
  }

  // --- AI Provider Endpoints ---
  app.get("/api/debug-env", (req, res) => {
    const keys = Object.keys(process.env).filter(k => 
      k.toUpperCase().includes("KEY") || 
      k.toUpperCase().includes("API") || 
      k.toUpperCase().includes("SECRET") ||
      k.toUpperCase().includes("GEMINI")
    );
    const info = keys.map(k => {
      const val = process.env[k] || "";
      return {
        key: k,
        exists: !!val,
        length: val.length,
        isPlaceholder: val.length > 0 ? (
          val.length < 10 ||
          val.toLowerCase().includes("placeholder") ||
          val.toLowerCase().includes("your_") ||
          val.toLowerCase().includes("_here") ||
          val.toLowerCase().includes("api_key")
        ) : false,
        prefix: val.slice(0, 6)
      };
    });
    res.json({ info });
  });

  app.post("/api/ai/proxy", async (req, res) => {
    const { provider, apiKey, prompt, strictDeterminism, temperature, topP } = req.body;
    const isStrict = strictDeterminism !== false;
    const tempVal = isStrict ? 0 : (temperature ?? 0);
    const topPVal = isStrict ? 0 : (topP ?? 0);

    try {
      if (provider === "Google Gemini") {
        const key = getValidApiKey("Google Gemini", apiKey);
        if (!key) {
          return res.status(400).json({ error: "Gemini API key is missing or invalid. Please configure GEMINI_API_KEY in your environment, or provide your custom API key in the app Settings." });
        }

        const isUsingFallbackKey = (key === (process.env.GEMINI_API_KEY || "").trim() || key === (process.env.API_KEY || "").trim());

        const ai = new GoogleGenAI({ apiKey: key });
        const config: any = {
          responseMimeType: "application/json",
          responseSchema: req.body.responseSchema,
        };

        if (isStrict) {
          config.temperature = 0;
          config.topP = 0;
        } else {
          config.temperature = tempVal;
          config.topP = topPVal;
        }

        // Resilient calling strategy: 
        // 1. Candidate models: start with gemini-2.5-flash, fallback to gemini-2.0-flash or gemini-1.5-flash if 503/high-demand persists
        // 2. Exponential backoff retry loop per candidate model
        const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
        const maxRetries = 3;
        let lastError: any = null;
        let response: any = null;

        for (const modelToCall of candidateModels) {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[Gemini Resiliency Engine] Calling model ${modelToCall} (Attempt ${attempt}/${maxRetries})...`);
              response = await ai.models.generateContent({
                model: modelToCall,
                contents: prompt,
                config: config,
              });
              
              if (response && response.text) {
                console.log(`[Gemini Resiliency Engine] Successfully generated content using ${modelToCall} on attempt ${attempt}.`);
                break; // Got response, exit attempt loop
              }
            } catch (error: any) {
              lastError = error;
              let errMsg = error.message || String(error);
              
              // Clean/Extract from JSON string if needed
              if (typeof errMsg === "string") {
                try {
                  const trimmed = errMsg.trim();
                  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.error && parsed.error.message) {
                      errMsg = parsed.error.message;
                    } else if (parsed.message) {
                      errMsg = parsed.message;
                    }
                  }
                } catch (e) {
                  // ignore
                }
              }

              console.warn(`[Gemini Resiliency Engine] Attempt ${attempt} failed on model ${modelToCall}:`, errMsg);

              const errLower = errMsg.toLowerCase();

              // Fail-fast immediately for unrestricted keys/invalid keys to instruct user
              const isUnrestrictedOrInvalidKey = 
                errLower.includes("unrestricted") ||
                errLower.includes("restrict your key") ||
                errLower.includes("api_key_invalid") ||
                errLower.includes("invalid key") ||
                errLower.includes("disruptions");

              if (isUnrestrictedOrInvalidKey && !isUsingFallbackKey) {
                const detailedMsg = `Google Gemini Key Restriction Required: Google is restricting unrestricted keys for Gemini API. To resolve: 
1. Visit GCP Credentials console: https://console.cloud.google.com/apis/credentials
2. Select your Gemini API key from the list.
3. Under 'API Restrictions', change from 'Don't restrict key' to 'Restrict key'.
4. Check 'Generative Language API' in the API dropdown list and Save.
5. Wait 1-2 minutes for propagation and retry! Original error was: ${errMsg}`;
                throw new Error(detailedMsg);
              }

              // Check if we hit limit: 0, which means this model is disabled or lacks quota entirely. Do not retry on this model.
              const isLimitZero = errLower.includes("limit: 0") || errLower.includes("limit: 0,");

              // Check if transient failure (503 Service Unavailable, 429 Rate Limit, exhaustion or high load)
              // Note: active unrestricted key disruption block is considered transient for the system key to allow retrying
              const isTransient = 
                !isLimitZero && (
                  errLower.includes("503") ||
                  errLower.includes("unavailable") ||
                  errLower.includes("high demand") ||
                  errLower.includes("experiencing high demand") ||
                  errLower.includes("429") ||
                  errLower.includes("resource_exhausted") ||
                  errLower.includes("rate limit") ||
                  errLower.includes("overloaded") ||
                  errLower.includes("spikes in demand") ||
                  (isUsingFallbackKey && isUnrestrictedOrInvalidKey)
                );

              if (isTransient && attempt < maxRetries) {
                // Determine sleep duration with exponential backoff + jitter
                const backoffDelay = Math.pow(2.2, attempt) * 1000 + Math.random() * 600;
                console.log(`[Gemini Resiliency Engine] Detected transient overload/error. Retrying in ${backoffDelay.toFixed(0)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
              } else {
                // Non-transient errors (like bad keys/permissions) or max attempts exhausted: switch to fallback model
                break;
              }
            }
          }
          if (response) {
            break; // Resolved, exit candidate model loop
          }
        }

        if (!response) {
          if (isUsingFallbackKey && lastError && (String(lastError).toLowerCase().includes("unrestricted") || String(lastError).toLowerCase().includes("restrict your key") || String(lastError).toLowerCase().includes("disruption"))) {
            throw new Error(`The system-provided Gemini API key is experiencing Google's temporary service disruptions for unrestricted keys in this area. Since you do not have your own key set up, please create and input a free Gemini API key under the 'API Configuration' section in the 'Setup' tab to bypass this issue seamlessly! You can get a free key instantly from Google AI Studio (https://aistudio.google.com/).`);
          }
          throw lastError || new Error("Failed after retrying across available Gemini model candidates.");
        }

        const jsonText = response.text.trim();
        return res.json(JSON.parse(jsonText));
      }
      if (provider === "OpenAI") {
        const key = getValidApiKey("OpenAI", apiKey);
        if (!key) {
          return res.status(400).json({ error: "OpenAI API key is missing or invalid. Please provide a valid key in the Settings." });
        }
        const openai = new OpenAI({ apiKey: key });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: tempVal,
          top_p: topPVal,
        });
        return res.json(JSON.parse(response.choices[0].message.content || "{}"));
      }
      if (provider === "Anthropic") {
        const key = getValidApiKey("Anthropic", apiKey);
        if (!key) {
          return res.status(400).json({ error: "Anthropic API key is missing or invalid. Please provide a valid key in the Settings." });
        }
        const anthropic = new Anthropic({ apiKey: key });
        const response = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with a valid JSON object." }],
          temperature: tempVal,
          // Anthropic doesn't allow top_p = 0. Use undefined when strict (locked is deterministic anyway with temp=0).
          top_p: isStrict ? undefined : (topPVal > 0 ? topPVal : undefined),
        });
        const content = response.content[0].type === 'text' ? response.content[0].text : "";
        return res.json(JSON.parse(content));
      }
      if (provider === "Groq") {
        const key = getValidApiKey("Groq", apiKey);
        if (!key) {
          return res.status(400).json({ error: "Groq API key is missing or invalid. Please provide a valid key in the Settings." });
        }
        const groq = new Groq({ apiKey: key });
        const response = await groq.chat.completions.create({
          model: "llama-3.1-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: tempVal,
          top_p: topPVal,
        });
        return res.json(JSON.parse(response.choices[0].message.content || "{}"));
      }
      res.status(400).json({ error: `Provider ${provider} not supported.` });
    } catch (error: any) {
      console.error(`Error in proxy for ${provider}:`, error);
      let errMsg = error.message || String(error);

      // If error message is nested JSON from Google SDK, try to parse its error detail
      if (typeof errMsg === "string") {
        try {
          const trimmed = errMsg.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const parsed = JSON.parse(trimmed);
            if (parsed.error && parsed.error.message) {
              errMsg = parsed.error.message;
            } else if (parsed.message) {
              errMsg = parsed.message;
            }
          }
        } catch (e) {
          // Ignore parse errors, fallback to raw message
        }
      }

      // Check if this is the unrestricted key API restriction error or invalid argument
      const eLower = errMsg.toLowerCase();
      if (
        eLower.includes("unrestricted") || 
        eLower.includes("restrict your key") || 
        eLower.includes("disruptions") ||
        eLower.includes("google.rpc.errorinfo") ||
        eLower.includes("api_key_invalid") ||
        eLower.includes("permission_denied")
      ) {
        errMsg = `Google Gemini Key Restriction Required: Google is restricting unrestricted keys for Gemini API. To resolve: 
1. Visit GCP Credentials console: https://console.cloud.google.com/apis/credentials
2. Select your Gemini API key from the list.
3. Under 'API Restrictions', change from 'Don't restrict key' to 'Restrict key'.
4. Check 'Generative Language API' in the API dropdown list and Save.
5. Wait 1-2 minutes for propagation and retry! Original error was: ${errMsg}`;
      }

      res.status(500).json({ error: errMsg });
    }
  });

  // --- Static Files & Vite Integration ---
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve from dist folder
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
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
