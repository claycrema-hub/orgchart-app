#!/bin/bash
# OrgChart — one-shot deploy to GitHub + Vercel
# Run this from your Terminal inside the orgchart-app folder:
#   cd ~/path/to/orgchart-app
#   bash deploy.sh

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  OrgChart — GitHub + Vercel Deploy   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Prereq check ────────────────────────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌  '$1' not found. Install it first:"
    echo "    $2"
    exit 1
  fi
}

check_cmd git    "brew install git  (or it comes with Xcode tools)"
check_cmd gh     "brew install gh   then run: gh auth login"
check_cmd node   "brew install node"
check_cmd vercel "npm install -g vercel"

echo "✅  All tools found"

# ── Git setup ────────────────────────────────────────────────────────────────
if [ ! -d ".git" ]; then
  git init -b main
  git add .
  git commit -m "Initial commit: OrgChart Next.js app"
  echo "✅  Git repo initialized"
else
  # Clean up any stale lock from Cowork session
  rm -f .git/index.lock
  git add .
  git diff --cached --quiet || git commit -m "Update: OrgChart Next.js app"
  echo "✅  Git repo ready"
fi

# ── Create GitHub repo and push ──────────────────────────────────────────────
REPO_NAME="orgchart-app"

echo ""
echo "Creating GitHub repo '$REPO_NAME'..."
gh repo create "$REPO_NAME" --private --source=. --remote=origin --push
echo "✅  Pushed to GitHub: https://github.com/$(gh api user --jq .login)/$REPO_NAME"

# ── Deploy to Vercel ─────────────────────────────────────────────────────────
echo ""
echo "Deploying to Vercel..."
echo "You'll be prompted to log in to Vercel if not already authenticated."
echo ""

vercel --yes --prod

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅  Deploy complete!                 ║"
echo "║                                      ║"
echo "║  Next: add your API keys in Vercel   ║"
echo "║  Project Settings → Environment Vars ║"
echo "║                                      ║"
echo "║  ZOOMINFO_USERNAME                   ║"
echo "║  ZOOMINFO_PASSWORD                   ║"
echo "║  ZOOMINFO_CLIENT_ID                  ║"
echo "║  CLAY_API_KEY                        ║"
echo "╚══════════════════════════════════════╝"
echo ""
