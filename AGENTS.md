# AGENTS.md — agent-os repo map

**Read this first.** This is the public-facing `@reaves-labs/agent-os` package — an LLM-agnostic supervision layer for AI agents (MCP server + CLI). Wedge for YC RFS #04 + #12.

## Where to put new work

| You're adding... | It goes in... |
|---|---|
| A new MCP tool | `src/server/tools/<tool-name>.ts` (then register in the tool list) |
| A new CLI verb | `src/cli/<verb>.ts` |
| Core supervision logic (verdicts, trust scoring, recovery) | `src/core/` |
| LLM provider adapter (anthropic / openai / ollama / generic) | `src/providers/<name>.ts` |
| A prompt template | `prompts/` |
| An example agent or runbook | `examples/` |
| A web demo / docs page | `web/` |
| A doc on threats, security, contributing | top-level (`THREAT-MODEL.md`, `SECURITY.md`, `CONTRIBUTING.md`) |

## Top-level inventory

- **`src/`** — TS source. The 4 MCP tools (`submit_action`, `record_outcome`, `get_routing`, `recover`), provider adapters, and core supervision primitives.
- **`bin/`** — CLI entry binary.
- **`prompts/`** — Reusable prompt templates.
- **`examples/`** — Example agents + runbooks for new users.
- **`web/`** — Public-facing docs / demo site.
- **`scripts/`** — Build, release, doc-generation scripts.
- **`package.json`** + **`tsconfig.json`** — npm/TS config. Public package, semver matters.
- **`README.md`** + **`CONTRIBUTING.md`** + **`SECURITY.md`** + **`CODE_OF_CONDUCT.md`** + **`THREAT-MODEL.md`** + **`LICENSE`** — public-repo conventions.

## Policies (public-repo discipline)

1. **Semver matters.** This package is published. Breaking changes require a major bump + migration note.
2. **No secrets, no internal infra leakage.** Public visibility — never commit founder-personal data, API keys, or internal-only Notion/Linear references. See `SECURITY.md`.
3. **LLM-agnostic.** Every feature must work with anthropic + openai + ollama + generic. No Claude-only paths in core.
4. **Threat model lives in `THREAT-MODEL.md`** — update on every adversarial-input feature change.
5. **No build artifacts in git.** `dist/` is gitignored; the npm publish flow builds fresh.

## RLL ecosystem context

agent-os is the **first substrate primitive externalized from the local orchestrator** (`com.rll.local-orchestrator` at `~/RLL/`). It wraps the same verdict / trust-score / recovery semantics as the founder's internal tooling, packaged for external distribution.

Internal counterpart: `~/RLL/` (private).
External counterpart: this repo (public, npm).

## Quick orientation commands

```sh
npm test                      # unit + integration
npm run build                 # produces dist/
npm run dev                   # local MCP server with hot reload
npx agent-os --help           # CLI usage
```
