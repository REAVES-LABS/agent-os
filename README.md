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

The supervisor is a decision-maker, not a brand. Any LLM that can return
JSON can play the role.

```bash
export AGENT_OS_SUPERVISOR=ollama       # free local (default fallback)
export AGENT_OS_SUPERVISOR=anthropic    # ANTHROPIC_API_KEY
export AGENT_OS_SUPERVISOR=openai       # OPENAI_API_KEY
export AGENT_OS_SUPERVISOR=generic      # Groq, Together, vLLM, llama.cpp
                                        # AGENT_OS_BASE_URL + AGENT_OS_API_KEY
```

Autodetect order: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama at `localhost:11434`.

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

### `submit_action`
Agent submits a proposed action; gets back a verdict.

| input | type | description |
|---|---|---|
| `agentId` | string | who's calling |
| `category` | string | trust scores accrue per category |
| `action` | string | plain-English description |
| `irreversibility` | `reversible` \| `external` \| `irreversible` | safety floor |
| `context` | string? | optional extra context |

Returns: `{ actionId, verdict, score, why, routedTo, effectPath, trustScoreAfter }`.

- **`auto`** → file written to `~/.agent-os/outbox/<role>/`
- **`supervised`** or **`escalate`** → file queued at `~/.agent-os/queues/approval/`

### `record_outcome`
After execution, report back. capability × quality × impact = worth.

| input | type | description |
|---|---|---|
| `actionId` | string | from submit_action |
| `success` | boolean | did the execution succeed? |
| `capability` | 0..1 | did the output exist? |
| `quality` | 0..1 | was it good? |
| `impact` | 0..1 | did it produce value? |
| `notes` | string? | freeform |

Returns: `{ worth, trustScoreBefore, trustScoreAfter, category }`.

### `get_routing`
Hand a description, get a sub-agent role recommendation.

### `recover`
Submit a failed `actionId` + error, get a structured retry / rollback / escalate plan.

---

## Library use

```ts
import { AgentOS } from "@reaves-labs/agent-os";

const os = new AgentOS({
  supervisor: { backend: "ollama", model: "llama3.2" },
  workdir: "./.agent-os",
});

const verdict = await os.submit({
  agentId: "trader-7",
  category: "place_trade",
  action: "Open $200 BTC long at market",
  irreversibility: "irreversible",
});
// verdict.verdict === "escalate"  (irreversibility floor)

await os.recordOutcome({
  actionId: verdict.actionId,
  success: true,
  capability: 1, quality: 0.9, impact: 0.7,
});
```

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

| Guardrails libs | agent-os |
|---|---|
| Static rules per call | Per-category trust scores that compound |
| Pass/fail at inference time | Three-axis verdict (auto/supervised/escalate) |
| No memory across actions | SQLite memory of every action and outcome |
| No notion of irreversibility | Irreversibility floor: irreversible = always escalate |
| Raw errors on failure | Structured recovery plans |

---

## License

MIT © Reaves Labs and Learning, LLC
