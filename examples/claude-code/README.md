# agent-os + Claude Code — 5-minute integration

Shows you how to wire `agent-os` into Claude Code as an MCP server, then watch
trust scores evolve as a real agent submits real actions.

By the end, you'll have:

- `agent-os` running as an MCP server inside Claude Code
- Four supervision tools available to Claude (`submit_action`, `record_outcome`,
  `get_routing`, `recover`)
- A live trust score per action category that you can inspect at any time

---

## Step 1 — Install (30 seconds)

```bash
npm install -g @reaves-labs/agent-os
```

You now have two binaries on `$PATH`:

- `agent-os` — CLI for inspecting state, submitting actions, listing queues
- `agent-os-mcp` — stdio MCP server for agent runtimes

Quick sanity check:

```bash
agent-os status
# → { "workdir": "/Users/you/.agent-os", "recent": [], "pendingCount": 0, "trust": [] }
```

## Step 2 — Pick a supervisor backend (30 seconds)

The supervisor is the LLM that grades proposed actions. Pick whichever you
already have running:

```bash
# Free local — no key, no network. Recommended for first run.
ollama pull llama3.2
export AGENT_OS_SUPERVISOR=ollama

# Or any of these:
# export AGENT_OS_SUPERVISOR=anthropic    # uses ANTHROPIC_API_KEY
# export AGENT_OS_SUPERVISOR=openai       # uses OPENAI_API_KEY
# export AGENT_OS_SUPERVISOR=generic      # AGENT_OS_BASE_URL + AGENT_OS_API_KEY
```

If you don't set the env var, agent-os auto-detects in order:
`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama at `localhost:11434`.

## Step 3 — Wire it into Claude Code (1 minute)

Add this to your project's `.mcp.json` (project-scoped) or
`~/.claude/mcp.json` (user-scoped):

```json
{
  "mcpServers": {
    "agent-os": {
      "command": "agent-os-mcp",
      "env": {
        "AGENT_OS_SUPERVISOR": "ollama",
        "AGENT_OS_MODEL": "llama3.2"
      }
    }
  }
}
```

Restart Claude Code. The four tools — `submit_action`, `record_outcome`,
`get_routing`, `recover` — are now callable inside any session.

## Step 4 — Have Claude Code submit a real action (30 seconds)

In a Claude Code session, ask:

> "Use the agent-os submit_action tool to check whether you should send an
> email to my team about the deploy. Category 'send_email', irreversibility
> 'external'."

Claude calls the MCP tool, agent-os routes the action to the right role,
asks the supervisor for a verdict, applies the irreversibility floor, and
returns:

```json
{
  "actionId": "9c3f0c40-…",
  "verdict": "supervised",
  "score": 0.84,
  "why": "External communication — should be reviewed before send",
  "routedTo": "writer",
  "effectPath": "/Users/you/.agent-os/queues/approval/2026...send-email-deploy.md",
  "trustScoreAfter": 0.06
}
```

Two things to notice:

1. **`verdict: "supervised"`**, not `auto` — the irreversibility floor
   downgraded the verdict because external actions touch the outside world.
2. **`trustScoreAfter: 0.06`** — this is a brand new category. The Bayesian
   posterior starts at the prior's lower confidence bound (~0.06). Claude
   has to *earn* auto-execute over time.

## Step 5 — Report outcomes and watch trust evolve (90 seconds)

After the email is actually sent (or skipped, or whatever), have Claude
report back:

> "The email was sent successfully. Use record_outcome on actionId
> 9c3f0c40-…, success=true, capability=1, quality=0.9, impact=0.8."

agent-os computes `worth = capability × quality × impact = 0.72`, updates
the Beta posterior, and recomputes the lower confidence bound.

Repeat 5–10 times across different `send_email` actions. Watch the trust
score climb:

```bash
agent-os status
# → "trust": [
#      { "category": "send_email", "score": 0.41, "n": 5,  "alpha": 5.6, "beta": 3.4 },
#      { "category": "post_pr",    "score": 0.18, "n": 1,  "alpha": 2.7, "beta": 2.3 }
#    ]
```

After ~20 consistent good outcomes for `send_email`, the score crosses
0.7 — and now the gate stops downgrading auto verdicts to supervised for
that category. **Claude has earned trust.**

## Step 6 — Inspect the approval queue

Anything that didn't auto-execute lands as a markdown file at
`~/.agent-os/queues/approval/`:

```bash
ls ~/.agent-os/queues/approval/
# 20260507-152333-writer-send-email-deploy.md
# 20260507-152941-code-rm-rf-build-dir.md
```

Each file has the verdict, score, why, prompt, and proposed response.
Approve manually by moving the file out, or write a watcher that pages you.

---

## Why this is different from Claude Code's built-in permissions

Claude Code already has tool-level allow/deny permissions and hooks. Those
are static rules ("allow `Read`, deny `Bash` unless I confirm"). agent-os
adds a **dynamic, learning** layer:

| Concern | Claude Code permissions | agent-os |
|---|---|---|
| Should this *type* of tool run? | Yes — by allowlist | Yes — by routing |
| Should *this specific instance* run? | Hooks can intercept | Verdict + score |
| Has this kind of action been safe before? | Not tracked | Trust score per category |
| Can the LLM override the safety floor? | Yes (hook can be ignored) | **No — `gate()` is pure** |
| What happens when an action fails? | Error returned | `recover()` returns a structured plan |

You can use both together. Permissions decide *which tools exist*; agent-os
decides *whether to fire any specific call to those tools*.

---

## What to do next

- **Read [the trust-score upgrade notes](../../README.md#how-verdicts-work)** —
  the LCB-as-trust math is what makes "earn auto-execute" actually work.
- **Look at [examples/library-use.ts](../library-use.ts)** if you want to
  embed agent-os directly in your own Node code instead of via MCP.
- **Review [SECURITY.md](../../SECURITY.md)** before exposing
  `agent-os-mcp` to untrusted agents.

## Troubleshooting

**`Cannot find module 'agent-os-mcp'`** — install with `-g`, or use the full
path: `command: "/path/to/node_modules/.bin/agent-os-mcp"`.

**Verdicts always come back `supervised`/`escalate`** — your supervisor
backend isn't reachable. Check `OLLAMA_URL`, `ANTHROPIC_API_KEY`, etc.
agent-os defaults to `verdict: supervised, score: 0.5` when the supervisor
errors — safer than failing open.

**Trust scores aren't moving** — make sure you're calling `record_outcome`
after every `submit_action`. Without outcomes, trust never updates.
