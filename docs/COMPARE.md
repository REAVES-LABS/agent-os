# Honest comparison — agent-os vs the OSS agent-supervision landscape

## TL;DR

If you're building an agent and asking "should I use agent-os, NeMo Guardrails,
Guardrails AI, or AgentOps?" — here's the honest one-line answer for each:

| You should pick… | …if your priority is |
|---|---|
| **agent-os** | MCP-native integration, trust scores that compound over time, and a deterministic safety floor the LLM can't override |
| **NeMo Guardrails** (NVIDIA) | Production maturity, programmable Colang policies, deep LangChain integration |
| **Guardrails AI** | Output validation against Pydantic-style schemas, structured-output safety |
| **Llama Guard** (Meta) | Content moderation as a fine-tuned model in your inference path |
| **AgentOps** | Trace replay, cost tracking, post-hoc agent observability |
| **LangSmith** (commercial) | Polished UI, evals, deep LangChain ecosystem (paid) |

We don't claim to win everywhere. This document tells you exactly where we win,
where we lose, and when each competitor is the right choice.

---

## What "agent supervision" means and where the category boundaries are

Every project below touches the problem of *making LLM-driven agents safer*.
But the category subdivides into four distinct slots:

1. **In-loop policy gates** — block or escalate proposed actions before they fire.
   Examples: agent-os, NeMo Guardrails, Llama Guard.
2. **Output validation** — check that what the LLM produced matches a schema or
   constraint. Examples: Guardrails AI, Outlines, Instructor.
3. **Post-hoc evaluation / observability** — record what happened and grade it
   later, often with a UI. Examples: AgentOps, LangSmith, Phoenix, Helicone.
4. **Agent runtimes with built-in supervision** — frameworks that ship with their
   own approval flows baked in. Examples: LangGraph, AutoGen, CrewAI.

agent-os is firmly in slot **(1) — in-loop policy gates**, with one foot in (3)
because trust scores are persisted state.

---

## Direct competitors (in-loop gates)

### vs. **NeMo Guardrails** — github.com/NVIDIA/NeMo-Guardrails

**What using NeMo feels like:** you write rules in their custom language
(Colang) describing how the agent should behave — what topics it can
discuss, what jailbreak patterns to block, what to fall back to. Mature,
production-tested at NVIDIA, backed by a real corporation, large community.

**What using agent-os feels like instead:** you call one method per action
(`submit_action`), get a verdict back, record the outcome when it's done.
No DSL to learn. The library learns which categories are safe to trust
based on what actually happens, rather than what you said in a policy.

| Dimension | agent-os | NeMo Guardrails |
|---|---|---|
| Policy expressiveness | Verdicts + irreversibility tags | Full Colang DSL — programmable rails, dialog flows, fact-checking, jailbreak detection |
| Trust score per category | ✅ Beta-Bernoulli posterior with decay | ❌ Stateless rules |
| MCP-native | ✅ stdio MCP server out of the box | ❌ Python library, no MCP integration |
| Languages | TypeScript / Node | Python only |
| Tarball size | 23.5 KB | Large Python package |
| LLM-agnostic | ✅ 4 backends, easy to add more | ✅ supports many providers |
| Production case studies | BLOOM (one) | NVIDIA + many enterprise users |
| Documentation depth | RC-stage | Years of docs, books, talks |
| Pure deterministic safety floor | ✅ `gate()` is pure | ⚠ Colang rules can be LLM-evaluated |

**When to use NeMo:** You're building in Python, you need expressive policy
DSL with conversational flows, you want deep enterprise integration paths.

**When to use agent-os:** You're in Node, you speak MCP, you want trust that
compounds over time, you want a *small* primitive rather than a large
framework.

**Honest:** NeMo will likely win on adoption forever. We can win on a niche.

### vs. **Guardrails AI** — github.com/guardrails-ai/guardrails

**What using Guardrails AI feels like:** you wrap your LLM call with
schema-style validators that check the *output* before passing it
downstream — "is this valid JSON," "does this match a Pydantic schema,"
"is the answer free of PII." If a check fails, you can re-ask the LLM.

**What using agent-os feels like instead:** you don't gate the *output*,
you gate the *action* the agent wants to take with it. Same neighborhood,
different problem. Many teams use both — Guardrails AI to validate the
content, agent-os to gate whether the resulting action runs.

| Dimension | agent-os | Guardrails AI |
|---|---|---|
| Primary unit | Action verdict | Output validation |
| Trust evolution | ✅ per category | ❌ per call |
| Irreversibility model | ✅ first-class | ❌ none |
| Schema validation | ❌ — out of scope | ✅ rich Pydantic-style schema |
| Hub of pre-built validators | ❌ | ✅ many community validators |
| MCP-native | ✅ | ❌ Python |

**Use both together:** Guardrails AI to validate the *content* of the
response; agent-os to gate *whether* the resulting action runs.

### vs. **Llama Guard** (Meta)

Different category. Llama Guard is a *fine-tuned model* used as a content
moderator. agent-os is *middleware* that calls a model. You can plug Llama
Guard *into* agent-os as a supervisor.

