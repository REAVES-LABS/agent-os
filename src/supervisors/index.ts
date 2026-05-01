// Supervisor factory. Picks a backend by env var or explicit config.
//
// Default order matches a "use whatever's available" chain:
//   AGENT_OS_SUPERVISOR=anthropic|openai|ollama|generic
// Or falls back through:
//   ANTHROPIC_API_KEY -> OPENAI_API_KEY -> Ollama localhost.
//
// First principles: the supervisor is a decision-maker, not a brand.
// Any LLM that can return JSON can play the role.

import type { Supervisor } from "../types.js";
import { AnthropicSupervisor } from "./anthropic.js";
import { OpenAISupervisor } from "./openai.js";
import { OllamaSupervisor } from "./ollama.js";
import { GenericSupervisor } from "./generic.js";

export type SupervisorBackend =
  | "anthropic"
  | "openai"
  | "ollama"
  | "generic";

export interface SupervisorConfig {
  backend?: SupervisorBackend;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export function createSupervisor(cfg: SupervisorConfig = {}): Supervisor {
  const backend = cfg.backend
    ?? (process.env.AGENT_OS_SUPERVISOR as SupervisorBackend | undefined)
    ?? autodetect();

  switch (backend) {
    case "anthropic":
      return new AnthropicSupervisor({
        apiKey: cfg.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
        model: cfg.model ?? process.env.AGENT_OS_MODEL ?? "claude-haiku-4-5-20251001",
      });
    case "openai":
      return new OpenAISupervisor({
        apiKey: cfg.apiKey ?? process.env.OPENAI_API_KEY ?? "",
        model: cfg.model ?? process.env.AGENT_OS_MODEL ?? "gpt-4o-mini",
        baseUrl: cfg.baseUrl ?? process.env.OPENAI_BASE_URL,
      });
    case "ollama":
      return new OllamaSupervisor({
        baseUrl: cfg.baseUrl ?? process.env.OLLAMA_URL ?? "http://localhost:11434",
        model: cfg.model ?? process.env.AGENT_OS_MODEL ?? "llama3.2",
      });
    case "generic":
      return new GenericSupervisor({
        apiKey: cfg.apiKey ?? process.env.AGENT_OS_API_KEY ?? "",
        baseUrl: cfg.baseUrl ?? process.env.AGENT_OS_BASE_URL ?? "",
        model: cfg.model ?? process.env.AGENT_OS_MODEL ?? "",
      });
  }
}

function autodetect(): SupervisorBackend {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "ollama"; // free local fallback
}

export { AnthropicSupervisor, OpenAISupervisor, OllamaSupervisor, GenericSupervisor };
