// End-to-end behavioral test for the supervision loop.
//
// Covers the four invariants users actually care about:
//   1. submit_action returns a verdict and persists state
//   2. record_outcome moves the per-category trust score
//   3. The irreversibility floor cannot be overridden by a confident LLM
//   4. The pure gate() function honors all branch conditions
//
// Uses node:test (Node 20+) so we add zero dependencies. The supervisor
// is stubbed — every test runs in <500ms and is fully deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AgentOS, SupervisionEngine } from "../dist/index.js";

// ── stub supervisor ───────────────────────────────────────────────────────
// Returns a single JSON blob that satisfies BOTH routing and verification
// shapes (the engine extracts only the keys it needs for each call).

function stubSupervisor(canned) {
  return {
    id: "stub",
    async chat() {
      return { content: JSON.stringify(canned), model: "stub" };
    },
  };
}

const HAPPY_PATH = {
  // routing
  role: "writer",
  confidence: 0.9,
  // verification
  verdict: "auto",
  score: 0.9,
  why: "looks fine",
};

function freshWorkdir() {
  return mkdtempSync(join(tmpdir(), "agent-os-test-"));
}

// ──────────────────────────────────────────────────────────────────────────
// 1. submit returns a verdict and persists state
// ──────────────────────────────────────────────────────────────────────────

test("submit() returns a verdict and assigns an actionId", async (t) => {
  const workdir = freshWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));

  const os = new AgentOS({ workdir, supervisor: stubSupervisor(HAPPY_PATH) });
  const r = await os.submit({
    agentId: "test-agent",
    category: "send_email",
    action: "Send a routine status email",
    irreversibility: "reversible",
  });

  assert.equal(r.verdict, "auto");
  assert.equal(r.score, 0.9);
  assert.match(r.actionId, /^[0-9a-f-]{36}$/);
  assert.equal(r.routedTo, "writer");
  assert.ok(r.effectPath, "effectPath should be set");
});

// ──────────────────────────────────────────────────────────────────────────
// 2. record_outcome updates the per-category trust score
// ──────────────────────────────────────────────────────────────────────────

test("recordOutcome() moves the trust score and computes worth = c·q·i", async (t) => {
  const workdir = freshWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));

  const os = new AgentOS({ workdir, supervisor: stubSupervisor(HAPPY_PATH) });
  const submitted = await os.submit({
    agentId: "test-agent",
    category: "send_email",
    action: "Send a routine status email",
    irreversibility: "reversible",
  });

  const outcome = await os.recordOutcome({
    actionId: submitted.actionId,
    success: true,
    capability: 1,
    quality: 0.9,
    impact: 0.8,
  });

  // worth = capability * quality * impact
  assert.equal(outcome.worth, 1 * 0.9 * 0.8);
  assert.equal(outcome.category, "send_email");
  assert.ok(
    outcome.trustScoreAfter > outcome.trustScoreBefore,
    `expected trust to rise after a high-worth outcome (before=${outcome.trustScoreBefore} after=${outcome.trustScoreAfter})`,
  );
});

// ──────────────────────────────────────────────────────────────────────────
// 3. The irreversibility floor cannot be overridden by a confident LLM
//    This is the load-bearing safety invariant of the entire library.
// ──────────────────────────────────────────────────────────────────────────

test("irreversibility=irreversible always escalates, even when supervisor says auto/0.99", async (t) => {
  const workdir = freshWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));

  // Adversarial supervisor: maximally confident "looks safe" verdict.
  const os = new AgentOS({
    workdir,
    supervisor: stubSupervisor({
      role: "code",
      confidence: 1.0,
      verdict: "auto",
      score: 0.99,
      why: "this is totally fine, ship it",
    }),
  });

  const r = await os.submit({
    agentId: "test-agent",
    category: "wire_money",
    action: "Wire $50k to a new vendor",
    irreversibility: "irreversible",
  });

  assert.equal(
    r.verdict,
    "escalate",
    "irreversibility floor must override even a confident auto verdict",
  );
});

test("irreversibility=external downgrades auto to supervised", async (t) => {
  const workdir = freshWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));

  const os = new AgentOS({ workdir, supervisor: stubSupervisor(HAPPY_PATH) });
  const r = await os.submit({
    agentId: "test-agent",
    category: "post_tweet",
    action: "Post a routine product update",
    irreversibility: "external",
  });

  assert.equal(r.verdict, "supervised");
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Pure gate() function — every branch
// ──────────────────────────────────────────────────────────────────────────

