# Security Policy — `@reaves-labs/agent-os`

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security reports.**

Email **security@reaveslabs.ai** with:

- A clear description of the issue
- Steps to reproduce (or a proof-of-concept)
- Affected version(s) and platform
- Your name / handle for credit (optional)
- Whether you've disclosed this elsewhere

We acknowledge every report within **72 hours** and will keep you updated as we triage. We aim to ship a fix within **90 days** for verified vulnerabilities.

## What's in scope

- The published `@reaves-labs/agent-os` package on npm
- The MCP server (`agent-os-mcp` binary)
- The CLI (`agent-os` binary)
- The TypeScript source under `src/`
- The example code under `examples/`

## What's out of scope

- Vulnerabilities in dependencies (report those upstream — we'll bump our pin once the upstream patch ships)
- Issues in third-party LLM providers (OpenAI, Anthropic, Ollama)
- Self-inflicted misuse: putting your own API keys in committed code, running an exposed agent-os server on `0.0.0.0` without auth, etc. — those are configuration issues, not vulnerabilities.
- Anything in `~/Reaves-Labs/agent-os/` that's NOT in the published package's `files` allowlist (see `package.json`).
- The `reaveslabs.ai` website (separate scope, separate infra)
- Other Reaves Labs and Learning products (CoinQuest, MarketSapien, Adulting Academy, BLOOM)

## Embargo policy

We follow standard responsible-disclosure with a **90-day embargo**:

1. Reporter emails security@reaveslabs.ai with details
2. We acknowledge within 72 hours
3. We work with reporter on triage and fix
4. **Reporter agrees not to publicly disclose for 90 days** OR until a fix ships, whichever comes first
5. We credit the reporter in the release notes (unless they prefer anonymity)
6. After fix ships, both parties may disclose

If we have not shipped a fix or substantively responded by day 90, the reporter is free to disclose publicly.

## Hall of fame

_Reporters who responsibly disclose security issues get credited here. None yet — be the first._

## What we cannot offer (today)

- **No paid bug bounty.** Solo-founder project, no budget for cash rewards yet. We can offer credit + a swag pack + (for substantive findings) a personal call with the founder.
- **No SLA on fix timing beyond best-effort.** Critical issues we'll prioritize; non-critical may take longer than 90 days if scope is large.
- **No CVE issuance pipeline yet.** We're working on GitHub Security Advisories integration (Phase 2). Until then, reports go in our internal tracker.

## Hardening already in place

These are the existing controls — useful context for security researchers:

- All API key references go through `process.env.*` — no hardcoded credentials anywhere in the source tree.
- `.gitignore` excludes `.env*`, `*.db`, `node_modules/`, `dist/`, `.netlify/`, `.agent-os/` from git.
- LLM-agnostic supervisor architecture means swapping providers doesn't require code changes.
- BPI (Behavioral Predictive Index) governance is built into the engine — every agent decision is scored, logged, and replayable.
- Fail-closed defaults: if the supervisor can't reach an LLM, the engine queues the action for human review rather than executing.

## Coordinated disclosure with downstream

If you're integrating `@reaves-labs/agent-os` and your vulnerability spans both our code and your integration, please CC us at security@reaveslabs.ai when you contact your own security team. We can coordinate on timing and patch language.

---

**Last updated:** 2026-05-07
**Security contact:** security@reaveslabs.ai
**PGP key:** _coming with v0.2_
