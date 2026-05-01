import type { ChatRequest, ChatResponse, Supervisor } from "../types.js";

interface Cfg {
  baseUrl: string;
  model: string;
}

// Free local supervisor. Mirrors the production RLL orchestrator's
// ollama_chat call so drop-in compatibility is preserved.
export class OllamaSupervisor implements Supervisor {
  readonly id = "ollama";
  constructor(private cfg: Cfg) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `${this.cfg.baseUrl}/api/chat`;
    const body = {
      model: req.model ?? this.cfg.model,
      messages: req.messages,
      stream: false,
      options: {
        temperature: req.temperature ?? 0.2,
        num_ctx: 4096,
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      message?: { content?: string };
      model: string;
    };
    const content = data.message?.content ?? "";
    return { content, model: data.model, raw: data };
  }
}