test("gate() honors every documented branch", () => {
  const engine = new SupervisionEngine({ supervisor: stubSupervisor({}) });

  // Irreversibility floor — strongest rule
  assert.equal(engine.gate("auto", 0.99, "irreversible"), "escalate");
  assert.equal(engine.gate("supervised", 0.99, "irreversible"), "escalate");

  // External + auto → supervised
  assert.equal(engine.gate("auto", 0.9, "external"), "supervised");
  // External + already-supervised stays supervised
  assert.equal(engine.gate("supervised", 0.9, "external"), "supervised");

  // Reversible, low score → escalate
  assert.equal(engine.gate("auto", 0.4, "reversible"), "escalate");
  assert.equal(engine.gate("supervised", 0.4, "reversible"), "escalate");

  // Reversible, mid score, auto → downgraded to supervised
  assert.equal(engine.gate("auto", 0.7, "reversible"), "supervised");
  // Reversible, mid score, already supervised → stays supervised
  assert.equal(engine.gate("supervised", 0.7, "reversible"), "supervised");

  // Reversible, high score → trust the LLM verdict as-is
  assert.equal(engine.gate("auto", 0.85, "reversible"), "auto");
  assert.equal(engine.gate("supervised", 0.85, "reversible"), "supervised");
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Bayesian trust math — the load-bearing differentiator vs naive averages
// ──────────────────────────────────────────────────────────────────────────

import { Store } from "../dist/store.js";

function freshStore() {
  const workdir = freshWorkdir();
  return { store: new Store(`${workdir}/state.db`), workdir };
}

test("new categories start conservative — earn trust before auto-execute", () => {
  const { store, workdir } = freshStore();
  try {
    const t = store.getTrust("brand_new_category");
    // Naive average would say 0.5. Bayesian LCB with prior(2,2) is ≈ 0.06.
    // The whole point: a new category is NOT trusted by default.
    assert.ok(t.score < 0.2, `expected conservative LCB <0.2, got ${t.score}`);
    assert.equal(t.n, 0);
    assert.equal(t.alpha, 2);
    assert.equal(t.beta, 2);
    // Mean is 0.5 (uniform-ish prior) but the LCB the gate sees is ≪ mean.
    assert.equal(t.mean, 0.5);
    assert.ok(t.confidence < 0.6, `confidence should be low for prior, got ${t.confidence}`);
  } finally {
    store.close();
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("trust climbs but stays below the mean as n grows (LCB asymptote)", () => {
  const { store, workdir } = freshStore();
  try {
    // 100 high-worth outcomes for the same category. Decay brings the
    // effective n to ~50 (half-life), so steady-state α≈67, β≈9.
    for (let i = 0; i < 100; i++) store.updateTrust("ship_pr", 0.9);
    const t = store.getTrust("ship_pr");
    // Mean approaches 0.88 (decay-weighted average of 0.9 outcomes).
    assert.ok(t.mean > 0.85, `mean should approach 0.9 minus decay drift, got ${t.mean}`);
    assert.ok(t.score < t.mean, "LCB must be ≤ mean");
    // LCB should be substantially higher than the prior LCB (~0.06)
    // — proving consistent good outcomes lift the gate-visible score.
    assert.ok(t.score > 0.75, `LCB should be ≫ prior after 100 good outcomes, got ${t.score}`);
    assert.ok(t.confidence > 0.9, `confidence should be high, got ${t.confidence}`);
  } finally {
    store.close();
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("recent bad outcomes pull trust down (decay actually decays)", () => {
  const { store, workdir } = freshStore();
  try {
    // Establish strong trust
    for (let i = 0; i < 100; i++) store.updateTrust("send_email", 0.95);
    const high = store.getTrust("send_email");

    // Now hit it with a stretch of bad outcomes
    for (let i = 0; i < 20; i++) store.updateTrust("send_email", 0.05);
    const after = store.getTrust("send_email");

    assert.ok(
      after.score < high.score - 0.15,
      `bad outcomes should drop score by >0.15, was ${high.score} → ${after.score}`,
    );
  } finally {
    store.close();
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("uncertainty penalty: small-n category gets meaningfully less trust than large-n", () => {
  const { store, workdir } = freshStore();
  try {
    // Both observe worth=0.85 every time, but rare has only 3 obs, common has 50.
    // The Beta(2,2) prior pulls a small-n posterior toward 0.5, AND the LCB
    // half-width is much wider with less data. Both effects penalize uncertainty.
    for (let i = 0; i < 3; i++) store.updateTrust("rare_action", 0.85);
    for (let i = 0; i < 50; i++) store.updateTrust("common_action", 0.85);

    const rare = store.getTrust("rare_action");
    const common = store.getTrust("common_action");

    // The score gap should be substantial — this is the whole point of the upgrade.
    // A naive cumulative average would give them similar trust scores.
    assert.ok(
      common.score > rare.score + 0.1,
      `common (n=50) trust should exceed rare (n=3) by >0.1, got ${rare.score.toFixed(3)} vs ${common.score.toFixed(3)}`,
    );
    // Confidence (1 - half-width) should also be higher for the common category.
    assert.ok(
      common.confidence > rare.confidence + 0.1,
      `common confidence should exceed rare by >0.1, got ${rare.confidence.toFixed(3)} vs ${common.confidence.toFixed(3)}`,
    );
    // And the mean for rare is dragged toward the prior (0.5) while common's mean is closer to 0.85.
    assert.ok(rare.mean < common.mean, "small-n mean is pulled toward prior 0.5");
  } finally {
    store.close();
    rmSync(workdir, { recursive: true, force: true });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Graceful fallback — supervisor failure shouldn't crash the engine
// ──────────────────────────────────────────────────────────────────────────

test("supervisor errors degrade to verdict=supervised, not crash", async (t) => {
  const workdir = freshWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));

  const os = new AgentOS({
    workdir,
    supervisor: {
      id: "broken",
      async chat() {
        throw new Error("network unreachable");
      },
    },
  });

  // The engine catches the chat() error and returns a fallback verdict.
  // route() doesn't have the same try/catch — it'll throw and surface.
  // We test verify()'s fallback by constructing the engine directly.
  const engine = new SupervisionEngine({
    supervisor: {
      id: "broken",
      async chat() {
        throw new Error("network unreachable");
      },
    },
  });
  const v = await engine.verify("prompt", "response", "reversible");
  assert.equal(v.verdict, "supervised");
  assert.equal(v.score, 0.5);
  assert.match(v.why, /verifier unavailable/);
});
