# Changelog

All notable changes to `@reaves-labs/agent-os` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches v1.0.0. Pre-1.0 releases may make breaking changes in
*minor* versions; see [CONTRIBUTING.md](./CONTRIBUTING.md#versioning--deprecation-policy)
for details.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- _Reserved for changes targeting v0.2.0._

### Security
- _If a CVE is filed, it appears here first before any release._

---

## [0.1.0] — 2026-05-07

**What you get in this release:** a working drop-in supervisor that
sits between your AI agent and the actions it wants to take. Every
proposed action gets a verdict (run unattended / hold for review /
bounce back), with a confidence score that learns over time and a
hard safety floor for actions you can't undo. Speaks MCP out of the
box; works with Claude / GPT / Ollama / any OpenAI-compatible endpoint.

This is a source-available preview — read it, run it locally, evaluate
it. PRs are not accepted yet (see [CONTRIBUTING.md](./CONTRIBUTING.md))
and full open contribution opens with v0.2 per [ROADMAP.md](./ROADMAP.md).

### Added
- **Public API surface** (`@reaves-labs/agent-os`):
  - `AgentOS` class with `submit()`, `recordOutcome()`, `route()`, `recover()`, `status()`
  - `SupervisionEngine` with the pure `gate()` function — irreversibility floor
    cannot be overridden by any LLM verdict
  - `Store` SQLite-backed persistence with WAL journaling
  - `TrustView` type exporting `mean`, `score` (LCB), `confidence`, `alpha`, `beta`, `n`
- **Four supervisor backends:** `anthropic`, `openai`, `ollama`, `generic`
  (works with Groq, Together, vLLM, llama.cpp, any OpenAI-compatible endpoint)
- **MCP server** (`agent-os-mcp`) — stdio transport, four tools:
  `submit_action`, `record_outcome`, `get_routing`, `recover`
- **CLI** (`agent-os`) — `submit`, `outcome`, `status`, `serve`, `route`, `recover`
- **Filesystem effectors** — `auto` verdicts land at `~/.agent-os/outbox/<role>/`,
  `supervised`/`escalate` queue at `~/.agent-os/queues/approval/`
- **Trust scoring that learns over time** — every action category
  (e.g., `send_email`) accumulates a confidence score that rises when
  outcomes are good and falls when they aren't. New categories start
  *low* on purpose (about 0.06 out of 1) so the agent has to *earn*
  auto-execute. Old observations gradually fade so a category that was
  trustworthy six months ago and flaky now is treated as flaky. *(For
  the math: lower confidence bound of a Beta-Bernoulli posterior with
  α=β=2 prior, z=1.96, 50-observation half-life decay. See `src/store.ts`.)*
- **Behavioral test suite** — 10 tests covering: submit/verdict, outcome/trust,
  irreversibility floor, gate() branches, supervisor failure fallback,
  conservative-start, LCB asymptote, decay-driven drop, uncertainty penalty
- **Phase 0 hardening:**
  - `SECURITY.md` — vulnerability disclosure with 90-day embargo
  - `THREAT-MODEL.md` — 10 modeled attacker classes
  - `CONTRIBUTING.md` — phased OSS plan, contributor expectations
  - `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
  - `CODEOWNERS` — maintainer review required on safety-critical files
  - GitHub repo settings: branch protection (no force-push, no delete),
    Issues/Wiki/Discussions OFF (controlled engagement during preview),
    Dependabot security updates ON, secret scanning + push protection ON
  - CI workflows: typecheck, build, smoke, behavioral tests, npm audit,
    Gitleaks, CodeQL — every push and PR
- **Documentation:**
  - Full README with install, CLI walkthrough, MCP integration, library API,
    verdict math, and competitor comparison link
  - `examples/claude-code/` — 5-minute integration walkthrough showing trust
    scores evolving across submissions
  - `examples/library-use.ts` — embed agent-os directly in Node code
  - `docs/COMPARE.md` — honest head-to-head vs NeMo Guardrails, Guardrails AI,
    AgentOps, LangGraph, AutoGen, CrewAI; decision tree for picking
  - `examples/claude-desktop-config.json` — drop-in MCP config

### Security
- **No CVEs filed.** This is the first public release; the project has not
  yet had time to accumulate disclosure history. Future security incidents
  will be documented per `SECURITY.md`.
- **Provenance attestation NOT included** in the published 0.1.0 tarball.
  This release was published manually with a recovery code due to an
  npm-side TOTP-add UI restriction on the publishing account. CI workflow
  with `--provenance` is in place and will activate the moment the npm
  UI restriction is resolved (see `ROADMAP.md` § v0.1.1). Verify the
  source-to-build correspondence manually until then by comparing this
  repository's `0.1.0` git tag SHA to the package's reported source URL.

### Known limitations
These are documented in [ROADMAP.md](./ROADMAP.md) with target versions:
- No streaming verdicts (verifications block until the supervisor returns)
- No batch action submission
- No tamper-evident audit log (SQLite is editable)
- No web dashboard / trace UI
- No cost-aware supervisor routing
- No multi-tenant workdirs
- No bias-evaluation harness
- `recover()` returns plans but does not execute or track success
- TypeScript-only — no Python SDK yet

---

## [0.1.0-rc.3] — 2026-05-07 — **WITHDRAWN**

Published in error to validate the release pipeline before the README,
behavioral tests, and trust-score math were finalized. Withdrawn within
the npm 72-hour window. Do not install. Use 0.1.0 instead.

The work that landed in rc.3 forms the basis of 0.1.0 and informed the
documentation polish and Bayesian trust upgrade that ship in 0.1.0.

---

## [Pre-release commit history]

The following commits exist in `main` but predate any tagged release:

- `e70d2d0` 2026-05-01 — Initial implementation: LLM-agnostic supervision
  layer (MCP + CLI)
- `87a1562` 2026-05-04 — Repository hygiene: `.gitignore` for `.netlify` state
- `afcd613` 2026-05-07 — **Phase 0 source-available hardening** (SECURITY,
  THREAT-MODEL, CONTRIBUTING, CODEOWNERS, CI workflow, signed release
  workflow, branch protection setup)
- `cbfa3b8` 2026-05-07 — Phase 1 prep: package.json metadata
  (`reaves-labs.ai` homepage, repository, security advisories), founder
  runbook for organizational migration
- `b081ddc`, `9faab4b`, `84ce99a` — release-pipeline iteration (rc.1
  through rc.3, all withdrawn or never published)
- `052e95e` 2026-05-07 — Dependabot enabled for npm + github-actions,
  vulnerability alerts and automated security fixes turned on
- `909391d` 2026-05-07 — Reset to 0.1.0 after rc.3 withdrawal decision
- `edc97a1` 2026-05-07 — Behavioral test suite (10 tests, ~100ms)
- `3f600e9` 2026-05-07 — **Beta-Bernoulli trust posterior with time decay**
  (replaces v0 cumulative-average formula)
- `f87a5fc` 2026-05-07 — Claude Code walkthrough, COMPARE.md vs the OSS
  agent-supervision landscape

---

## Versioning policy summary

- Pre-1.0 (now): minor version may include breaking changes; we will document
  every breaking change in this file under a `### Changed` section with
  migration guidance.
- Post-1.0: strict SemVer.
- Deprecations: documented for at least one minor version before removal,
  with a clear migration path.

Full policy in [CONTRIBUTING.md § Versioning & deprecation](./CONTRIBUTING.md#versioning--deprecation-policy).
