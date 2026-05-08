# @reaves-labs/agent-os

> Ship agents that don't go off the rails.

**A drop-in MCP supervisor that gates every agent action with a verdict — `auto` / `supervised` / `escalate` — and a per-category trust score that rises and falls based on observed outcomes, so risky categories stay held back while proven ones run unattended.** The safety floor is a *pure deterministic function*: irreversibility (wire money, delete prod, post publicly) always escalates, even when the supervisor LLM is 99% confident it's fine.

> [!IMPORTANT]
> **2026-05-07 — Source-available preview (Phase 1).**
> The code is here for evaluation, transparency, and validation. **Pull requests and public issues are not yet accepted** — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the phased OSS plan and [`SECURITY.md`](./SECURITY.md) for vulnerability reports.

**LLM-agnostic.** Swap Anthropic, OpenAI, Ollama, or any OpenAI-compatible
endpoint (Groq, Together, vLLM, llama.cpp) with one env var. Persists to
SQLite, writes auto-execute actions to a filesystem outbox, queues risky
ones for human approval.

This is the reference implementation of YC RFS #04 (Company Brain) and
\#12 (Software for Agents): machine-native paths, permissions, recovery.

---

## Install

```bash
npm install -g @reaves-labs/agent-os
```

## CLI in 30 seconds

```bash
# Submit an action — supervisor decides verdict
agent-os submit send_email "Email Jane the Q3 deck" --irreversibility=external

# Outcome reporting moves the trust score for the category
agent-os outcome <actionId> true --capability=1 --quality=0.85 --impact=0.7

# Inspect state (recent actions, pending approvals, trust scores)
agent-os status

# Or run as an MCP server on stdio
agent-os serve
```

## Pick a supervisor backend

The "supervisor" is whichever LLM you want grading proposed actions and
returning verdicts. agent-os doesn't care which — it's a decision-maker
role, not a brand. Pick the one whose latency, cost, and quality fit the
risk profile of your agent:

- **Ollama** — free, local, no network. Best default for development and
  for any agent supervising irreversible actions where you don't want
  prompts leaving the machine.
- **Anthropic** — strongest verdict quality at production cost. Best when
  the supervisor's "why" matters because a human will read it.
- **OpenAI** — fast, cheap with `gpt-4o-mini`. Best for high-volume,
  low-stakes supervision.
- **Generic** — anything OpenAI-compatible (Groq for ~10× faster, vLLM
  for self-hosted, Together / llama.cpp for whatever fits your infra).

```bash
export AGENT_OS_SUPERVISOR=ollama       # free local (default fallback)
export AGENT_OS_SUPERVISOR=anthropic    # ANTHROPIC_API_KEY
export AGENT_OS_SUPERVISOR=openai       # OPENAI_API_KEY
export AGENT_OS_SUPERVISOR=generic      # AGENT_OS_BASE_URL + AGENT_OS_API_KEY
```

If you don't set the env var, agent-os auto-detects in order:
`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama at `localhost:11434`.

## Wire it into an MCP client

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "agent-os": {
      "command": "agent-os-mcp",
      "env": {
        "AGENT_OS_SUPERVISOR": "ollama"
      }
    }
  }
}
```

📖 **Full 5-minute walkthrough:** [examples/claude-code/README.md](./examples/claude-code/README.md) — install → wire up → submit a real action → watch the trust score evolve.

### Cursor

Same shape, in `~/.cursor/mcp.json`.

### Anything else that speaks MCP

`agent-os-mcp` runs as a stdio MCP server — point any compliant client at it.

## How does this compare to NeMo Guardrails / Guardrails AI / AgentOps?

Honest comparison with no hand-waving: [docs/COMPARE.md](./docs/COMPARE.md).
Tells you exactly when to pick agent-os and when to pick the alternatives.

---

## The four MCP tools

These are the four things your agent can call. Two are part of every
turn (`submit_action` + `record_outcome`); two are situational (`get_routing`
when you want a routing suggestion, `recover` when an action fails).

### `submit_action` — *"I want to do X. Should I?"*

Your agent describes a proposed action and gets back a verdict. agent-os
routes it to the right role, asks the supervisor to grade it, applies the
irreversibility floor, persists the decision, and writes the action to
either the outbox (`auto`) or the approval queue (`supervised` / `escalate`).

| input | type | description |
|---|---|---|
| `agentId` | string | who's calling |
| `category` | string | trust scores accrue per category |
| `action` | string | plain-English description |
| `irreversibility` | `reversible` \| `external` \| `irreversible` | safety floor |
| `context` | string? | optional extra context |

Returns: `{ actionId, verdict, score, why, routedTo, effectPath, trustScoreAfter }`.

- **`auto`** → file written to `~/.agent-os/outbox/<role>/` — execute it
- **`supervised`** or **`escalate`** → file queued at `~/.agent-os/queues/approval/` — wait for human approval

### `record_outcome` — *"It worked / it didn't."*

After the action actually runs, your agent reports the result. agent-os
computes `worth = capability × quality × impact` and updates the trust
score for that category. Without outcomes, trust never moves — so the
agent never earns auto-execute, and proven categories never get rewarded.
**Always pair `submit_action` with `record_outcome`.**

| input | type | description |
|---|---|---|
| `actionId` | string | from submit_action |
| `success` | boolean | did the execution succeed? |
| `capability` | 0..1 | did the output exist? |
| `quality` | 0..1 | was it good? |
| `impact` | 0..1 | did it produce value? |
| `notes` | string? | freeform |

