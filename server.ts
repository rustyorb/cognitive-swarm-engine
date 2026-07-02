import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"], quiet: true });

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const MODEL_LIST_TIMEOUT_MS = 15_000;
const GENERATION_TIMEOUT_MS = 300_000;
// Generous output budget so long, multi-page dossiers are not truncated.
const MAX_OUTPUT_TOKENS = 8192;

const SYNTHESIZER_SYSTEM_PROMPT = `You are the Report Writer — the lead analyst of a research swarm. Each specialist has returned RAW FINDINGS from their corner of the question; your job is to WRITE the definitive report from them: select what matters, integrate across specialists, resolve overlaps and contradictions, and elevate raw research notes into authoritative, flowing prose.

Produce a COMPREHENSIVE, dense, multi-page report. This is the flagship deliverable — the only finished report in the pipeline. Requirements:

STRUCTURE (use GitHub-flavored markdown):
- Open with a level-1 title: "# DOSSIER: <concise title of the subject>".
- Follow with a "## Executive Summary" — 2-4 tight paragraphs capturing the core conclusions.
- Then a "## Key Findings" section as a bulleted list of the most important, specific takeaways.
- Then several thematic "## " sections (one per major dimension surfaced by the specialists), each broken into "### " subsections with real analysis — not bullet dumps.
- Use markdown TABLES wherever data, comparisons, tradeoffs, or classifications appear.
- Include a "## Tensions & Contradictions" section reconciling where specialists disagreed or where findings pull in opposite directions.
- Include a "## Strategic Implications & Outlook" section with forward-looking analysis.
- Close with a "## Conclusion".

QUALITY BAR:
- Synthesize and integrate — connect findings across specialists; do not just concatenate them.
- Preserve every substantive fact, figure, and nuance from the findings. Lose nothing important.
- Be specific and analytical. Prefer concrete claims, numbers, and named examples over vague generalities.
- Aim for depth: a thorough dossier of at least ~1500-2500 words when the material supports it.
- No introductory pleasantries, no "as an AI", no meta-commentary. Start directly with the title.
- Format immaculately: correct heading hierarchy, well-formed tables, tight prose.`;

const INTERROGATOR_SYSTEM_PROMPT = `You are the Interrogation Node — an expert analyst who answers follow-up questions about an EXISTING research dossier compiled by a swarm of specialists.

Ground every answer STRICTLY in the provided material: the compiled dossier and the raw specialist findings supplied to you. Do not invent facts, figures, or sources that are not present in that material.

HOW TO ANSWER:
- Synthesize across the dossier and the specialist findings — connect and reconcile information rather than quoting a single passage.
- When a specific claim, figure, or conclusion traces to a particular specialist, cite which specialist it came from (e.g. "per the <designation> specialist").
- Be direct and get to the point. Answer the actual question asked.
- Format cleanly in GitHub-flavored markdown: use headings, bullet lists, and tables where they genuinely aid clarity — but keep it proportional.
- Produce a FOCUSED answer, not a whole new dossier. Match the scope of the question; do not pad.
- If the dossier and findings do not cover what is being asked, say so plainly and explicitly ("The dossier does not address ...") instead of speculating or fabricating an answer. You may note what related information IS available.

No introductory pleasantries, no "as an AI", no meta-commentary. Answer directly.`;

function getGeminiClient(customApiKey?: string) {
  const key = customApiKey || process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: GENERATION_TIMEOUT_MS } });
}

