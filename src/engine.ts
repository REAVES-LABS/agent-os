// Supervision engine. The four primitives:
//
//   route(description)       -> RoutingResult
//   verify(prompt, response) -> VerdictResult
//   gate(verdict, irrev)     -> "auto" | "supervised" | "escalate"
//   recover(failure)         -> RecoveryPlan
//
// All four call out to a Supervisor (LLM). The supervisor is injected
// at construction so the engine itself is backend-agnostic.
//
// Ported from the production RLL orchestrator.py decide_role + verify
// loop, generalized to be LLM-agnostic.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Supervisor,
  RoutingResult,
  VerdictResult,
  Verdict,
  Irreversibility,
  RecoveryPlan,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// In dev we run from src/; published we run from dist/. Prompts live one level up.
const PROMPTS_DIR = existsSync(join(__dirname, "../prompts"))
  ? join(__dirname, "../prompts")
  : join(__dirname, "../../prompts");

function loadPrompt(name: string): string {
  const p = join(PROMPTS_DIR, `${name}.md`);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  // Strip markdown fences if the model wrapped its JSON.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : raw;
  const m = candidate.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function clamp01(n: unknown, fallback = 0.5): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

export const DEFAULT_ROLES = [
  "router",
  "writer",
  "code",
  "analyst",
  "coach",
  "researcher",
  "verifier",
  "notion-pm",
  "business-ops-vp",
  "product-manager",
  "project-manager",
] as const;

export interface EngineConfig {
  supervisor: Supervisor;
  roles?: readonly string[];
  routerPrompt?: string;
  verifierPrompt?: string;
  recoveryPrompt?: string;
}

export class SupervisionEngine {
  private routerPrompt: string;
  private verifierPrompt: string;
  private recoveryPrompt: string;
  private roles: readonly string[];

  constructor(private cfg: EngineConfig) {
    this.routerPrompt = cfg.routerPrompt ?? loadPrompt("router");
    this.verifierPrompt = cfg.verifierPrompt ?? loadPrompt("verifier");
    this.recoveryPrompt = cfg.recoveryPrompt ?? loadPrompt("recovery");
    this.roles = cfg.roles ?? DEFAULT_ROLES;
  }

  // ── route ──────────────────────────────────────────────────────────────
  async route(description: string, candidates?: readonly string[]): Promise<RoutingResult> {
    const roles = candidates ?? this.roles;
    const sys = `${this.routerPrompt}\n\nRoles available: ${roles.join(", ")}`;
    const res = await this.cfg.supervisor.chat({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: description },
      ],
      responseFormat: "json",
    });
    const parsed = extractJson(res.content) as Partial<RoutingResult> | null;
    const role =
      parsed && typeof parsed.role === "string" && roles.includes(parsed.role)
        ? parsed.role
        : "researcher";
    return {
      role,
      confidence: clamp01(parsed?.confidence, 0.5),
      why: parsed?.why ?? "no router rationale",
    };
  }

  // ── verify ─────────────────────────────────────────────────────────────
  async verify(
    prompt: string,
    response: string,
    irreversibility: Irreversibility = "reversible",
  ): Promise<VerdictResult> {
    const sys = this.verifierPrompt;
    const user = [
      `Irreversibility: ${irreversibility}`,
      "",
      "## Prompt",
      prompt,
      "",
      "## Proposed response",
      response,
    ].join("\n");

    let raw: string;
    try {
      const r = await this.cfg.supervisor.chat({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        responseFormat: "json",
      });
      raw = r.content;
    } catch (e) {
      return {
        verdict: "supervised",
        score: 0.5,
        why: `verifier unavailable: ${(e as Error).message}`,
      };
    }

    const parsed = extractJson(raw) as Partial<VerdictResult> | null;
    if (!parsed) {
      return { verdict: "supervised", score: 0.5, why: "verifier returned no JSON" };
    }
    const score = clamp01(parsed.score, 0.5);
    const verdict = this.gate(parsed.verdict ?? "supervised", score, irreversibility);
    return {
      verdict,
      score,
      why: parsed.why ?? "no rationale",
      raw: parsed,
    };
  }

  // ── gate ───────────────────────────────────────────────────────────────
  // Pure function — applies the irreversibility override regardless of what
  // the LLM said. This is the safety floor.
  gate(verdict: Verdict, score: number, irreversibility: Irreversibility): Verdict {
    if (irreversibility === "irreversible") return "escalate";
    if (irreversibility === "external" && verdict === "auto") return "supervised";
    if (score < 0.5) return "escalate";
    if (score < 0.8) return verdict === "auto" ? "supervised" : verdict;
    return verdict;
  }

  // ── recover ────────────────────────────────────────────────────────────
  async recover(action: string, error: string): Promise<RecoveryPlan> {
    try {
      const r = await this.cfg.supervisor.chat({
        messages: [
          { role: "system", content: this.recoveryPrompt },
          {
            role: "user",
            content: `## Failed action\n${action}\n\n## Error\n${error}`,
          },
        ],
        responseFormat: "json",
      });
      const parsed = extractJson(r.content) as Partial<RecoveryPlan> | null;
      if (!parsed) {
        return { escalate: "human", why: "recovery planner returned no JSON" };
      }
      return {
        retryWith: parsed.retryWith ?? undefined,
        rollback: parsed.rollback ?? undefined,
        escalate: parsed.escalate ?? undefined,
        why: parsed.why ?? "no rationale",
      };
    } catch (e) {
      return {
        escalate: "human",
        why: `recovery supervisor failed: ${(e as Error).message}`,
      };
    }
  }
}
