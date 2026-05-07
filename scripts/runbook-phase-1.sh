#!/usr/bin/env bash
# runbook-phase-1.sh — single founder session to complete agent-os Phase 1.
#
# Prereqs:
#   - You're at your laptop with terminal + browser open
#   - Your phone is nearby (npm 2FA + GitHub 2FA)
#   - ~15 minutes
#   - You've decided the GitHub org name is `reaves-labs` (with hyphen)
#
# What this does (top-down):
#   1. Refresh gh auth to gain admin:org scope (browser-based)
#   2. Create the `reaves-labs` GitHub org (browser-based — must be done in UI)
#   3. Transfer jreaves-ui/agent-os → reaves-labs/agent-os
#   4. Update local git remote to the new URL
#   5. npm login + 2FA (interactive)
#   6. Create @reaves-labs npm scope
#   7. Defensive register @reaves_labs and @reaveslabs typosquat scopes
#   8. Generate restricted NPM_TOKEN, push to GitHub repo secret
#   9. Local CI sanity (typecheck + build + smoke)
#  10. Tag v0.1.0-rc.1 and push — triggers signed-release workflow
#
# Each step is idempotent — safe to re-run if interrupted.
#
# Usage:
#   bash ~/Reaves-Labs/agent-os/scripts/runbook-phase-1.sh
#
# DO NOT run this script unattended. You must respond to OAuth + 2FA prompts.

set -euo pipefail

REPO_DIR="${HOME}/Reaves-Labs/agent-os"
OLD_REPO="jreaves-ui/agent-os"
NEW_REPO="reaves-labs/agent-os"
NPM_SCOPE="reaves-labs"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  agent-os Phase 1 runbook — ~15 min · ~10 prompts"
echo "═══════════════════════════════════════════════════════════════"
echo ""
read -p "Ready? (press Enter to continue, Ctrl-C to abort): " _

cd "$REPO_DIR"

# ─── Step 1 — gh auth refresh for admin:org scope ──────────────────────────
echo ""
echo "─── 1/10 · gh auth refresh (browser opens; complete OAuth) ───"
if gh auth status 2>&1 | grep -q "admin:org"; then
  echo "  admin:org scope already present, skipping"
else
  gh auth refresh -h github.com -s admin:org,delete_repo
fi

# ─── Step 2 — create the reaves-labs org ───────────────────────────────────
# GitHub orgs can only be created via UI. The script opens the page; the
# user creates the org with the same name as the var above, then presses Enter.
echo ""
echo "─── 2/10 · create the reaves-labs GitHub org ───"
if gh api "orgs/${NPM_SCOPE}" >/dev/null 2>&1; then
  echo "  org reaves-labs already exists, skipping"
else
  echo "  GitHub does not allow creating an org via API."
  echo "  Open the URL below in your browser, choose Free plan, name it: ${NPM_SCOPE}"
  echo "  Then come back here and press Enter."
  echo ""
  echo "  https://github.com/organizations/plan"
  echo ""
  read -p "  Enter once the org exists: " _
  # Verify
  if ! gh api "orgs/${NPM_SCOPE}" >/dev/null 2>&1; then
    echo "  ERROR: org ${NPM_SCOPE} still not found. Aborting."
    exit 1
  fi
fi

# ─── Step 3 — transfer the repo ────────────────────────────────────────────
echo ""
echo "─── 3/10 · transfer ${OLD_REPO} → ${NEW_REPO} ───"
CURRENT_OWNER=$(gh repo view "${OLD_REPO}" --json owner -q '.owner.login' 2>/dev/null || echo "")
if [ "$CURRENT_OWNER" = "${NPM_SCOPE}" ]; then
  echo "  repo already at ${NEW_REPO}, skipping"
elif gh api "repos/${OLD_REPO}" >/dev/null 2>&1; then
  gh api -X POST "repos/${OLD_REPO}/transfer" -f new_owner="${NPM_SCOPE}"
  echo "  transfer requested — accept the transfer at:"
  echo "    https://github.com/organizations/${NPM_SCOPE}/settings/repositories"
  echo "  GitHub may require manual acceptance for the first transfer."
  read -p "  Press Enter once transfer is accepted: " _
fi

