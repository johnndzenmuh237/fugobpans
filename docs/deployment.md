# Deployment Guide — FUGOBPANS ERP

This system has two independent pieces that get deployed separately:

1. **The API** (`server/`) — an always-on Node/Express process talking to PostgreSQL.
2. **The static frontend** (`public/` + `assets/`) — plain HTML/CSS/JS, served from anywhere.

There is no Firebase, no serverless wrapper built in yet — the API is a
normal long-running Node server, so it needs a host that keeps a process
alive (not a "functions" platform). Render is used as the primary example
below because it gives you a managed Postgres database and a web service
in one place with a generous free tier; Railway and Fly.io work the same
way if you'd rather use one of those instead.

---

## 0. Before you start

- A GitHub account with this project pushed to a repo (see the Git steps
  at the end if you haven't done this yet).
- A Campay account (https://www.campay.net) for Mobile Money payments.
- About 20–30 minutes.

---

## 1. Create the PostgreSQL database

### Option A — Render Postgres (recommended, simplest)
1. Go to https://dashboard.render.com → **New → PostgreSQL**.
2. Name it (e.g. `fugobpans-db`), pick the free tier, pick a region close
   to your users (Frankfurt or a European region is closest to Cameroon).
3. Once created, copy the **"External Database URL"** shown on its page —
   this is your `DATABASE_URL`. It looks like:
   ```
   postgresql://fugobpans_user:somepassword@dpg-xxxxx.frankfurt-postgres.render.com/fugobpans_db
   ```

### Option B — Neon (also free, works identically)
1. Go to https://neon.tech → create a project.
2. Copy the connection string it gives you (starts with `postgresql://`).
3. Neon requires SSL by default, which the project already expects
   (`DATABASE_SSL=true` in `.env.example`).

Either option gives you the one thing you need: a `DATABASE_URL` string.

---

## 2. Apply the database schema

You need Node installed locally for this one-time step (you already have
it from local development).

```bash
cd fugobpans-erp
cp .env.example .env
```

Open `.env` and set:
```
DATABASE_URL=<paste the connection string from step 1>
DATABASE_SSL=true
JWT_SECRET=<generate a long random string — see below>
```

Generate a strong `JWT_SECRET` (run this locally, paste the output in):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Now install dependencies and run the schema:
```bash
npm install
npm run migrate
```

You should see:
```
[migrate] Applying database/schema.sql ...
[migrate] Done.
[migrate] School settings seeded from the flyer.
```

If your database was created **before** the Student Portal / Results
feature was added, also run the incremental migration once:
```bash
psql "$DATABASE_URL" -f database/migration-2-student-portal.sql
```
(Brand new databases don't need this — `schema.sql` already includes it.)

---

## 3. Deploy the API

### On Render
1. Dashboard → **New → Web Service** → connect your GitHub repo.
2. **Root Directory:** leave blank (repo root).
3. **Build Command:** `npm install`
4. **Start Command:** `npm start` (this runs `node server/server.js`)
5. **Environment Variables** — add everything from your `.env`:
   - `DATABASE_URL`, `DATABASE_SSL=true`
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `CLIENT_ORIGIN` — set this once you know your frontend's URL (step 4); comma-separate multiple origins if needed
   - `CAMPAY_BASE_URL`, `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`
   - `PAYMENT_CALLBACK_URL` — `https://<your-render-service>.onrender.com/api/payments/webhook`
   - `SCHOOL_CURRENCY=FCFA`, `DEFAULT_TIMEZONE=Africa/Douala`
6. Click **Create Web Service**. Render builds and starts it — you'll get
   a URL like `https://fugobpans-api.onrender.com`.
7. Verify: visit `https://fugobpans-api.onrender.com/api/health` — you
   should see `{"ok":true,...}`.

### On Railway (alternative)
Same idea: **New Project → Deploy from GitHub → Add a Postgres plugin (or use your Neon URL) → set the same environment variables → Start Command: `npm start`.**

---

## 4. Deploy the static frontend

The frontend is just files — any static host works. Two easy options:

### Option A — Vercel
1. https://vercel.com → **Add New → Project** → import the same repo.
2. **Framework Preset:** Other.
3. **Root Directory:** `public` (this tells Vercel the site root is your `public/` folder, so `index.html` etc. serve correctly).
4. **Important:** the `assets/` folder lives *next to* `public/`, not inside it, in this repo — so before deploying, either:
   - (a) move `assets/` into `public/assets/` in your repo (recommended — one clean static root), **or**
   - (b) add a Vercel rewrite so `/assets/*` on the deployed site maps to the `assets/` folder at the repo root.
   
   Path (a) is simpler. If you go that route:
   ```bash
   mv assets public/assets
   git add .
   git commit -m "Move assets into public/ for static hosting"
   git push
   ```
5. Deploy. You'll get a URL like `https://fugobpans.vercel.app`.

### Option B — Netlify
Same idea: **New site from Git → Base directory: (repo root) → Publish directory: `public`**, with the same `assets/` note as above.

### Point the frontend at your deployed API
Edit `assets/js/config.js` (or `public/assets/js/config.js` if you moved
it) and set:
```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://fugobpans-api.onrender.com/api',
};
```
Commit and push — your static host redeploys automatically.

### Update CORS on the API
Go back to Render → your API service → Environment → update
`CLIENT_ORIGIN` to your real frontend URL (e.g.
`https://fugobpans.vercel.app`), save — Render redeploys the API
automatically. This is required or the browser will block every request
with a CORS error.

---

## 5. Create the first Manager account

Run this **once**, from your local machine, with `DATABASE_URL` in your
local `.env` pointed at the **production** database:

```bash
npm run create-manager -- "Your Name" manager@fugobpans.example "A-Strong-Password!"
```

Log in at `https://fugobpans.vercel.app/login.html` and change the
password immediately (there's no in-app "change password" UI wired up
yet in this build — track that as a small follow-up, or update it
directly via the `/api/auth/change-password` endpoint with a REST client
for now).

---

## 6. Configure the Campay webhook

In your Campay dashboard, set the webhook/callback URL to:
```
https://fugobpans-api.onrender.com/api/payments/webhook
```
Use **Sandbox** credentials in `CAMPAY_USERNAME`/`CAMPAY_PASSWORD` while
testing, switch to **Live** credentials once Campay approves your account
and you're ready to accept real Mobile Money payments — then update the
environment variables on Render and it redeploys.

---

## 7. Schedule the daily auto-absence sweep

This system needs something to trigger `npm run absence-sweep` once a
day, shortly after your configured attendance cutoff (default 9:00 AM,
editable in Settings). Render's free tier doesn't include a built-in
cron scheduler, so pick one of these:

### Option A — Render Cron Job (paid tier feature)
Dashboard → **New → Cron Job** → same repo → Command: `npm run absence-sweep` → Schedule: `0 9 * * *` (9:00 AM daily, adjust for your timezone — Render crons run in UTC, so for 9:00 AM Douala time (UTC+1) use `0 8 * * *`).

### Option B — GitHub Actions (free, works on any host)
Create `.github/workflows/absence-sweep.yml` in your repo:
```yaml
name: Daily Absence Sweep
on:
  schedule:
    - cron: '0 8 * * *' # 9:00 AM Africa/Douala (UTC+1)
jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
      - run: npm run absence-sweep
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DATABASE_SSL: 'true'
```
Add `DATABASE_URL` as a GitHub Actions secret (repo → Settings → Secrets
and variables → Actions → New repository secret).

### Option C — cron-job.org (free, simplest, but needs an HTTP endpoint)
This requires exposing a small authenticated HTTP endpoint that triggers
the sweep — not wired up in this build by default. Options A or B are
recommended instead unless you want to add that endpoint yourself.

---

## 8. Custom domain (optional)

- **Frontend (Vercel/Netlify):** Project → Settings → Domains → add your domain, follow the DNS instructions.
- **API (Render):** Service → Settings → Custom Domains → add e.g. `api.fugobpans.com`.
- After adding a custom domain, update `CLIENT_ORIGIN` on the API and `API_BASE_URL` in `config.js` to match, then redeploy both.

---

## 9. Verify everything end-to-end

- [ ] `https://your-api-url/api/health` returns `{"ok":true}`
- [ ] The public site loads and the class list on `/classes.html` shows real data (empty is fine until you add categories/classes/fees as Manager)
- [ ] Manager can log in and reach `/admin/dashboard.html`
- [ ] Manager can create a Category, a Class, and a Fee Structure
- [ ] A test registration on `/register.html` succeeds and shows up under **Registrations**
- [ ] A test Mobile Money payment (sandbox) updates the invoice status automatically
- [ ] Manager can create a Worker, and that worker immediately appears on **Attendance**
- [ ] Manager can assign a teacher to a class/subject, and that teacher's login shows the class under **My Classes** with the auto-populated student list under **Upload Results**
- [ ] Manager can create a Student Portal login from a student's profile, and that student can log in and see their own fees/results only

---

## 10. Pushing future changes

Both Render and Vercel/Netlify auto-deploy on every `git push` to your
main branch by default — there's no manual redeploy step for ordinary
code changes once this initial setup is done.

---

## Quick reference: environment variables

| Variable | Where used | Example |
|---|---|---|
| `DATABASE_URL` | API | `postgresql://user:pass@host/db` |
| `DATABASE_SSL` | API | `true` |
| `JWT_SECRET` | API | long random hex string |
| `NODE_ENV` | API | `production` |
| `CLIENT_ORIGIN` | API (CORS) | `https://fugobpans.vercel.app` |
| `CAMPAY_BASE_URL` | API | `https://www.campay.net/api` |
| `CAMPAY_USERNAME` / `CAMPAY_PASSWORD` | API | from Campay dashboard |
| `PAYMENT_CALLBACK_URL` | API + Campay dashboard | `https://your-api/api/payments/webhook` |
| `API_BASE_URL` | Frontend (`assets/js/config.js`) | `https://your-api/api` |
