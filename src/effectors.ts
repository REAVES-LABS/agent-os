// File-system effectors. Mirrors the production RLL orchestrator's
// outbox + founder-approval queue pattern so any agent submitting via
// MCP gets the same physical layout REVI uses.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Verdict, VerdictResult } from "./types.js";

export interface EffectorPaths {
  outbox: string;
  approvalQueue: string;
}

function slugify(text: string, n = 30): string {
  const s = text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return (s.length ? s : "untitled").slice(0, n);
}

function stamp(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function effect(
  paths: EffectorPaths,
  role: string,
  summary: string,
  prompt: string,
  response: string,
  verdict: VerdictResult,
): { path: string; landed: Verdict } {
  const verdictDir = verdict.verdict === "auto" ? paths.outbox : paths.approvalQueue;
  const target = verdict.verdict === "auto" ? join(verdictDir, role) : verdictDir;
  mkdirSync(target, { recursive: true });
  const filename = `${stamp()}-${role}-${slugify(summary)}.md`;
  const path = join(target, filename);

  const body = [
    `# ${role} response — ${summary}`,
    ``,
    `Verdict: **${verdict.verdict}** (score ${verdict.score.toFixed(2)})`,
    `Why: ${verdict.why}`,
    ``,
    `## Prompt`,
    ``,
    prompt,
    ``,
    `## Response`,
    ``,
    response,
    ``,
  ].join("\n");

  writeFileSync(path, body, "utf-8");
  return { path, landed: verdict.verdict };
}
