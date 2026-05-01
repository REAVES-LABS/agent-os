import type { ChatRequest, ChatResponse, Supervisor } from "../types.js";

interface Cfg {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAISupervisor implements Supervisor {
  readonly id = "openai";
  constructor(private cfg: Cfg) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.cfg.apiKey) {
      throw new Error("OpenAISupervisor: OPENAI_API_KEY not set");
    }
    const url = `${this.cfg.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: req.model ?? this.cfg.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 1024,
    };
    if (req.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
    };
    const content = data.choices[0]?.message?.content ?? "";
    return { content, model: data.model, raw: data };
  }
}
