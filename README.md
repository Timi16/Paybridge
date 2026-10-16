# PayBridge

Payroll in USDC on **Stellar Testnet** (no real money). A company adds its people and their Stellar
wallets, groups them, drafts a payroll run, signs it once in Freighter, and PayBridge sends USDC to
everyone and tracks each payment to **Paid** (with the transaction hash) or **Not sent** (with the
reason). PayBridge is non-custodial: it builds each batch as an unsigned transaction and never holds,
accepts or stores a secret key.

The spec lives in [docs/](docs/). `apps/api` is the backend (API + worker); `apps/web` is the Next.js
landing page and dashboard (Overview, Payroll, People, Settings).

## Run it locally

Needs Node 22+, pnpm and a Postgres 16 database (`pnpm db:up` starts one in Docker).

```sh
pnpm install
cp .env.example .env            # then set SESSION_SECRET: openssl rand -hex 32
pnpm db:up                      # Postgres 16 on localhost:5436
pnpm --filter @paybridge/api db:deploy
pnpm dev                        # API on :4200  (reference at /docs)
pnpm dev:worker                 # batch confirmer + run emails
pnpm seed                       # optional demo data: demo@paybridge.local / demo-password-123
```

> **Upgrading a database from the payment-request version:** the payroll schema replaces the old one
> with a fresh migration (`20261016000000_payroll`). On a dev database, run
> `pnpm --filter @paybridge/api exec prisma migrate reset` (this deletes its data).

## Web app

```sh
cp apps/web/.env.example apps/web/.env.local   # point NEXT_PUBLIC_API_URL at the API
pnpm --filter @paybridge/web dev                 # http://localhost:3000
```

The API only accepts the dashboard from `WEB_ORIGIN` (CORS and the CSRF check), so that value in
`.env` must be exactly the origin the web app is served from, with no trailing slash. In production the
web app and the API must share a registrable domain so the session cookie is sent. Paying needs the
Freighter browser extension on Testnet, holding the funding wallet's account. Password reset emails
need `SMTP_URL`; in development the email is printed in the API log instead.

## How paying works

1. **Start** checks every person and the funding wallet on Horizon. People who can't receive USDC
   (no account, no trustline, …) are marked *Not sent* and left out; if the wallet can't cover the
   rest, nothing changes.
2. **Next batch** builds one unsigned transaction of up to 100 payments, valid for 5 minutes. While it
   is open, the same batch is returned. A second envelope that could also land is never built.
3. The company **signs** it in Freighter; the API checks the signed transaction is exactly the one it
   built and **submits** it.
4. The **worker's confirmer** settles anything Stellar hasn't answered yet from the ledger (including a
   batch submitted somewhere else), re-sends signed batches inside their window, and expires a batch
   only when the ledger has closed past its window and it can no longer land.
5. Failed people can be **retried** once their wallet is fixed; a paid line is never sent again.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
```

`pnpm test` starts a throwaway Postgres with Testcontainers (Docker) and runs every edge case against
an in-memory fake Stellar network. Each case has a test named with its ID
(`grep -rhoE '"(E|R|S)[0-9]+' apps/api/test | sort -u`).

## Proving it on real testnet

```sh
pnpm scenario
```

Creates Friendbot accounts and its own test "USDC" issuer, runs the API in-process, and pays three
people from a funding wallet: two are paid in one transaction, one without a trustline is left out,
then added after the trustline exists. It checks the balances on chain (exact, paid once each) and
prints the explorer links. Takes about a minute.

## Environment

See [.env.example](.env.example). `config/env.ts` validates everything at boot and refuses
to start on any network but testnet.

## Deploy

**Backend (pm2).** The API and the worker (batch confirmer, run emails) are two pm2 processes from one build, defined in
[ecosystem.config.cjs](ecosystem.config.cjs). On the server (Node 22+, pnpm, pm2, Docker for Postgres):

```sh
git clone <repo> ~/paybridge && cd ~/paybridge
cp .env.example .env            # fill in: NODE_ENV=production, WEB_ORIGIN, SESSION_SECRET, DATABASE_URL, POSTGRES_PASSWORD
docker compose up -d            # Postgres in Docker (compose.yaml), on localhost:5436
pnpm install --frozen-lockfile
pnpm --filter @paybridge/api db:deploy
pnpm build
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

Later deploys: `./deploy/deploy.sh <git sha>` pulls, migrates, builds, runs `pm2 reload`, polls
`/health` for 60 s and rolls back to the previous commit if it stays unhealthy.
[.github/workflows/ci.yml](.github/workflows/ci.yml) runs audit, lint, typecheck, tests and both builds,
then calls that script over SSH: set the `DEPLOY_SSH_KEY`, `DEPLOY_HOST` and `DEPLOY_USER` secrets (and the
`DEPLOY_PATH` variable if the repo isn't at `~/Paybridge`); without them the deploy step is skipped.
After changing a dependency in a `package.json`, run `pnpm install` and commit `pnpm-lock.yaml` too: CI
and Vercel install with a frozen lockfile.

- Run exactly **one** `paybridge-worker`.
- Put Caddy in front ([deploy/Caddyfile.snippet](deploy/Caddyfile.snippet)) for HTTPS; the API listens on
  `127.0.0.1` and trusts exactly one proxy hop.
- Log rotation: `pm2 install pm2-logrotate`.

**Web app (Vercel).** Import the repo in Vercel with **Root Directory = `apps/web`** and set
`NEXT_PUBLIC_API_URL` (e.g. `https://api.paybridge.example.com`) and `NEXT_PUBLIC_HORIZON_URL`.
Two things must line up or sign-in will not work:

- The API's `WEB_ORIGIN` must be exactly the address the site is served from (scheme and host, no
  trailing slash). Preview deployments on other addresses are refused by the API.
- The site and the API must share a registrable domain (`paybridge.example.com` and
  `api.paybridge.example.com`). On a `*.vercel.app` address with the API elsewhere, browsers treat the
  session cookie as third-party and drop it. Use a custom domain for both.

## Runbook

| Symptom | What to check |
| --- | --- |
| `/health` is 503 | Postgres is down or unreachable. The worker pauses and resumes by itself. |
| `openBatches` stays above 0 | Batches waiting for a signature or for Stellar. The worker settles them within the 5-minute window plus up to 2 minutes; check its logs if Horizon is unreachable. |
| A run is stuck in "Paying" with nothing to sign | Check the run's Transactions: a batch "Confirming on Stellar" settles by itself; if the funding wallet ran short, top it up and press "Sign and pay the remaining". |
| A person is "Not sent" | Their reason is on the line (e.g. no USDC trustline). Once fixed, "Check again and retry" on the run. |
| Testnet was reset | Testnet accounts vanish; funding wallets and employees must be re-funded and re-trusted. Past runs keep their record. |