Returns: `{ worth, trustScoreBefore, trustScoreAfter, category }`.

### `get_routing` — *"Which role should handle this?"*

Hand it a free-text description; get back a role recommendation
(`writer`, `code`, `analyst`, etc.) plus a confidence. Useful when your
agent needs to dispatch work but doesn't already know which sub-agent
should own it. Most callers don't need this — `submit_action` does its
own routing internally.

### `recover` — *"This action failed. What now?"*

Submit a failed `actionId` plus the error. The supervisor returns a
structured plan — retry with different inputs, rollback what happened,
or escalate to a human. Designed so your agent doesn't have to invent a
recovery strategy on the fly.

---

## Library use

If you'd rather embed agent-os directly in your own Node code than run
it as an MCP server, the entire surface is one class. Same supervision,
same trust scores, same safety floor — no MCP server process required.

```ts
import { AgentOS } from "@reaves-labs/agent-os";

const os = new AgentOS({
  supervisor: { backend: "ollama", model: "llama3.2" },
  workdir: "./.agent-os",
});

// Your agent proposes an action — gets back a verdict
const verdict = await os.submit({
  agentId: "trader-7",
  category: "place_trade",
  action: "Open $200 BTC long at market",
  irreversibility: "irreversible",
});
// verdict.verdict === "escalate"  (irreversibility floor — even if
// the supervisor LLM said "auto/0.99", the gate forces escalation)

// After the action actually runs (or doesn't), report back
await os.recordOutcome({
  actionId: verdict.actionId,
  success: true,
  capability: 1, quality: 0.9, impact: 0.7,
});
```

This is the same code path the MCP server uses internally. Pick MCP for
multi-agent / cross-language setups; pick library for tightly-coupled
single-process Node agents.

---

## How verdicts work

Three things decide whether an action runs unattended, gets held for
review, or gets bounced back: how hard the action is to undo, how
confident the LLM is that it's safe right now, and how trustworthy
this *kind* of action has been historically.

**1. The safety floor — risk of undoing.** Every action is tagged
with one of three reversibility levels:

- `reversible` — file write, draft email, scratch directory ops; anything you could `Ctrl-Z`
- `external` — anything visible to the outside world (post a tweet, send an email, charge a card)
- `irreversible` — wire money, delete production, fire someone

Irreversible actions **always escalate**, no matter how confident the
LLM is. External actions get bumped from `auto` down to `supervised`
even if the LLM says they look fine. This is the load-bearing safety
property: the LLM is an *advisor*, not the decision-maker. Confidence
cannot override category.

**2. The verdict — LLM's read on this specific request.** The
supervisor returns a verdict (`auto` / `supervised` / `escalate`) and
a confidence score (0–1). Below 0.5, we escalate even reversible
actions. Between 0.5 and 0.8, the strongest verdict we trust is
"supervised." At 0.8 and above, we accept the LLM's verdict directly
(but the irreversibility floor still applies — an irreversible action
at 0.99 still escalates).

**3. Trust score — has this *kind* of action been trustworthy
before?** For each category (`send_email`, `wire_money`, `commit_pr`,
etc.) we track how well past actions of that kind turned out. New
categories start at low trust (~0.06) — you *earn* auto-execute by
recording good outcomes. Bad outcomes pull the score down; old
outcomes decay, so a category that was reliable six months ago and
flaky now is treated as flaky.

The complete decision rule, in code:

```
irreversibility="irreversible"               →  always "escalate"
irreversibility="external" + verdict="auto"  →  downgrade to "supervised"
score < 0.5                                  →  "escalate"
score < 0.8                                  →  "supervised"
score >= 0.8                                 →  whatever the LLM said
```

**For the math.** The trust score is the *lower confidence bound* of
a Beta-Bernoulli posterior over per-category outcomes, with a (α=2, β=2)
uniform-ish prior and time-decayed evidence (50-observation half-life).
Variance penalty is z=1.96 (95% LCB). See [`src/store.ts`](./src/store.ts)
for the exact update rule and [`test/e2e.test.mjs`](./test/e2e.test.mjs)
for the behavioral invariants the math has to satisfy (conservative
start, LCB asymptote, decay-driven drop, uncertainty penalty).

---

## Why not just use a guardrails library?

Most guardrails libraries (NeMo Guardrails, Guardrails AI, Llama Guard)
make a *pass/fail decision per call* against rules you wrote up front.
That works — but it's stateless: every call is graded fresh, with no
memory of how this kind of action has gone before, and the LLM is in
the safety decision (which means a confident-but-wrong LLM can talk
itself past the rule). agent-os is built around the opposite shape:

| Guardrails libs | agent-os |
|---|---|
| Static rules per call | Per-category trust scores that compound |
| Pass/fail at inference time | Three-axis verdict (auto / supervised / escalate) |
| No memory across actions | SQLite memory of every action and outcome |
| No notion of irreversibility | Irreversibility floor: irreversible always escalates |
| Raw errors on failure | Structured recovery plans |

Many production stacks use both. Guardrails libraries to validate the
*content* of an LLM's output ("is this JSON valid, does it leak PII");
agent-os to gate *whether the resulting action runs* ("we've seen 50
bad outcomes from this category lately — hold this one for review").
See [`docs/COMPARE.md`](./docs/COMPARE.md) for the full head-to-head.

---

## License

MIT © Reaves Labs and Learning, LLC
