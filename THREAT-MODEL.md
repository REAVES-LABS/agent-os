# Threat Model — `@reaves-labs/agent-os`

This document captures what attackers we expect, what assumptions we make, and what's explicitly out of scope. Updated as the project matures.

**Last updated:** 2026-05-07
**Repo phase:** source-available preview (Phase 1; PRs not yet accepted)

---

## What `agent-os` is

A **drop-in supervision layer** for AI agents. MCP server + CLI. LLM-agnostic — swap Anthropic / OpenAI / Ollama / OpenAI-compatible endpoint with one env var. Persists supervision verdicts to SQLite, writes effectors to a filesystem outbox, queues risky actions for human review.

It is NOT:
- A managed-cloud service. Customers run it themselves.
- A multi-tenant platform.
- A product that touches user money or PII directly. The agents above it might; agent-os just supervises.

---

## Assumptions about deployment

We assume operators will:

1. Run agent-os **on infrastructure they control** (their server, their laptop, their cluster).
2. Set their **own LLM API keys** via env vars, never commit them.
3. Use their **own SQLite database file** stored locally (not exposed to the public internet).
4. Treat the **filesystem outbox** as trust-boundary output — i.e., not auto-execute it without their own gating.
5. Run agent-os on a **trusted network**. The MCP server speaks stdio by default; if exposed over HTTP, the operator is responsible for adding auth.

If an operator violates these (e.g., commits API keys, exposes SQLite to the internet, auto-pipes the outbox to `bash`) — that's misuse, not a vulnerability in agent-os.

---

## Threat actors we model

### A1. Curious developer
Tries to see what agent-os does, may run it on their laptop, may misconfigure.
**Mitigation:** clear docs, sane defaults, fail-closed behavior, helpful error messages. Not a security threat.

### A2. Hostile npm dependency-confusion attacker
Registers `@reaves_labs/agent-os` (underscore typo) or `@reaveslabs/agent-os` (no hyphen) on npm to catch typos. Common pattern in 2026.
**Mitigation:**
- We claim defensive npm namespaces during Phase 0 (`@reaves_labs`, `@reaveslabs` reserved).
- We publish with **provenance attestation** (`npm publish --provenance`) so users can verify the package was built from this exact source commit.
- README explicitly names the canonical scope: `@reaves-labs` (with hyphen).

### A3. Hostile contributor / malicious PR author
Submits a PR that looks helpful but introduces a backdoor (subtle race condition, dependency swap, prompt-injection vector hidden in default template).
**Mitigation:**
- Phase 1: **PRs not accepted.** Repo is read-only.
- Phase 2: PRs require 2 maintainer approvals + signed commits + automated CI (lint + typecheck + secret-scan + dep-audit + CodeQL).
- Phase 3: Trusted-contributor model with `CODEOWNERS` review gates.

### A4. Supply-chain attacker via transitive dependency
Compromises a transitive dep (the `xz-utils` 2024 pattern). When operators install agent-os, they pull the bad transitive.
**Mitigation:**
- Minimum dependencies: agent-os ships with ~3 direct deps (`@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`). Each is widely-used and reviewed.
- `package-lock.json` committed; we pin exact versions, not ranges.
- Renovate/Dependabot will flag suspicious bumps once we add CI.
- We will run **`npm audit` + `socket.dev`-style supply-chain checks** in CI before any release.

### A5. LLM-driven repo prober
Autonomous agents crawl every public repo for secrets in commit history, dependency confusion vectors, semantic vulnerabilities.
**Mitigation:**
- Full git-history secret scan run as of 2026-05-07: **0 leaks** (verified with grep across all commits).
- `Gitleaks` + `Trufflehog` will run on every push in Phase 0 CI.
- Branch protection on `main` (Phase 0) prevents force-push history rewrites.

### A6. Reputation-hijack forker
Forks the repo, adds malicious code, presents as "the official version" via SEO + npm typos.
**Mitigation:**
- Trademark filing for "agent-os" name (Phase 2, ~$300 USPTO).
- Canonical README states: "Official source: github.com/reaves-labs/agent-os, official npm: @reaves-labs/agent-os."
- Signed npm releases with provenance — anyone can verify build provenance back to this exact GitHub repo.

### A7. Social-engineering issue-spammer
Floods Issues with fake reports, AI-generated noise, or coordinated reputation attacks.
**Mitigation:**
- Phase 1: Issues NOT enabled. Only direct security@ contact.
- Phase 2: Issues enabled with templates that filter low-quality reports (required reproducer, version info, etc.).
- Phase 2: Auto-lock issues 30 days after last comment.

### A8. Strategy / roadmap leak
Public TODOs, branch names, and commit messages leak product roadmap to competitors.
**Mitigation:**
- Internal roadmap stays in `~/RLL/` (private). Public repo carries only what's already shipped or imminently shipping.
- TODOs in code are vague: `// TODO: improve recovery` not `// TODO: ship customer-X feature for Q3 launch`.

### A9. Prompt-injection in supervision prompts
Operators load custom prompts; an attacker who controls a prompt template can manipulate agent-os into producing biased verdicts.
**Mitigation:**
- Prompts under `prompts/` are documented as **operator-configurable**. We don't claim integrity over operator-supplied content.
- Default prompts are checked into source and reviewed.
- The supervisor's verdict is one signal among several — operators are expected to layer additional gating.

### A10. Sandbox escape via the effectors layer
An attacker tricks agent-os into executing arbitrary shell commands via the effectors filesystem outbox.
**Mitigation:**
- Effectors are **passive** — agent-os writes JSON files; nothing in agent-os auto-executes them. The operator is responsible for any executor that consumes the outbox.
- Default effector format is structured (JSON), not shell-eval-able.
- Recovery mode requires explicit human gating — no autonomous re-execution after a verdict failure.

---

## Out of scope

These are explicitly NOT threats agent-os defends against:

- **Hardware-level attacks** (Spectre, Meltdown, side-channels)
- **Operating-system vulnerabilities** in the host
- **Malicious LLM responses** — if OpenAI / Anthropic / Ollama returns a bad response, agent-os flags it via verdicts but doesn't claim to detect every possible adversarial output
- **DoS via expensive LLM queries** — operators are responsible for rate-limiting their own LLM API usage
- **Adversarial training-data poisoning** — agent-os doesn't train models; it supervises them
- **Cryptographic protocol bugs** — we don't implement crypto. We rely on `node:crypto` and TLS at the transport layer.
- **Regulatory compliance** (HIPAA, SOC2, FINRA) — agent-os is a building block, not a certified solution. Operators are responsible for compliance-grade wrappers.

---

## Disclosure history

| Date | Reporter | Severity | Status |
|---|---|---|---|
| _none yet_ | | | |

---

## Cross-references

- Security policy: [`SECURITY.md`](./SECURITY.md)
- Contributing guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
