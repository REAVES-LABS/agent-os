# Roadmap

This document is a *commitment*, not a wishlist. Items below have target
versions; if a target slips, the slip is documented in [`CHANGELOG.md`](./CHANGELOG.md)
and the new target appears here.

The reason for this format: most early-stage OSS roadmaps are vague
("coming soon!"). That makes them useless for adopters trying to decide
whether the gap they care about is one quarter away or never. We won't
do that — every line below is dated.

---

## Status: where we are today

`v0.1.0` shipped 2026-05-07 as a **source-available preview**. PRs are
not yet accepted. The library is functional, behaviorally tested,
hardened (Phase 0), and documented — but explicitly missing several
features that the established competitors (NeMo Guardrails, Guardrails
AI, AgentOps, LangSmith) ship today. See [`docs/COMPARE.md`](./docs/COMPARE.md)
for the head-to-head.

This roadmap closes those gaps in three releases.

---

## v0.1.1 — Provenance unblocking (target: ≤ 14 days from v0.1.0)

The single blocker. v0.1.0 was published manually with a recovery code
because npm's UI does not currently expose a way to add a TOTP
authenticator alongside an existing security key on this account. CI
provenance via GitHub OIDC + sigstore requires that path.

**Scope:**
- Resolve the npm-side TOTP-add restriction (open support ticket, follow
  through to resolution)