function parseJsonString(text: string): any {
  if (!text) return [];
  const cleaned = text.trim();

  // Helper to extract array from any parsed object
  const extractArray = (parsed: any): any[] => {
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      for (const key of ["agents", "profiles", "agent_profiles", "items"]) {
        if (Array.isArray(parsed[key])) {
          return parsed[key];
        }
      }
      for (const key in parsed) {
        if (Array.isArray(parsed[key])) {
          return parsed[key];
        }
      }
    }
    return [];
  };

  // 1. Try simple clean and parse
  try {
    const directParsed = JSON.parse(cleaned);
    const arr = extractArray(directParsed);
    if (arr.length > 0) return arr;
  } catch (e) {
    // Ignore direct parse errors
  }

  // 2. Try regex match for markdown code block
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = codeBlockRegex.exec(cleaned);
  if (match && match[1]) {
    try {
      const blockParsed = JSON.parse(match[1].trim());
      const arr = extractArray(blockParsed);
      if (arr.length > 0) return arr;
    } catch (e) {
      // Ignore
    }
  }

  // 3. Robust substring extraction of JSON array [ ... ]
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(candidate);
      const arr = extractArray(parsed);
      if (arr.length > 0) return arr;
    } catch (e) {
      // Ignore
    }
  }

  // 4. Robust substring extraction of JSON object { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      const arr = extractArray(parsed);
      if (arr.length > 0) return arr;
    } catch (e) {
      // Ignore
    }
  }

  console.error("Failed to parse JSON string securely:", text);
  return [];
}

interface AgentProfileLike {
  id: string;
  designation: string;
  system_prompt: string;
  geometric_avatar_seed: string;
}

