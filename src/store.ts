// SQLite persistence for actions, outcomes, and per-category trust scores.
//
// First principles: the substrate must remember every verdict so trust
// scores can compound over time. capability x quality x impact = worth.
// Worth above 0.7 sustained per category lifts the auto-execute floor.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Verdict } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS actions (
  action_id        TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL,
  category         TEXT NOT NULL,
  action           TEXT NOT NULL,
  irreversibility  TEXT NOT NULL,
  routed_to        TEXT,
  verdict          TEXT,
  score            REAL,
  why              TEXT,
  effect_path      TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
  outcome_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id    TEXT NOT NULL,
  success      INTEGER NOT NULL,
  capability   REAL,
  quality      REAL,
  impact       REAL,
  worth        REAL,
  notes        TEXT,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (action_id) REFERENCES actions(action_id)
);

-- Trust uses a Beta-Bernoulli posterior with time decay.
--   alpha = prior_alpha + sum(worth_i * decay_i)
--   beta  = prior_beta  + sum((1 - worth_i) * decay_i)
--   mean  = alpha / (alpha + beta)
--   stddev = sqrt(alpha * beta / ((alpha+beta)^2 * (alpha+beta+1)))
--   score = lower_confidence_bound = mean - z * stddev   (z=1.96 for 95% LCB)
-- The LCB is what gets persisted as the score column and consumed by the gate.
-- New categories start with alpha=beta=2 (uniform-ish prior) which gives
-- a deliberately conservative score around 0.31 — earn trust before
-- you can auto-execute.
CREATE TABLE IF NOT EXISTS trust (
  category      TEXT PRIMARY KEY,
  score         REAL NOT NULL,    -- lower-confidence-bound, 0..1
  n             INTEGER NOT NULL, -- effective observation count
  alpha         REAL NOT NULL,    -- Beta posterior alpha (successes-weight)
  beta          REAL NOT NULL,    -- Beta posterior beta  (failures-weight)
  last_worth    REAL,             -- last observed worth (for diagnostics)
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_action ON outcomes(action_id);
CREATE INDEX IF NOT EXISTS idx_actions_category ON actions(category);
`;

// Bayesian trust parameters. Tunable via constructor cfg later.
const PRIOR_ALPHA = 2;       // mean = 0.5, variance moderate
const PRIOR_BETA  = 2;
const Z_SCORE     = 1.96;    // 95% lower confidence bound
// Half-life for time decay, in number of subsequent observations.
// After HALF_LIFE_OBS more observations, an old observation contributes 1/2.
const HALF_LIFE_OBS = 50;
const DECAY_PER_OBS = Math.pow(0.5, 1 / HALF_LIFE_OBS); // ≈ 0.9862

export interface ActionRow {
  action_id: string;
  agent_id: string;
  category: string;
  action: string;
  irreversibility: string;
  routed_to: string | null;
  verdict: string | null;
  score: number | null;
  why: string | null;
  effect_path: string | null;
  created_at: string;
}

export class Store {
  private db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrateTrust();
  }

  // Lightweight forward-migration for stores created on the v0 trust schema
  // (just `score`, `n`). Adds alpha/beta/last_worth columns and seeds them
  // from the cumulative-average state so existing trust isn't lost.
  private migrateTrust(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(trust)`)
      .all() as Array<{ name: string }>;
    const has = (name: string) => cols.some((c) => c.name === name);
    const run = (sql: string) => this.db.prepare(sql).run();
    if (!has("alpha")) {
      run(`ALTER TABLE trust ADD COLUMN alpha REAL NOT NULL DEFAULT ${PRIOR_ALPHA}`);
    }
    if (!has("beta")) {
      run(`ALTER TABLE trust ADD COLUMN beta  REAL NOT NULL DEFAULT ${PRIOR_BETA}`);
    }
    if (!has("last_worth")) {
      run(`ALTER TABLE trust ADD COLUMN last_worth REAL`);
    }
    // Seed alpha/beta from the legacy (score, n) for any rows that still
    // have prior defaults — pretend the average represents n weighted obs.
    this.db
      .prepare(
        `UPDATE trust
            SET alpha = ${PRIOR_ALPHA} + score * n,
                beta  = ${PRIOR_BETA}  + (1 - score) * n
          WHERE alpha = ${PRIOR_ALPHA} AND beta = ${PRIOR_BETA} AND n > 0`,
      )
      .run();
  }

  insertAction(row: ActionRow): void {
    this.db
      .prepare(
        `INSERT INTO actions
         (action_id, agent_id, category, action, irreversibility,
          routed_to, verdict, score, why, effect_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.action_id,
        row.agent_id,
        row.category,
        row.action,
        row.irreversibility,
        row.routed_to,
        row.verdict,
        row.score,
        row.why,
        row.effect_path,
        row.created_at,
      );
  }

  getAction(actionId: string): ActionRow | undefined {
    return this.db
      .prepare(`SELECT * FROM actions WHERE action_id = ?`)
      .get(actionId) as ActionRow | undefined;
  }

  insertOutcome(o: {
    action_id: string;
    success: boolean;
    capability?: number;
    quality?: number;
    impact?: number;
    worth: number;
    notes?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO outcomes
         (action_id, success, capability, quality, impact, worth, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        o.action_id,
        o.success ? 1 : 0,
        o.capability ?? null,
        o.quality ?? null,
        o.impact ?? null,
        o.worth,
        o.notes ?? null,
        new Date().toISOString(),
      );
  }

  // Trust score: lower confidence bound of a Beta-Bernoulli posterior
  // with time-decayed evidence. Conservative for new categories (small n
  // → wide CI → low score), stable for proven ones (large n → tight CI
  // → score ≈ mean), and capable of changing direction (decay weights
  // recent observations more than ancient ones).
  getTrust(category: string): TrustView {
    const row = this.db
      .prepare(
        `SELECT score, n, alpha, beta, last_worth FROM trust WHERE category = ?`,
      )
      .get(category) as
      | { score: number; n: number; alpha: number; beta: number; last_worth: number | null }
      | undefined;
    if (!row) {
      return {
        score: lcb(PRIOR_ALPHA, PRIOR_BETA),
        mean: PRIOR_ALPHA / (PRIOR_ALPHA + PRIOR_BETA),
        confidence: 1 - lcbHalfWidth(PRIOR_ALPHA, PRIOR_BETA),
        n: 0,
        alpha: PRIOR_ALPHA,
        beta: PRIOR_BETA,
      };
    }
    return {
      score: row.score,
      mean: row.alpha / (row.alpha + row.beta),
      confidence: 1 - lcbHalfWidth(row.alpha, row.beta),
      n: row.n,
      alpha: row.alpha,
      beta: row.beta,
    };
  }

  updateTrust(category: string, worth: number): { before: number; after: number } {
    const cur = this.getTrust(category);
    const w = clamp01(worth);

    // Decay all prior evidence toward the prior. This makes "stale trust"
    // a non-issue — categories that haven't been observed recently drift
    // back toward the uniform prior.
    const decayedAlpha = (cur.alpha - PRIOR_ALPHA) * DECAY_PER_OBS + PRIOR_ALPHA;
    const decayedBeta  = (cur.beta  - PRIOR_BETA ) * DECAY_PER_OBS + PRIOR_BETA;

    // Apply this observation. worth in [0,1] decomposes as w successes,
    // (1-w) failures — the standard continuous Bernoulli interpretation.
    const newAlpha = decayedAlpha + w;
    const newBeta  = decayedBeta  + (1 - w);
    const newScore = lcb(newAlpha, newBeta);
    const newN     = cur.n + 1;

    this.db
      .prepare(
        `INSERT INTO trust (category, score, n, alpha, beta, last_worth, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(category) DO UPDATE SET
           score      = excluded.score,
           n          = excluded.n,
           alpha      = excluded.alpha,
           beta       = excluded.beta,
           last_worth = excluded.last_worth,
           updated_at = excluded.updated_at`,
      )
      .run(category, newScore, newN, newAlpha, newBeta, w, new Date().toISOString());
    return { before: cur.score, after: newScore };
  }

  updateActionVerdict(
    actionId: string,
    verdict: Verdict,
    score: number,
    why: string,
    effectPath: string,
    routedTo: string,
  ): void {
    this.db
      .prepare(
        `UPDATE actions
         SET verdict = ?, score = ?, why = ?, effect_path = ?, routed_to = ?
         WHERE action_id = ?`,
      )
      .run(verdict, score, why, effectPath, routedTo, actionId);
  }

  recentActions(limit = 10): ActionRow[] {
    return this.db
      .prepare(`SELECT * FROM actions ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as ActionRow[];
  }

  pendingApprovals(): ActionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM actions
         WHERE verdict IN ('supervised', 'escalate')
         ORDER BY created_at DESC`,
      )
      .all() as ActionRow[];
  }

  trustScores(): Array<TrustView & { category: string }> {
    const rows = this.db
      .prepare(
        `SELECT category, score, n, alpha, beta FROM trust ORDER BY n DESC`,
      )
      .all() as Array<{
        category: string;
        score: number;
        n: number;
        alpha: number;
        beta: number;
      }>;
    return rows.map((r) => ({
      category: r.category,
      score: r.score,
      mean: r.alpha / (r.alpha + r.beta),
      confidence: 1 - lcbHalfWidth(r.alpha, r.beta),
      n: r.n,
      alpha: r.alpha,
      beta: r.beta,
    }));
  }

  close(): void {
    this.db.close();
  }
}

// ── Bayesian helpers ────────────────────────────────────────────────────
// Beta-Bernoulli posterior:
//   mean   = α / (α+β)
//   var    = αβ / ((α+β)² · (α+β+1))
//   stddev = sqrt(var)
//   LCB    = max(0, mean − Z · stddev)
//
// LCB (lower confidence bound) is what gates use as the trust score.
// Conservative for new categories (small α+β → wide CI → small LCB),
// asymptotic to mean for proven ones (large α+β → tight CI → LCB ≈ mean).

export interface TrustView {
  score: number;       // lower confidence bound, 0..1 — what the gate consumes
  mean: number;        // posterior mean, 0..1
  confidence: number;  // 1 - half_width, 0..1 — narrow CI ⇒ high confidence
  n: number;
  alpha: number;
  beta: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function lcb(alpha: number, beta: number): number {
  const mean = alpha / (alpha + beta);
  return clamp01(mean - lcbHalfWidth(alpha, beta));
}

function lcbHalfWidth(alpha: number, beta: number): number {
  const sum = alpha + beta;
  const variance = (alpha * beta) / (sum * sum * (sum + 1));
  return Z_SCORE * Math.sqrt(variance);
}
