#!/usr/bin/env bash
# places2go — Full deploy / update script for aaPanel + Nginx
# Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved.
#
# Run from your local machine (or from the server after cloning):
#   bash deploy/deploy.sh
#
# What it does:
#   1. Builds the Expo web export
#   2. Copies the output to the Nginx web root
#   3. Starts / reloads the two PM2 Node servers
#
# Environment variables you can override:
#   SITE_ROOT   Where Nginx serves the app from  (default: /www/wwwroot/places2go)
#   DIST_DIR    Where expo export writes to       (default: ./dist)

set -euo pipefail

SITE_ROOT="${SITE_ROOT:-/www/wwwroot/places2go}"
DIST_DIR="${DIST_DIR:-./dist}"

echo "═══════════════════════════════════════════════"
echo " places2go deploy  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════"

# ── 1. Install / update JS dependencies ─────────────────────────────────────
echo ""
echo "▶ Installing npm dependencies…"
npm ci --prefer-offline

# ── 2. Build the Expo web export ────────────────────────────────────────────
echo ""
echo "▶ Building Expo web export…"
npx expo export --platform web --output-dir "$DIST_DIR" --clear

echo "   Built to $DIST_DIR/"

# ── 3. Copy static files to Nginx web root ──────────────────────────────────
echo ""
echo "▶ Syncing to $SITE_ROOT/dist/…"
mkdir -p "$SITE_ROOT/dist"
# rsync: delete removed files, preserve permissions, skip hidden dot-dirs
rsync -av --delete \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  "$DIST_DIR/" "$SITE_ROOT/dist/"

# ── 4. Install server-side dependencies ──────────────────────────────────────
echo ""
echo "▶ Installing server npm dependencies…"
(cd "$SITE_ROOT/server" && npm ci --omit=dev 2>/dev/null || npm install --omit=dev)

# ── 5. Start or reload PM2 processes ─────────────────────────────────────────
echo ""
echo "▶ Starting / reloading PM2 processes…"
if pm2 list | grep -q 'places2go-bug-reports'; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo ""
echo "▶ PM2 status:"
pm2 list

# ── 6. Reload Nginx ──────────────────────────────────────────────────────────
echo ""
echo "▶ Reloading Nginx…"
nginx -t && nginx -s reload

echo ""
echo "✅  Deploy complete."
echo "   App:           http://p2g.signaturediversified.com"
echo "   Bug reports:   http://p2g.signaturediversified.com/api/bug-reports"
echo "   Stripe API:    http://p2g.signaturediversified.com/api/stripe"
echo "   Ollama proxy:  http://p2g.signaturediversified.com/api/ollama/"
