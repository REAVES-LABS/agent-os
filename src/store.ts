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

CREATE TABLE IF NOT EXISTS trust (
  category     TEXT PRIMARY KEY,
  score        REAL NOT NULL,
  n            INTEGER NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_action ON outcomes(action_id);
CREATE INDEX IF NOT EXISTS idx_actions_category ON actions(category);
`;

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

  // Trust score: rolling average of worth per category. Floor 0, cap 1.
  // n keeps the average from being yanked by a single outlier outcome.
  getTrust(category: string): { score: number; n: number } {
    const row = this.db
      .prepare(`SELECT score, n FROM trust WHERE category = ?`)
      .get(category) as { score: number; n: number } | undefined;
    return row ?? { score: 0.5, n: 0 };
  }

  updateTrust(category: string, worth: number): { before: number; after: number } {
    const cur = this.getTrust(category);
    const n = cur.n + 1;
    const after = Math.max(0, Math.min(1, (cur.score * cur.n + worth) / n));
    this.db
      .prepare(
        `INSERT INTO trust (category, score, n, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(category) DO UPDATE SET
           score = excluded.score,
           n     = excluded.n,
           updated_at = excluded.updated_at`,
      )
      .run(category, after, n, new Date().toISOString());
    return { before: cur.score, after };
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

  trustScores(): Array<{ category: string; score: number; n: number }> {
    return this.db
      .prepare(`SELECT category, score, n FROM trust ORDER BY n DESC`)
      .all() as Array<{ category: string; score: number; n: number }>;
  }

  close(): void {
    this.db.close();
  }
}