function normalizeAgents(raw: any[]): AgentProfileLike[] {
  const agents: AgentProfileLike[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < raw.length; index++) {
    const entry = raw[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const systemPrompt = entry.system_prompt != null ? String(entry.system_prompt).trim() : "";
    const designation = entry.designation != null ? String(entry.designation).trim() : "";
    if (!systemPrompt || !designation) continue;

    let id = entry.id != null ? String(entry.id).trim() : "";
    if (!id) {
      id = designation.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `agent_${index}`;
    }
    if (seenIds.has(id)) {
      let suffix = 2;
      while (seenIds.has(`${id}_${suffix}`)) suffix++;
      id = `${id}_${suffix}`;
    }
    seenIds.add(id);

    const seed = entry.geometric_avatar_seed != null ? String(entry.geometric_avatar_seed).trim() : "";

    agents.push({
      id,
      designation,
      system_prompt: systemPrompt,
      geometric_avatar_seed: seed || id
    });

    if (agents.length >= 8) break;
  }

  return agents;
}

async function generateUnifiedText(params: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  prompt: string;
  jsonMode?: boolean;
}): Promise<string> {
  const { provider, model, apiKey, baseUrl, systemPrompt, prompt, jsonMode } = params;

  if (provider === "gemini") {
    const aiClient = getGeminiClient(apiKey);
    const response = await aiClient.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        ...(jsonMode ? {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "List of specialized agent profiles",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                designation: { type: Type.STRING },
                system_prompt: { type: Type.STRING },
                geometric_avatar_seed: { type: Type.STRING }
              },
              required: ["id", "designation", "system_prompt", "geometric_avatar_seed"]
            }
          }
        } : {})
      }
    });
    return response.text || "";
  }

  // Anthropic
  if (provider === "anthropic") {
    const url = `${baseUrl || "https://api.anthropic.com/v1"}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: MAX_OUTPUT_TOKENS,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: prompt }]
      }),
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic Error: ${errText}`);
    }
    const data: any = await response.json();
    const text = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    if (!text) {
      throw new Error("Anthropic Error: response contained no text content");
    }
    return text;
  }

  // OpenAI-compatible
  let defaultBaseUrl = "https://api.openai.com/v1";
  if (provider === "openrouter") defaultBaseUrl = "https://openrouter.ai/api/v1";
  if (provider === "veniceai") defaultBaseUrl = "https://api.venice.ai/api/v1";
  if (provider === "ollama") defaultBaseUrl = "http://localhost:11434/v1";
  if (provider === "lmstudio") defaultBaseUrl = "http://localhost:1234/v1";

  const url = `${baseUrl || defaultBaseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt }
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider} Error: ${errText}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) {
    throw new Error(`${provider} Error: response contained no message content`);
  }
  return content;
}

async function pipeUnifiedStream(params: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  prompt: string;
  res: any;
}): Promise<void> {
  const { provider, model, apiKey, baseUrl, systemPrompt, prompt, res } = params;

  if (provider === "gemini") {
    const aiClient = getGeminiClient(apiKey);
    const responseStream = await aiClient.models.generateContentStream({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    });
    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }
    return;
  }

  if (provider === "anthropic") {
    const url = `${baseUrl || "https://api.anthropic.com/v1"}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: MAX_OUTPUT_TOKENS,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: prompt }],
        stream: true
      }),
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic stream error: ${errText}`);
    }

    if (!response.body) throw new Error("No response body for streaming");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const dataStr = line.slice(5).trim();
          if (dataStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === "content_block_delta" && parsed.delta && parsed.delta.text) {
              res.write(parsed.delta.text);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    return;
  }

  // OpenAI-compatible
  let defaultBaseUrl = "https://api.openai.com/v1";
  if (provider === "openrouter") defaultBaseUrl = "https://openrouter.ai/api/v1";
  if (provider === "veniceai") defaultBaseUrl = "https://api.venice.ai/api/v1";
  if (provider === "ollama") defaultBaseUrl = "http://localhost:11434/v1";
  if (provider === "lmstudio") defaultBaseUrl = "http://localhost:1234/v1";

  const url = `${baseUrl || defaultBaseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt }
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider} stream error: ${errText}`);
  }

  if (!response.body) throw new Error("No response body for streaming");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("data:")) {
        const dataStr = cleanLine.slice(5).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(dataStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(content);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // POST /api/models
  app.post("/api/models", async (req, res) => {
    const { provider, apiKey, baseUrl } = req.body;
    try {
      let models: string[] = [];
      if (provider === "gemini") {
        models = [
          "gemini-3.5-flash",
          "gemini-3.1-pro-preview",
          "gemini-2.5-pro",
          "gemini-2.5-flash",
          "gemini-1.5-pro",
          "gemini-1.5-flash"
        ];
      } else if (provider === "openai") {
        const url = baseUrl || "https://api.openai.com/v1";
        const response = await fetch(`${url}/models`, {
          headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
        });
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const data: any = await response.json();
        if (data.data) {
          models = data.data.map((m: any) => m.id);
        }
      } else if (provider === "openrouter") {
        const url = baseUrl || "https://openrouter.ai/api/v1";
        const response = await fetch(`${url}/models`, {
          headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
        });
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const data: any = await response.json();
        if (data.data) {
          models = data.data.map((m: any) => m.id);
        }
      } else if (provider === "veniceai") {
        const url = baseUrl || "https://api.venice.ai/api/v1";
        const response = await fetch(`${url}/models`, {
          headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
        });
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const data: any = await response.json();
        if (data.data) {
          models = data.data.map((m: any) => m.id);
        }
      } else if (provider === "anthropic") {
        const url = baseUrl || "https://api.anthropic.com/v1";
        const response = await fetch(`${url}/models`, {
          headers: {
            "x-api-key": apiKey || "",
            "anthropic-version": "2023-06-01"
          },
          signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
        });
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const data: any = await response.json();
        if (data.data) {
          models = data.data.map((m: any) => m.id);
        } else {
          models = [
            "claude-3-5-sonnet-latest",
            "claude-3-5-haiku-latest",
            "claude-3-opus-latest",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
          ];
        }
      } else if (provider === "ollama") {
        const url = baseUrl || "http://localhost:11434";
        try {
          const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS) });
          if (response.ok) {
            const data: any = await response.json();
            if (data.models) {
              models = data.models.map((m: any) => m.name);
            }
          } else {
            const altResponse = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS) });
            if (altResponse.ok) {
              const altData: any = await altResponse.json();
              if (altData.data) {
                models = altData.data.map((m: any) => m.id);
              }
            }
          }
        } catch (localErr) {
          // Retry with /v1/models
          const altResponse = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS) });
          if (altResponse.ok) {
            const altData: any = await altResponse.json();
            if (altData.data) {
              models = altData.data.map((m: any) => m.id);
            }
          } else {
            throw localErr;
          }
        }
      } else if (provider === "lmstudio") {
        const url = baseUrl || "http://localhost:1234/v1";
        const response = await fetch(`${url}/models`, { signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS) });
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const data: any = await response.json();
        if (data.data) {
          models = data.data.map((m: any) => m.id);
        }
      }

      models.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
      res.json({ models });
    } catch (error: any) {
      console.warn(`Error fetching models for ${provider}:`, error.message);
      // Return 200 OK with empty models and the error description so the UI configuration panel can show it gracefully without throwing full server stack error trace
      res.json({ models: [], error: error.message || "Connection failed. Ensure service is running and accessible." });
    }
  });

  // POST /api/orchestrate
  app.post("/api/orchestrate", async (req, res) => {
    try {
      const { query, config } = req.body;
      if (!query) return res.status(400).json({ error: "Missing query" });

      const provider = config?.models?.orchestrator?.provider || "gemini";
      const model = config?.models?.orchestrator?.model || "gemini-3.5-flash";
      const providerDetails = config?.providers?.[provider] || { apiKey: "", baseUrl: "" };

      let prompt = `You are the Orchestrator AI. Analyze the following research query and generate exactly 5 to 7 highly specialized Agent Profiles to investigate it from different critical angles. \n\nQuery: ${query}`;
      const systemPrompt = provider === "gemini" 
        ? "You are the Orchestrator AI. Your job is to output a clean, valid JSON array containing 5 to 7 specialized Agent Profiles to research a query."
        : "You are the Orchestrator AI. Your job is to output a clean, valid JSON object containing an 'agents' key which holds an array of 5 to 7 specialized Agent Profiles to research a query.";

      if (provider !== "gemini") {
        prompt += `\n\nIMPORTANT: Because the platform is using JSON Mode, you MUST output a valid JSON object structure with a single top-level key named "agents". The value of "agents" must be a JSON array of specialized agent profiles:
{
  "agents": [
    {
      "id": "unique_slug",
      "designation": "Specialist Designation",
      "system_prompt": "comprehensive instructions for this specialist to perform deep research on this specific dimension",
      "geometric_avatar_seed": "any_short_seed"
    }
  ]
}`;
      }

      const text = await generateUnifiedText({
        provider,
        model,
        apiKey: providerDetails.apiKey,
        baseUrl: providerDetails.baseUrl,
        systemPrompt,
        prompt,
        jsonMode: true
      });

      if (!text) throw new Error("No response from AI");
      const agents = normalizeAgents(parseJsonString(text));

      if (agents.length === 0) {
        return res.status(502).json({ error: "The orchestrator model did not return usable agent profiles. Try again or pick a different orchestrator model." });
      }

      res.json({ agents });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/execute
  app.post("/api/execute", async (req, res) => {
    try {
      const { query, agent, config } = req.body;
      if (!query || !agent) return res.status(400).json({ error: "Missing payload" });

      const provider = config?.models?.specialist?.provider || "gemini";
      const model = config?.models?.specialist?.model || "gemini-3.5-flash";
      const providerDetails = config?.providers?.[provider] || { apiKey: "", baseUrl: "" };

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      await pipeUnifiedStream({
        provider,
        model,
        apiKey: providerDetails.apiKey,
        baseUrl: providerDetails.baseUrl,
        systemPrompt: agent.system_prompt,
        prompt: `You are ONE specialist in a research swarm, assigned a single dimension of the question. Investigate the query strictly within your domain and return your FINDINGS — the raw intelligence a separate report-writing agent will weave into the final report. You are NOT writing the finished report yourself.\n\nReport dense, specific findings: concrete claims, evidence, figures, mechanisms, named examples, causal links, and the tensions or open questions you surface. Light structure is fine (short thematic subheadings, bullets) to keep it scannable.\n\nDo NOT frame this as a standalone report: no overall title, no executive summary, no conclusion or "in summary" wrap-up — those belong to the report writer. Do not restate the whole question or stray into other specialists' territory. Stay in your lane and go deep. Substance over polish.\n\nQuery: ${query}`,
        res
      });

      res.end();
    } catch (error: any) {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        // Streaming already started: destroy the socket so the client's
        // stream read fails detectably instead of ending cleanly truncated.
        res.destroy(error);
      }
    }
  });

  // POST /api/synthesize
  app.post("/api/synthesize", async (req, res) => {
    try {
      const { query, results, config } = req.body;
      if (!query || !results) return res.status(400).json({ error: "Missing payload" });

      const provider = config?.models?.synthesizer?.provider || "gemini";
      const model = config?.models?.synthesizer?.model || "gemini-3.1-pro-preview";
      const providerDetails = config?.providers?.[provider] || { apiKey: "", baseUrl: "" };

      const promptContext = results
        .map((r: any) => `### Specialist: ${r.agent.designation}\n\n${r.result}`)
        .join("\n\n---\n\n");

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      await pipeUnifiedStream({
        provider,
        model,
        apiKey: providerDetails.apiKey,
        baseUrl: providerDetails.baseUrl,
        systemPrompt: SYNTHESIZER_SYSTEM_PROMPT,
        prompt: `Compile the findings of the specialist swarm into a single authoritative dossier answering the original research query.\n\n=== ORIGINAL QUERY ===\n${query}\n\n=== SPECIALIST FINDINGS ===\n${promptContext}`,
        res
      });

      res.end();
    } catch (error: any) {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.destroy(error);
      }
    }
  });

  // POST /api/interrogate
  app.post("/api/interrogate", async (req, res) => {
    try {
      const { query, dossier, findings, question, history, config } = req.body;
      if (!question || !dossier) return res.status(400).json({ error: "Missing payload" });

      const provider = config?.models?.synthesizer?.provider || "gemini";
      const model = config?.models?.synthesizer?.model || "gemini-3.1-pro-preview";
      const providerDetails = config?.providers?.[provider] || { apiKey: "", baseUrl: "" };

      const hasFindings = Array.isArray(findings) && findings.length > 0;
      const findingsContext = hasFindings
        ? findings
            .map((f: any) => `### Specialist: ${String(f?.designation ?? "Unknown").trim()}\n${String(f?.result ?? "").trim()}`)
            .join("\n\n---\n\n")
        : "(No individual specialist findings are available for this run — answer from the dossier alone, and do not attribute claims to specific specialists.)";

      const historyContext = Array.isArray(history) && history.length > 0
        ? history
            .filter((turn: any) => turn && typeof turn.content === "string")
            .map((turn: any) => `${turn.role === 'user' ? 'Q' : 'A'}: ${String(turn.content).trim()}`)
            .join("\n\n")
        : "";

      const prompt = `Answer the follow-up question below, grounded strictly in the dossier and specialist findings.\n\n=== ORIGINAL QUERY ===\n${query || "(not provided)"}\n\n=== COMPILED DOSSIER ===\n${dossier}\n\n=== SPECIALIST FINDINGS ===\n${findingsContext}${historyContext ? `\n\n=== PRIOR Q&A ===\n${historyContext}` : ""}\n\n=== NEW QUESTION ===\n${question}`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      await pipeUnifiedStream({
        provider,
        model,
        apiKey: providerDetails.apiKey,
        baseUrl: providerDetails.baseUrl,
        systemPrompt: INTERROGATOR_SYSTEM_PROMPT,
        prompt,
        res
      });

      res.end();
    } catch (error: any) {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.destroy(error);
      }
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