```bash
# Llama Guard as your supervisor:
ollama pull llama-guard3:8b
AGENT_OS_SUPERVISOR=ollama AGENT_OS_MODEL=llama-guard3:8b agent-os serve
```

**They are complementary, not competitive.**

---

## Adjacent: post-hoc observability

These projects record traces and grade them after the fact. agent-os runs
*in front* of the action, not after.

### vs. **AgentOps** — github.com/AgentOps-AI/agentops

**What using AgentOps feels like:** you instrument your agent code to
emit traces of every step (LLM call, tool use, decision), and then you
debug / replay / analyze them in their web dashboard. You see what the
agent did, what it cost, where it got stuck. Great for post-mortems.

**What using agent-os feels like instead:** instead of recording what
happened, you decide *whether it should happen* before the action fires.
agent-os runs at the gate; AgentOps runs at the recorder. Most production
agent stacks should have both — the gate to prevent disasters, the
recorder to debug them when they slip through.

| Dimension | agent-os | AgentOps |
|---|---|---|
| When it runs | Before the action fires | After |
| Blocks bad actions | ✅ via verdict + floor | ❌ records only |
| Trust evolution | ✅ | Some, mostly trace-based |
| Dashboard / UI | ❌ — files + SQLite | ✅ web UI, charts |
| Cost tracking | ❌ — out of scope | ✅ first-class |
| Trace replay | ⚠ via SQLite query | ✅ first-class |

**Use AgentOps for visibility into what happened.** Use agent-os to control
what's allowed to happen. They cover different ends of the agent lifecycle.

### vs. **Phoenix** (Arize), **Helicone**, **Lunary**, **OpenLLMetry**

All observability-focused. None gate actions in-loop. All have UIs we don't.
Use them for visibility; use agent-os for control. Some shops use one of each.

---

## Adjacent: frameworks with built-in supervision

### vs. **LangGraph** (LangChain)

LangGraph has callbacks, recovery patterns, and human-in-the-loop nodes.
Supervision is *one feature among many*; it's not a primitive.

| Dimension | agent-os | LangGraph |
|---|---|---|
| Scope | Just supervision | Full agent orchestration |
| Coupling | Standalone, plug into anything | LangChain ecosystem |
| Trust scores | ✅ first-class | ❌ — not modeled |
| Pure safety floor | ✅ | ⚠ programmable, not deterministic |

**You'd run agent-os *inside* a LangGraph node** if you want both.

### vs. **AutoGen** (Microsoft)

AutoGen has multi-agent conversation flows with built-in human-in-the-loop
prompts. Supervision is event-driven dialogue, not trust-scored gating.

### vs. **CrewAI**

Hierarchical "manager agents" supervise "worker agents." Conceptually similar
to agent-os routing, but tied to the CrewAI runtime.

### vs. **OpenInterpreter**

Auto-execute with permission prompts. No persistent trust, no irreversibility
model. Closer to "interactive shell with LLM" than agent supervision.

---

## What agent-os doesn't do (yet)

We're a small primitive. Real gaps you'll hit:

- **No streaming** — long verifications block. Fine for fast supervisors,
  painful with slow cloud LLMs.
- **No batch submission** — N actions = N round-trips.
- **No web dashboard** — inspection is via `agent-os status` CLI or direct
  SQLite. Bring your own UI if you want one.
- **No tamper-evident audit log** — SQLite is editable. For compliance use
  cases (SOC2 Type 2, HIPAA tracing) you'll need an external append-only log
  in front. We may add signed audit chains in v0.2.
- **No multi-tenant workdirs** — single user, single `~/.agent-os/`. Multi-team
  setups need separate workdirs per team.
- **`recover()` is advice, not action** — returns a plan; doesn't execute or
  track its success rate. We may close this in v0.3.

If any of these are deal-breakers for your use case, **don't pick agent-os
yet**. Pick the competitor that solves them, or fork agent-os and fix the gap.

---

## When you should not pick any of us

If your agent has fewer than ~5 distinct action categories and zero
irreversible actions, you don't need a supervision layer at all. A
hand-written allowlist is shorter than the import statement for any of these
libraries. Don't over-engineer.

---

## Decision tree

```
Are you running agents that take real-world actions (write files, send
emails, call APIs that change state)?
├─ NO — none of this matters; skip
└─ YES — does your runtime speak MCP?
    ├─ YES — agent-os is your default. Lowest friction.
    └─ NO — are you in Python with LangChain?
        ├─ YES — NeMo Guardrails or LangGraph supervision nodes.
        └─ NO — Guardrails AI for validation, AgentOps for observability,
                 or fork agent-os and add your runtime adapter.
```

---

## What the next 6 months look like

Things we plan to build that close gaps named above:

- **v0.2** — streaming verdict, batch submission, tamper-evident audit log
- **v0.3** — `recover()` execution + recovery success-rate tracking,
  cost-aware supervisor routing
- **v1.0** — production-grade with managed deployment recipes, dashboard
  reference UI, certified compliance docs

We'll always be smaller and more opinionated than NeMo. That's the design.
The question is whether *your* use case wants opinionated and small, or
flexible and large. If it's the former, we're for you.

---

*Last updated: 2026-05-07. Open an issue if a competitor's capability changed
and our comparison is now wrong — we'd rather be accurate than flattering.*
