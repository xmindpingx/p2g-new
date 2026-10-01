# places2go — aaPanel + Nginx Deployment Runbook

> Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved.
>
> **Live URL:** http://p2g.signaturediversified.com (HTTPS once cert issued)

---

## DNS Setup (do once in your domain registrar / DNS panel)

Add an **A record** pointing the subdomain at your server's public IP:

```
Type   Host   Value              TTL
A      p2g    YOUR.SERVER.IP     300 (or auto)
```

- `signaturediversified.com` is the apex; `p2g` is the subdomain.
- If your server IP is already in an existing A record for `signaturediversified.com`, you still need a **separate A record** for `p2g`.
- TTL 300 (5 min) while you're setting up; bump to 3600 after it's confirmed working.

Verify propagation (run from anywhere):
```bash
dig p2g.signaturediversified.com A +short
# should print your server's IP
```

---

## Overview

| Component | Where it runs | Port |
|---|---|---|
| React Native web app (static) | Nginx → `/dist` | 80 / 443 |
| Bug-report server | PM2 (Node) | 3001 (internal) |
| Stripe server | PM2 (Node) | 3002 (internal) |
| Ollama | System service | 11434 (internal) |

The two Node servers and Ollama are **never exposed directly**. Nginx proxies them under `/api/bug-reports`, `/api/stripe`, and `/api/ollama/`.

---

## Prerequisites (do once)

### 1. Clone the repo onto the server

```bash
cd /www/wwwroot
git clone https://github.com/YOUR_USER/places2go.git
# or copy the project folder via SFTP
```

### 2. Create the secrets file

```bash
cp places2go/server/.env.example places2go/server/.env
nano places2go/server/.env
```

Fill in:
- `STRIPE_SECRET_KEY=sk_live_...`  (your Stripe secret — never commit this)

### 3. Make sure Node ≥ 18 is available

aaPanel Node.js manager installs Node into `/www/server/nvm/versions/node/vX.Y.Z/bin`.
Check which version is active:

```bash
node -v   # should print v18 or v20+
npm -v
```

If not, open aaPanel → App Store → Node.js Version Manager → switch to 18 or 20.

### 4. Install PM2 globally (if not already)

```bash
npm install -g pm2
```

### 5. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
# Then pull a model:
ollama pull qwen2.5vl:7b       # for vision/moderation
ollama pull qwen2.5:7b         # for text moderation / outreach
```

Start Ollama as a service so it survives reboots:

```bash
# aaPanel or systemd:
systemctl enable ollama
systemctl start ollama
# verify:
curl http://127.0.0.1:11434/api/tags
```

---

## First Deploy

### Step 1 — Install app dependencies

```bash
cd /www/wwwroot/places2go
npm ci
```

### Step 2 — Build the Expo web export

```bash
npx expo export --platform web --output-dir dist --clear
```

Output lands in `/www/wwwroot/places2go/dist/`.

### Step 3 — Install server dependencies

```bash
cd /www/wwwroot/places2go/server
npm install --omit=dev
cd ..
```

### Step 4 — Add the Nginx vhost

In aaPanel → Website → Add Site, create a site for your domain and note the config path (usually `/www/server/nginx/conf/vhost/p2g.signaturediversified.com.conf`).

Replace the generated config with the template from `deploy/nginx-places2go.conf`:

```bash
cp deploy/nginx-places2go.conf /www/server/nginx/conf/vhost/p2g.signaturediversified.com.conf
# Edit the two domain placeholders and the root path:
nano /www/server/nginx/conf/vhost/p2g.signaturediversified.com.conf
```

Key lines to update:
```nginx
server_name p2g.signaturediversified.com www.p2g.signaturediversified.com;
root  /www/wwwroot/places2go/dist;
```

Test and reload:
```bash
nginx -t && nginx -s reload
```

### Step 5 — Edit `ecosystem.config.js`

Open `/www/wwwroot/places2go/ecosystem.config.js` and change every `cwd` and the `BUG_REPORT_DIR` path to match your actual install path (replace `/www/wwwroot/places2go` if yours differs).

### Step 6 — Start PM2

```bash
cd /www/wwwroot/places2go
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # prints a command — run that command as root to enable auto-start
```

Check they're running:
```bash
pm2 list
pm2 logs places2go-bug-reports --lines 20
```

### Step 7 — Configure the app (in-app Admin Settings)

Open the web app in a browser. Sign in with your admin account, then go to **Profile → Admin Panel → App Settings** and fill in:

| Setting | Value |
|---|---|
| Bug Report URL | `https://p2g.signaturediversified.com/api/bug-reports` |
| Ollama Base URL | `https://p2g.signaturediversified.com/api/ollama` |
| Ollama Model | `qwen2.5:7b` (or whichever text model you pulled) |
| Ollama Vision Model | `qwen2.5vl:7b` (for screenshot analysis) |
| Stripe Publishable Key | `pk_live_...` (from Stripe dashboard) |
| Stripe Merchant ID | your Apple Pay merchant ID (optional) |

> The app stores these in Zustand / AsyncStorage. They never touch the repo or the server .env.

---

## SSL / HTTPS (optional but recommended)

1. In aaPanel → Website → your site → SSL, apply for a Let's Encrypt cert.
2. Once issued, uncomment the `ssl_*` lines in the Nginx config and add the redirect block.
3. `nginx -t && nginx -s reload`

After that, update the Bug Report URL and Ollama URL in Admin Settings to `https://`.

---

## Updating the App

After pushing new code:

```bash
cd /www/wwwroot/places2go
git pull
bash deploy/deploy.sh
```

`deploy.sh` rebuilds the export, syncs to the dist folder, reloads PM2, and reloads Nginx.

Or do it manually:

```bash
npm ci
npx expo export --platform web --output-dir dist --clear
rsync -av --delete dist/ /www/wwwroot/places2go/dist/
pm2 reload ecosystem.config.js --update-env
nginx -s reload
```

---

## Port Conflict Notes

- **Port 3000** was occupied by CyberPanel. PM2 does not use it — `bug-reports` is on **3001**, Stripe on **3002**. Neither is exposed externally; Nginx proxies them.
- If you ever see `EADDRINUSE: 3001` or `3002`, another process is already on that port. Check with: `ss -tlnp | grep 300`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App loads but `/api/bug-reports` returns 502 | PM2 process crashed — `pm2 logs places2go-bug-reports` |
| Blank white screen on load | Check Nginx error log: `tail -50 /www/wwwlogs/places2go-error.log` |
| Ollama times out | Confirm service is running: `systemctl status ollama`; model may still be loading |
| Screenshot upload returns 413 | Increase `client_max_body_size` in Nginx config (currently 25m) |
| Stripe payments fail | Double-check `STRIPE_SECRET_KEY` in `server/.env` (no trailing spaces); reload PM2 |