# ─── Step 4 — update local git remote ──────────────────────────────────────
echo ""
echo "─── 4/10 · update local git remote ───"
git remote set-url origin "https://github.com/${NEW_REPO}.git"
git remote -v

# ─── Step 5 — npm login (interactive 2FA) ──────────────────────────────────
echo ""
echo "─── 5/10 · npm login (browser opens for 2FA) ───"
if npm whoami >/dev/null 2>&1; then
  echo "  already logged into npm as $(npm whoami), skipping"
else
  npm login --auth-type=web
fi

# ─── Step 6 — create @reaves-labs npm scope ────────────────────────────────
echo ""
echo "─── 6/10 · create @${NPM_SCOPE} npm scope ───"
NPM_USER=$(npm whoami)
if npm org ls "${NPM_SCOPE}" >/dev/null 2>&1; then
  echo "  @${NPM_SCOPE} scope already exists, skipping"
else
  # npm scopes are part of an org. Free orgs allow public packages.
  # The signup is via the npmjs.com UI; can't be done from CLI.
  echo "  Open: https://www.npmjs.com/org/create"
  echo "  Choose Free plan, name it: ${NPM_SCOPE}"
  read -p "  Press Enter once @${NPM_SCOPE} exists on npm: " _
fi

# ─── Step 7 — defensive typosquat scopes ───────────────────────────────────
echo ""
echo "─── 7/10 · defensive typosquat scope claim (@reaves_labs, @reaveslabs) ───"
echo "  Open in browser, claim each org name (free plan):"
echo "    https://www.npmjs.com/org/create   →   reaves_labs   (underscore)"
echo "    https://www.npmjs.com/org/create   →   reaveslabs    (no hyphen)"
read -p "  Press Enter once both placeholder orgs exist (or skip and accept the risk): " _

# ─── Step 8 — generate granular NPM_TOKEN + push to repo secrets ───────────
echo ""
echo "─── 8/10 · NPM_TOKEN repo secret ───"
echo "  We need a granular access token with publish permission ONLY on @${NPM_SCOPE}/agent-os."
echo "  Granular tokens MUST be created via the web UI (CLI doesn't support scope filters)."
echo "  Open:"
echo "    https://www.npmjs.com/settings/${NPM_USER}/tokens/new"
echo "  Choose: Granular Access Token · Expiration 1 year · Packages: @${NPM_SCOPE}/agent-os only · Publish"
echo "  Copy the token (starts with npm_)."
echo ""
read -s -p "  Paste NPM_TOKEN here (will be hidden, then pushed to GitHub repo secret): " NPM_TOKEN
echo ""
if [ -z "$NPM_TOKEN" ]; then
  echo "  No token provided. Skipping. You can run 'gh secret set NPM_TOKEN' later."
else
  echo "$NPM_TOKEN" | gh secret set NPM_TOKEN -R "${NEW_REPO}"
  echo "  NPM_TOKEN set on ${NEW_REPO}"
fi

# ─── Step 9 — local CI sanity ──────────────────────────────────────────────
echo ""
echo "─── 9/10 · local CI sanity ───"
npm ci
npx tsc --noEmit
npm run build
node bin/agent-os.mjs --help >/dev/null
echo "  typecheck OK · build OK · CLI smoke OK"

# ─── Step 10 — tag v0.1.0-rc.1 and push ────────────────────────────────────
echo ""
echo "─── 10/10 · tag v0.1.0-rc.1 + push ───"
TAG="v0.1.0-rc.1"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "  tag $TAG already exists locally"
else
  git tag -a "$TAG" -m "agent-os $TAG — Phase 1 source-available preview"
fi
echo "  pushing main + tag to ${NEW_REPO}…"
git push origin main
git push origin "$TAG"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Phase 1 complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  GitHub: https://github.com/${NEW_REPO}"
echo "  Releases: https://github.com/${NEW_REPO}/releases"
echo "  npm: https://www.npmjs.com/package/@${NPM_SCOPE}/agent-os"
echo ""
echo "  The Release workflow is now running. Watch:"
echo "  https://github.com/${NEW_REPO}/actions"
echo ""
echo "  Next phase (1-2 months): open Issues + Discussions, add bug-bounty."
echo "  See CONTRIBUTING.md for the full plan."
echo ""
