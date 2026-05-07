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

## Code of conduct

All interactions — email, issues (when open), PRs (when open), Discussions — are governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

---

## Maintainer

- **Jamal Reaves** — founder, Reaves Labs and Learning, LLC
- Contact: bloom@reaveslabs.ai (general) · security@reaveslabs.ai (vulns)

---

## License

`@reaves-labs/agent-os` is MIT-licensed. See [`LICENSE`](./LICENSE).