- Re-publish via the existing CI release workflow with `--provenance`
- Document verification path in README ("how to verify a published
  tarball came from this commit")
- No code changes expected — purely a release-pipeline fix

**Won't ship anything else in this release** — fastest possible patch.

---

## v0.2.0 — Adoption-grade polish (target: 6-8 weeks from v0.1.0)

The features that close the most painful gaps competitors have today.

### Streaming verdicts ([gap vs Guardrails AI, NeMo, AgentOps](./docs/COMPARE.md))
- `submit()` returns an async iterable for incremental verdict tokens
- Supervisor backend layer adds streaming support to anthropic, openai, ollama
- Existing non-streaming API stays — additive, no breakage

### Batch action submission
- New `submitMany(actions[])` returns verdicts for each in one round-trip
- For agents that propose multi-step plans

### Telemetry hooks ([gap vs all competitors](./docs/COMPARE.md))
- `os.on('verdict', cb)`, `os.on('outcome', cb)`, `os.on('trust-update', cb)`
- Compatible with OpenTelemetry exporters out of the box
- Lets users build dashboards (Grafana, Prometheus) without modifying agent-os

### Bias-evaluation harness ([first-mover gap — none of the competitors publish one](./docs/COMPARE.md))
- `agent-os bench --bias` runs synthetic action scenarios across categories,
  agent IDs, and content sensitivities; reports verdict drift
- Public benchmark results published with each release
- Open hypothesis: do supervisors disproportionately escalate certain
  category names? We'll know if we measure.

### Documentation site
- Astro Starlight or MkDocs, hosted at `agent-os.reaveslabs.ai`
- Generated API reference (TSDoc → docs)
- Five integration walkthroughs (Claude Code, Cursor, Anthropic Agent SDK,
  LangGraph adapter, OpenInterpreter adapter)
- Closes the "single README vs. real docs site" gap vs. NeMo/Guardrails

### Generic `DEFAULT_ROLES`
- Current defaults reflect the production system that informed the design
  (`notion-pm`, `business-ops-vp`, etc.). Replace with generic role names
  (`writer`, `code`, `analyst`, `reviewer`, `researcher`) and document
  user-supplied roles via `cfg.roles`.
- Quality-of-onboarding fix.

### Public security log
- `SECURITY-LOG.md` documenting every CVE, every disclosure date, every
  patch — even when the log is initially empty
- Signals "we'd publish if there were one"; that itself is the trust
  property

---

## v0.3.0 — Production-grade primitives (target: ~Q4 2026)

Features that move the needle from "credible primitive" to "real
production tool."

### Tamper-evident audit log
- Hash-chained append-only log alongside SQLite
- Every action, every outcome, every trust update is signed
- Closes the largest compliance gap (SOC2 Type 2 paths require this)

### `recover()` execution + tracking
- Currently `recover()` returns a plan; in v0.3 it can execute the plan
  and track success rate per recovery strategy
- Recovery success rate becomes a reportable metric

### Cost-aware supervisor routing
- Per-supervisor cost annotation (`{ cost_per_call_usd, latency_p50_ms }`)
- Engine routes low-irreversibility actions to cheaper supervisors,
  high-irreversibility to expensive/accurate ones
- Closes the AgentOps cost-tracking gap

### Multi-tenant workdirs
- `cfg.workdir` already supports per-instance isolation; v0.3 formalizes
  this with documented patterns for team / per-user / per-environment
  isolation
- Add `agent-os tenants list` / `... export` CLI

### Python SDK (parity, not full port)
- Read-only Python client that connects to a running `agent-os-mcp` over
  MCP — does NOT reimplement the engine
- Unlocks LangChain / LlamaIndex / CrewAI integration without language
  rewrites

### v0.3 also opens
- `Phase 2`: PRs accepted from contributors who've signed the CLA
- GitHub Discussions enabled with moderation policy
- Discord / community channel decision

---

## v1.0 — Stable contract (target: ~Q1-Q2 2027)

Once the API has had ~6 months of v0.x stable, we tag v1.0 with a strict
SemVer commitment.

### Hard requirements before tagging v1.0
- ≥6 months without a breaking change in v0.x line
- Independent third-party security audit completed and findings remediated
- ≥3 external production deployments (besides BLOOM) with public testimonials
- Documentation site has been live ≥3 months and has search analytics
  showing what users actually look for
- Validators / policies hub has ≥10 community-contributed policies
- Compliance docs path complete (SOC2-ready architecture, GDPR data
  handling page)

### v1.0 deliverables
- Full SemVer commitment ([CONTRIBUTING.md § versioning](./CONTRIBUTING.md#versioning--deprecation-policy))
- LTS release branch starting at 1.0
- Reference dashboard UI (open-source, self-hostable, integrates with
  Grafana for metrics)
- Cost-aware managed offering recipes (deploy on Fly.io / Railway /
  similar with one command)

---

## Things we are *not* planning

These are gaps you might expect us to close based on competitors but that
we have decided are out of scope. Calling them out so you can choose a
different tool if any of them are deal-breakers:

- **Programmable policy DSL (Colang-like).** NeMo's strength. We believe
  trust-score-based gating + irreversibility floor is more defensible
  than DSL rules an LLM can be tricked around. If you want a policy DSL,
  use NeMo Guardrails.
- **Hosted SaaS dashboard.** AgentOps has this. We'd rather ship the
  primitives that *let you build* a dashboard (telemetry hooks in v0.2)
  than build one ourselves. Self-hostable reference UI lands in v1.0.
- **Web UI for editing trust thresholds, policies, etc.** Out of scope
  for the foreseeable. Configuration is code (TypeScript) or env vars.
- **Closed-source enterprise tier.** Not planned. The whole project is
  MIT and will stay that way. Sustainability comes from
  consulting/integration revenue under the Reaves Labs umbrella, not
  from licensing tiers.
- **Embedded ML model for jailbreak detection.** NeMo has this. We
  prefer to let users plug in Llama Guard or similar via the existing
  supervisor backend layer.

---

## How to influence this roadmap

If you're using agent-os and a gap is blocking you, the priority order
will shift to address it.

- **Phase 1 (now through v0.2):** email `bloom@reaveslabs.ai` with the
  subject `agent-os roadmap` and your use case
- **Phase 2 (v0.3+):** GitHub Discussions will be enabled with feature-
  request templates

We will be specific in CHANGELOG.md about which features were prioritized
because of which user request.

---

## Document policy

This file is updated when:
- A version targets a new item (added)
- A target slips (updated; old target documented in commit message)
- An item ships (moved to CHANGELOG.md, removed here)
- A "not planning" decision is reversed (moved up to a target version)

Last review: 2026-05-07.
