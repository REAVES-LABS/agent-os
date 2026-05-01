// Shared types for the agent-os supervision layer.
//
// First principles:
//   perception -> decision -> verification -> effect -> memory
//
// An agent submits an action it wants to take. The supervisor decides
// whether to allow it (auto), require human approval (supervised), or
// refuse and escalate (escalate). Every outcome updates trust scores
// per category, which gate future verdicts.

export type Verdict = "auto" | "supervised" | "escalate";

export type Irreversibility = "reversible" | "external" | "irreversible";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

export interface ChatResponse {
  content: string;
  model: string;
  raw?: unknown;
}

export interface Supervisor {
  readonly id: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface VerdictResult {
  verdict: Verdict;
  score: number;
  why: string;
  raw?: unknown;
}

export interface RoutingResult {
  role: string;
  confidence: number;
  why: string;
}

export interface RecoveryPlan {
  retryWith?: string;
  rollback?: string;
  escalate?: string;
  why: string;
}

export interface SubmitActionInput {
  agentId: string;
  category: string;
  action: string;
  irreversibility?: Irreversibility;
  context?: string;
}

export interface SubmitActionOutput {
  actionId: string;
  verdict: Verdict;
  score: number;
  why: string;
  routedTo: string;
  effectPath: string;
  trustScoreAfter: number;
}

export interface RecordOutcomeInput {
  actionId: string;
  success: boolean;
  capability?: number; // 0..1 — did output exist?
  quality?: number;    // 0..1 — was it good?
  impact?: number;     // 0..1 — did it produce value?
  notes?: string;
}

export interface RecordOutcomeOutput {
  worth: number;       // capability * quality * impact
  trustScoreBefore: number;
  trustScoreAfter: number;
  category: string;
}

export interface GetRoutingInput {
  description: string;
  candidates?: string[];
}

export interface RecoverInput {
  actionId: string;
  error: string;
}
