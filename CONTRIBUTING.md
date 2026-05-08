# Contributing to `@reaves-labs/agent-os`

> **Status (2026-05-07):** Phase 1 — source-available preview. **Pull requests are not yet being accepted.** Issues are not yet open. The repo is published for evaluation, transparency, and validation. Full open-source contribution opens with v0.2.

---

## Why we're not accepting contributions yet

agent-os is a substrate primitive — code that supervises other AI agents in production. Solo-maintainer projects accepting unreviewed PRs in 2026 is the [`xz-utils` failure mode](https://research.swtch.com/xz-timeline). Before we open contribution, we need:

1. CI pipeline that runs on every PR (lint + typecheck + secret-scan + dep-audit + CodeQL)
2. Branch protection requiring 2 maintainer approvals + signed commits
3. `CODEOWNERS` enforced for security-sensitive paths (`src/supervisors/**`, `src/engine.ts`)
4. Bug-bounty channel via GitHub Security Advisories
5. A second maintainer beyond the founder

Estimated timeline to Phase 2 (controlled OSS): **4–6 weeks.**

---

## What you CAN do today

**Read the source.** That's the point of Phase 1. The whole codebase is here for you to read, reason about, fork privately, and run on your own infrastructure.

**File security reports.** Email **security@reaveslabs.ai** if you find a vulnerability. We take security reports seriously — see [`SECURITY.md`](./SECURITY.md) and [`THREAT-MODEL.md`](./THREAT-MODEL.md).

**Try it locally.** Clone, install, run. Feedback by email is welcome at **bloom@reaveslabs.ai** with subject line `agent-os feedback`.

**Watch the repo.** Star + Watch to get notified when Phase 2 opens.

---

## What we CAN'T accept yet

- Pull requests on the main branch (will be auto-closed with a pointer to this doc)
- Public issue reports (security reports go to email; feature requests can wait for Phase 2)
- Anonymous patches via email
- Unsolicited maintainer offers

If you have a bug fix that's blocking your work, **fork the repo, apply the fix locally, and email us a description** at bloom@reaveslabs.ai. We'll review and either patch upstream or accept your fork as a contribution path when Phase 2 opens.

---

## What Phase 2 will look like

When PRs open (estimated v0.2):

1. **Fork** the repo and create a branch
2. **Sign your commits** with GPG or sigstore
3. **Open a PR** against `main` with:
   - Linked issue (issues will be open by then)
   - Reproducer / test case
   - Updated docs if behavior changed
4. **CI runs** automatically (lint + typecheck + tests + secret-scan + dep-audit + CodeQL)
5. **2 maintainers review** before merge
6. **Squash-merged** with conventional-commit subject

## What Phase 3 will look like

When the project graduates to full-OSS (v1.0+):

- Open Issues + Discussions
- Coordinated security-advisory pipeline via GitHub Security Advisories
- CVE issuance for critical vulns
- Public roadmap with quarterly releases
- Possibly: foundation stewardship (CNCF / Apache / LF AI&Data) if appropriate

---

## Versioning & deprecation policy

**The short version:** if you're about to use this in production, pin
the minor version (`"@reaves-labs/agent-os": "0.1.x"`) so patch fixes
flow in but breaking changes don't surprise you. Once we ship v1.0,
the standard `"^1.0.0"` is safe — at v1.0 we promise no breaking
changes within the major version, and we follow [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html)
strictly forever after.

**Why pre-1.0 needs special care:** during 0.x we may need to change the
shape of `submit()` or the wire format of MCP tools as the design
matures. Every breaking change is documented in [`CHANGELOG.md`](./CHANGELOG.md)
with a one-paragraph migration guide, but we don't want to surprise you
mid-deploy.

The detail follows.

### Pre-1.0 (current — `0.x` line)

- `0.x` is **explicitly unstable** in the SemVer sense. The exported API
  is allowed to change between *minor* versions (`0.1` → `0.2`).
- We will document **every breaking change** in [`CHANGELOG.md`](./CHANGELOG.md)
  under `### Changed` with a one-paragraph migration guide.
- Bumps within a minor version (`0.1.0` → `0.1.1`) follow patch semantics:
  bug fixes and security patches only, no API changes.
- We commit to **at most one breaking change per minor version** in 0.x.
  If a release accumulates more, we split it.

### Post-1.0 (target Q1-Q2 2027 — see [`ROADMAP.md`](./ROADMAP.md))

- Strict [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html). No breaking
  changes except in major versions.
- Breaking changes ship in `2.0.0`, `3.0.0`, etc., never in `1.x`.
- Long-term-support (LTS) branch starts at `1.0.0` with security backports
  for ≥18 months after the next major releases.

### Deprecation timing

- A function, type, or behavior marked `@deprecated` in the API will
  remain in the codebase for **at least one minor version** before
  removal in `0.x`, and **at least one major version** post-1.0.
- Deprecation notices include a target removal version and a migration
  path (e.g., "use `submitMany()` instead — removal in 0.4.0").
- Runtime deprecation warnings emit on first use unless
  `AGENT_OS_SILENCE_DEPRECATIONS=1`.

### What "breaking change" means in practice

We consider these **breaking** (require minor bump in 0.x, major post-1.0):

- Removing or renaming any exported symbol (`AgentOS`, `Store`, types, etc.)
- Changing the signature of any exported method in a non-additive way
- Changing the wire format of MCP tool inputs/outputs
- Changing the SQLite schema in a way that's not backward-compatible (we
  forward-migrate; we don't break readers of older DBs without a major)
- Changing the `gate()` decision table — adding new safety floors is
  **not** breaking; relaxing them **is**

We consider these **not breaking** (patch in 0.x, minor post-1.0):

- Adding new exported methods, types, or supervisor backends
- Adding optional parameters with safe defaults
- Performance improvements that don't change observable behavior
- Tightening the `gate()` decision (more escalation, never less)

### How to depend on this safely

For production deployments, pin the minor version:

```jsonc
// package.json
{
  "dependencies": {
    "@reaves-labs/agent-os": "0.1.x"  // patches OK, no minor jumps
  }
}
```

Once we ship 1.0, you can safely use the standard caret range (`^1.0.0`).

If you want to track our pre-release work, the `rc` dist-tag points at
the latest prerelease (when one exists):

```bash
npm install @reaves-labs/agent-os@rc
```

---

## Code of conduct

All interactions — email, issues (when open), PRs (when open), Discussions — are governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

---

## Maintainer

- **Jamal Reaves** — founder, Reaves Labs and Learning, LLC
- Contact: bloom@reaveslabs.ai (general) · security@reaveslabs.ai (vulns)

---

## License

`@reaves-labs/agent-os` is MIT-licensed. See [`LICENSE`](./LICENSE).
