# Security Disclosure Log

This file is the public, append-only history of every security incident
affecting `@reaves-labs/agent-os`. We commit to publishing here:

- **Every CVE** filed against this package, with disclosure date, fixed
  version, severity, and a one-paragraph technical summary
- **Every coordinated disclosure** received via `security@reaveslabs.ai`,
  redacted appropriately during embargo and published in full afterward
- **Every supply-chain incident** affecting our dependencies that
  required a release on our part
- **Every dependency CVE** that touched a version we shipped, even if
  the impact was zero (so users can verify their version was unaffected)

The log is publicly visible because *trust comes from the record, not
the absence of incidents.* If this file ever has nothing in it after
many releases, it means either we've genuinely had no incidents, OR we
are not telling you about them. We commit to the former.

---

## Entries

### 2026-05-07 — No incidents

First public release (`v0.1.0`) shipped today. No CVEs filed, no
disclosures received, no supply-chain incidents. This entry exists to
establish the empty-but-watching state.

---

## How to report a security issue

See [`SECURITY.md`](./SECURITY.md) for the disclosure process.

**TL;DR:**
- Email `security@reaveslabs.ai` (do NOT open a public issue)
- 90-day embargo by default; we'll coordinate timing with you
- Hall of fame credit on this log if you'd like attribution

---

## Entry format (for future use)

```
### YYYY-MM-DD — Title

**Severity:** Low / Medium / High / Critical (CVSS v3.1 score)
**Affected versions:** ...
**Fixed in:** ...
**Reporter:** ... (or "anonymous")
**CVE:** CVE-YYYY-NNNNN (if assigned)

**What happened:** [one paragraph plain English]

**Impact:** [who could exploit, what they could do, real-world likelihood]

**Mitigation:** [what users should do]

**Timeline:**
- YYYY-MM-DD: Reported
- YYYY-MM-DD: Reproduced / triaged
- YYYY-MM-DD: Patch developed
- YYYY-MM-DD: Patch released as vX.Y.Z
- YYYY-MM-DD: Embargo lifted, this entry published

**Lessons learned / process changes:** [what we changed so this class of bug
can't happen again]
```

---

*This file is updated within 24h of every disclosure event. Last review: 2026-05-07.*
