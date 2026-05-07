# @reaves-labs/agent-os

> Ship agents that don't go off the rails.

> [!IMPORTANT]
> **2026-05-07 — Source-available preview (Phase 1).**
> The code is here for evaluation, transparency, and validation. **Pull requests and public issues are not yet accepted** — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the phased OSS plan and [`SECURITY.md`](./SECURITY.md) for vulnerability reports.

A drop-in supervision layer for AI agents. Speaks **MCP**. **LLM-agnostic** —
swap Anthropic, OpenAI, Ollama, or any OpenAI-compatible endpoint with one
env var. Persists to SQLite, writes to a filesystem outbox, queues risky
actions for human approval.

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

### Cursor

Same shape, in `~/.cursor/mcp.json`.

### Anything else that speaks MCP

`agent-os-mcp` runs as a stdio MCP server — point any compliant client at it.

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

The verifier scores three axes plus an overall score, and the engine
applies an irreversibility floor that the LLM can't override:

```
irreversibility="irreversible"  →  always "escalate"
irreversibility="external" + verdict="auto"  →  downgrade to "supervised"
score < 0.5  →  "escalate"
score < 0.8  →  "supervised"
score >= 0.8  →  whatever the LLM said (auto / supervised)
```

Trust scores per category are a rolling average of `worth = c × q × i`.
`n` keeps a single bad outcome from yanking a stable category off the floor.

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
