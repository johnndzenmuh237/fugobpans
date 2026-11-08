# Deploying: Neon (database) + Render (API) + Firebase (website & keep-alive)

## 1. Neon — the database
1. Create a project in Neon. Copy the **direct** connection string (it ends with `?sslmode=require`).
2. From your computer (with that string in `.env` as `DATABASE_URL`):
   - **Brand-new database:** `npm run migrate` then `npm run upgrade-db`
   - **Existing database:** `npm run upgrade-db` (adds the new tables/columns; nothing is deleted)
3. Create the school Owner (once): `npm run create-owner -- "Full Name" owner@school.com`
   A random temporary password is printed once. Log in at `/owner/login.html` and you will be asked to change it.
4. Neon puts idle databases to sleep after ~5 minutes; the first request afterwards is a little slower. The API retries once automatically. Do **not** ping the database to keep it awake — that uses up your free compute hours.

## 2. Render — the API
1. New > Blueprint, point at this repo (it reads `render.yaml`), or create a Web Service manually:
   build `npm ci --omit=dev`, start `npm run upgrade-db && npm start`, health check `/api/health`.
2. Set environment variables: `DATABASE_URL` (Neon), `CLIENT_ORIGIN` (your Firebase URL, no trailing slash), `JWT_SECRET` (generated), `NODE_ENV=production`, plus payment and email settings.
3. Plan: the **free** instance sleeps when idle. Either use **Starter** (never sleeps) or the keep-alive below.

## 3. Firebase — website that is always online
1. `npm i -g firebase-tools && firebase login`, put your project id in `.firebaserc`.
2. If your Render URL differs from `https://fugobpans.onrender.com`, change it in `public/assets/js/config.js`.
3. `firebase deploy --only hosting` — serves the `public/` folder. Hosting does not sleep.

## 4. Keeping the Render API awake (pick one)
- **Firebase scheduled function** (needs the Blaze plan; cost is normally zero): create `firebase/functions/.env` with
  `API_HEALTH_URL=https://YOUR-SERVICE.onrender.com/api/health`, run `cd firebase/functions && npm install`, then `firebase deploy --only functions`.
- **GitHub Action (free):** add repository variable `API_HEALTH_URL`; `.github/workflows/keepalive.yml` pings every 10 minutes.
- **Render Starter plan:** no pinging needed.

Firebase itself cannot keep a Render service running; a scheduled ping (or a paid Render plan) is what does that.

## 5. Important: cookies across two domains
The website (Firebase) and the API (Render) are different sites, so the login cookie is "third-party". Chrome/Edge/Firefox allow it today, but **Safari/iPhone often block it, so logins can fail there.** The reliable fix is a custom domain for both, e.g. `school.example.com` (Firebase) and `api.school.example.com` (Render), then put the API address in `config.js` and the website address in `CLIENT_ORIGIN`. Alternatively set `SERVE_FRONTEND=true` on Render and use the Render URL for everything (same site, no cookie problem).

## 6. After deploying
- Run `npm run smoke-test` only against a **test** database — it creates sample users.
- Rotate any password or secret that was ever shared in a zip or chat.
