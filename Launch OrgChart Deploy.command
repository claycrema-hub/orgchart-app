#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  OrgChart — Push to GitHub + Deploy to Vercel
#  Double-click this file in Finder to run it.
# ─────────────────────────────────────────────────────────────

# Change to the folder this script lives in
cd "$(dirname "$0")"

REPO_URL="https://github.com/claycrema-hub/orgchart-app.git"

clear
echo ""
echo "┌──────────────────────────────────────────┐"
echo "│    OrgChart — Push to GitHub + Vercel    │"
echo "└──────────────────────────────────────────┘"
echo ""

# ── Step 1: Fix git repo ─────────────────────────────────────
echo "📦  Setting up git..."

# Remove the broken .git folder left by Cowork and start fresh
rm -rf .git
git init -b main
git config user.email "clay.crema@amplitude.com"
git config user.name "Clay Crema"
git add .
git commit -m "Initial commit: OrgChart Next.js app"
echo "✅  Git ready"

# ── Step 2: Push to GitHub ───────────────────────────────────
echo ""
echo "🚀  Pushing to GitHub..."
echo "    (A browser window will open to verify your GitHub login)"
echo ""

git remote add origin "$REPO_URL"

# gh auth ensures credentials are set up
if command -v gh &>/dev/null; then
  gh auth setup-git 2>/dev/null || true
fi

git push -u origin main --force

if [ $? -ne 0 ]; then
  echo ""
  echo "⚠️   Push failed. Trying with HTTPS credential helper..."
  git config credential.helper osxkeychain
  git push -u origin main --force
fi

echo "✅  Code pushed to: $REPO_URL"

# ── Step 3: Deploy to Vercel ─────────────────────────────────
echo ""
echo "🌐  Deploying to Vercel..."

if ! command -v vercel &>/dev/null; then
  echo "⚙️   Installing Vercel CLI..."
  npm install -g vercel
fi

vercel --yes --prod 2>&1 | tee /tmp/vercel_out.txt

VERCEL_URL=$(grep -Eo 'https://[a-zA-Z0-9._-]+\.vercel\.app' /tmp/vercel_out.txt | tail -1)

echo ""
echo "┌──────────────────────────────────────────────────────┐"
echo "│  ✅  DONE!                                            │"
if [ -n "$VERCEL_URL" ]; then
echo "│  🌐  Live at: $VERCEL_URL"
fi
echo "│                                                       │"
echo "│  Last step — add API keys in Vercel:                 │"
echo "│  vercel.com → your project → Settings →              │"
echo "│  Environment Variables, then add:                    │"
echo "│    ZOOMINFO_USERNAME                                  │"
echo "│    ZOOMINFO_PASSWORD                                  │"
echo "│    ZOOMINFO_CLIENT_ID                                 │"
echo "│    CLAY_API_KEY                                       │"
echo "│  Then click Redeploy.                                 │"
echo "└──────────────────────────────────────────────────────┘"
echo ""

# Open the live app and Vercel dashboard
[ -n "$VERCEL_URL" ] && open "$VERCEL_URL"
open "https://vercel.com/dashboard"

read -p "Press Enter to close..."
