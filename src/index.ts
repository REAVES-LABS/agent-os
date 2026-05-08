// Public API for @reaves-labs/agent-os.
//
// Ergonomic surface: construct an AgentOS, call submit / recordOutcome /
// route / recover. Everything else (engine, store, effectors, supervisors)
// is an implementation detail.

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { SupervisionEngine, DEFAULT_ROLES } from "./engine.js";
import { Store } from "./store.js";
import { effect } from "./effectors.js";
import { createSupervisor } from "./supervisors/index.js";
import type {
  Supervisor,
  SubmitActionInput,
  SubmitActionOutput,
  RecordOutcomeInput,
  RecordOutcomeOutput,
  GetRoutingInput,
  RoutingResult,
  RecoverInput,
  RecoveryPlan,
  Irreversibility,
} from "./types.js";
import type { SupervisorConfig } from "./supervisors/index.js";

export * from "./types.js";
export { SupervisionEngine, DEFAULT_ROLES } from "./engine.js";
export { Store, type TrustView } from "./store.js";
export { createSupervisor } from "./supervisors/index.js";

export interface AgentOSConfig {
  supervisor?: Supervisor | SupervisorConfig;
  workdir?: string;
  roles?: readonly string[];
}

export class AgentOS {
  readonly engine: SupervisionEngine;
  readonly store: Store;
  readonly workdir: string;
  private outbox: string;
  private approvalQueue: string;

  constructor(cfg: AgentOSConfig = {}) {
    this.workdir = cfg.workdir ?? join(homedir(), ".agent-os");
    const supervisor = isSupervisor(cfg.supervisor)
      ? cfg.supervisor
      : createSupervisor(cfg.supervisor ?? {});
    this.engine = new SupervisionEngine({
      supervisor,
      roles: cfg.roles ?? DEFAULT_ROLES,
    });
    this.store = new Store(join(this.workdir, "state.db"));
    this.outbox = join(this.workdir, "outbox");
    this.approvalQueue = join(this.workdir, "queues", "approval");
  }

  // ── tool 1: submit_action ──────────────────────────────────────────────
  // The agent says "I want to do X." We route, verify, gate, persist,
  // and either auto-execute (write to outbox) or queue for approval.
  async submit(input: SubmitActionInput): Promise<SubmitActionOutput> {
    const irreversibility: Irreversibility = input.irreversibility ?? "reversible";
    const actionId = randomUUID();
    this.store.insertAction({
      action_id: actionId,
      agent_id: input.agentId,
      category: input.category,
      action: input.action,
      irreversibility,
      routed_to: null,
      verdict: null,
      score: null,
      why: null,
      effect_path: null,
      created_at: new Date().toISOString(),
    });

    const routing = await this.engine.route(input.action);
    const verdict = await this.engine.verify(
      [input.context, input.action].filter(Boolean).join("\n\n"),
      input.action,
      irreversibility,
    );

    const { path } = effect(
      { outbox: this.outbox, approvalQueue: this.approvalQueue },
      routing.role,
      input.action.slice(0, 60),
      input.action,
      input.action,
      verdict,
    );
    this.store.updateActionVerdict(
      actionId,
      verdict.verdict,
      verdict.score,
      verdict.why,
      path,
      routing.role,
    );

    const trust = this.store.getTrust(input.category);
    return {
      actionId,
      verdict: verdict.verdict,
      score: verdict.score,
      why: verdict.why,
      routedTo: routing.role,
      effectPath: path,
      trustScoreAfter: trust.score,
    };
  }

  // ── tool 2: record_outcome ─────────────────────────────────────────────
  // After execution, the caller reports back. worth = c x q x i.
  // The category's trust score moves toward this worth.
  async recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeOutput> {
    const action = this.store.getAction(input.actionId);
    if (!action) throw new Error(`unknown actionId: ${input.actionId}`);
    const c = clamp01(input.capability ?? (input.success ? 1 : 0));
    const q = clamp01(input.quality ?? (input.success ? 0.7 : 0));
    const i = clamp01(input.impact ?? (input.success ? 0.7 : 0));
    const worth = c * q * i;
    this.store.insertOutcome({
      action_id: input.actionId,
      success: input.success,
      capability: c,
      quality: q,
      impact: i,
      worth,
      notes: input.notes,
    });
    const { before, after } = this.store.updateTrust(action.category, worth);
    return {
      worth,
      trustScoreBefore: before,
      trustScoreAfter: after,
      category: action.category,
    };
  }

  // ── tool 3: get_routing ────────────────────────────────────────────────
  async route(input: GetRoutingInput): Promise<RoutingResult> {
    return this.engine.route(input.description, input.candidates);
  }

  // ── tool 4: recover ────────────────────────────────────────────────────
  async recover(input: RecoverInput): Promise<RecoveryPlan> {
    const action = this.store.getAction(input.actionId);
    if (!action) throw new Error(`unknown actionId: ${input.actionId}`);
    return this.engine.recover(action.action, input.error);
  }

  // ── inspection ─────────────────────────────────────────────────────────
  status() {
    const recent = this.store.recentActions(5);
    const pending = this.store.pendingApprovals();
    const trust = this.store.trustScores();
    return {
      workdir: this.workdir,
      recent: recent.map((a) => ({
        actionId: a.action_id,
        category: a.category,
        verdict: a.verdict,
        score: a.score,
        routedTo: a.routed_to,
      })),
      pendingCount: pending.length,
      trust,
    };
  }
}

function isSupervisor(x: unknown): x is Supervisor {
  return !!x && typeof (x as Supervisor).chat === "function";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
