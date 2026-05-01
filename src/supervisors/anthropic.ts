import type { ChatRequest, ChatResponse, Supervisor } from "../types.js";

interface Cfg {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class AnthropicSupervisor implements Supervisor {
  readonly id = "anthropic";
  constructor(private cfg: Cfg) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.cfg.apiKey) {
      throw new Error("AnthropicSupervisor: ANTHROPIC_API_KEY not set");
    }

    // Anthropic separates system messages from the messages array.
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const url = `${this.cfg.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
    const body = {
      model: req.model ?? this.cfg.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.2,
      system: system || undefined,
      messages,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
    };
    const content = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return { content, model: data.model, raw: data };
  }
}
