import type { ChatRequest, ChatResponse, Supervisor } from "../types.js";

interface Cfg {
  apiKey: string;
  baseUrl: string;
  model: string;
}

// OpenAI-compatible endpoint. Works for Groq, Together, Fireworks, vLLM,
// llama.cpp's --api-server, and any provider that speaks the OpenAI
// /v1/chat/completions shape.
export class GenericSupervisor implements Supervisor {
  readonly id = "generic";
  constructor(private cfg: Cfg) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.cfg.baseUrl) {
      throw new Error("GenericSupervisor: AGENT_OS_BASE_URL not set");
    }
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;

    const body: Record<string, unknown> = {
      model: req.model ?? this.cfg.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 1024,
    };
    if (req.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Generic ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
    };
    const content = data.choices[0]?.message?.content ?? "";
    return { content, model: data.model, raw: data };
  }
}
