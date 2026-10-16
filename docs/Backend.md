Backend
Stack
Node.js 22, Express 5, TypeScript strict (noUncheckedIndexedAccess), PostgreSQL 16 via Prisma 6,
Zod + zod-to-openapi (Scalar at /docs), @stellar/stellar-sdk (TransactionBuilder, Operation, Asset,
StrKey, Keypair, xdr), helmet, cors, express-rate-limit, cookie-parser, argon2, pino, Vitest +
supertest + Testcontainers.

Folder structure (apps/api/src)
  server.ts, worker.ts, app.ts (buildApp, used by tests), deps.ts
  config/env.ts            Zod env; testnet passphrase enforced
  db/prisma.ts
  lib/                     amount.ts, asset.ts, ids.ts, cursor.ts, errors.ts, logger.ts, mailer.ts, emails.ts
  stellar/gateway.ts       StellarGateway interface (accounts, latest ledger, submit, transaction lookup)
  stellar/horizonGateway.ts  Horizon implementation
  stellar/results.ts       decode Horizon result codes and result XDR into per-operation codes
  middleware/              requestId, auth, requireOrigin, rateLimit, pgRateLimitStore, validate, errorHandler
  modules/
    auth/, apiKeys/, health/
    wallets/               funding wallets: add, refresh, challenge, verify, remove
    groups/                list, create, rename, delete
    employees/             list, create, update, archive, restore, check, import
    payroll/               routes, service, repo, serialize
      transitions.ts       the ONLY place run, line and batch statuses change
      checks.ts            recipient + funding checks (fresh Horizon data)
      batches.ts           build unsigned transactions
      settle.ts            apply a submit result or a ledger lookup to a batch and its lines
    summary/               overview numbers
  engine/confirmer.ts      worker loop: resolve AWAITING_SIGNATURE / SUBMITTED batches
  engine/notifier.ts       worker loop: email the company when a run finishes
  engine/alerter.ts

Layering: routes → service → repo. Repo functions on company data take (db, companyId, …) and put
companyId in every where. ESLint forbids `status:` in any payrollRun / payrollItem / payrollBatch
update outside modules/payroll/transitions.ts.

Auth
requireAny: Authorization: Bearer pb_test_… (API key) or the pb_session cookie. Wallet and API-key
management are session-only. Cookie writes require Origin = WEB_ORIGIN.

Error format
{ "error": { "code": "RUN_LOCKED", "message": "…", "details": [], "requestId": "…" } }
Codes (HTTP): VALIDATION_FAILED 400, SECRET_KEY_REJECTED 400, ACCOUNT_NOT_FOUND 400,
INSUFFICIENT_FUNDS 400, TX_MISMATCH 400, INVALID_SIGNATURE 400, CHALLENGE_EXPIRED 400,
INVALID_CODE 400, UNAUTHENTICATED 401, INVALID_CREDENTIALS 401, EMAIL_NOT_VERIFIED 403,
FORBIDDEN_ORIGIN 403, NOT_FOUND 404, INVALID_TRANSITION 409, RUN_LOCKED 409, NOTHING_TO_PAY 409,
WALLET_IN_USE 409, WALLET_TAKEN 409, NAME_TAKEN 409, EMAIL_TAKEN 409, LIMIT_REACHED 409,
PAYLOAD_TOO_LARGE 413, RATE_LIMITED 429, INTERNAL 500, HORIZON_UNAVAILABLE 503, SERVICE_UNAVAILABLE 503.

Amounts are decimal strings in JSON ("1500.0000000"), with stroops alongside ("15000000000").

REST API
Auth (session): POST /auth/signup {email, password, businessName} · POST /auth/login · POST /auth/logout ·
GET /auth/me · POST /auth/password · POST /auth/settings {businessName?, notifyPaid?, notifyProblems?} ·
POST /auth/email/verify · POST /auth/email/resend · POST /auth/password/forgot · POST /auth/password/reset ·
GET/DELETE /auth/sessions · POST /auth/sessions/logout-others · POST /auth/close {password, confirm: "CLOSE"}

API keys (session): GET/POST /v1/api-keys · DELETE /v1/api-keys/:id

Funding wallets (session): GET /v1/wallets · POST /v1/wallets {address, label?} · POST /v1/wallets/:id/refresh ·
POST /v1/wallets/:id/challenge · POST /v1/wallets/:id/verify · DELETE /v1/wallets/:id
Wallet: { id, address, label, verified, accountExists, usdcBalance, xlmBalance, hasUsdcTrustline, checkedAt }

Groups (any): GET /v1/groups → { data: [{ id, name, employeeCount }] } · POST /v1/groups {name} ·
PATCH /v1/groups/:id {name} · DELETE /v1/groups/:id (members become ungrouped)

Employees (any)
GET /v1/employees ?q, groupId ("none" for ungrouped), status (active|archived), cursor, limit
POST /v1/employees {name, email?, role?, walletAddress, defaultAmount, groupId?} → 201 { employee } (recipient check best effort)
POST /v1/employees/import {employees: [...] (≤500)} → { created, errors: [{ row, message }] } (all-or-nothing)
GET /v1/employees/:id · PATCH /v1/employees/:id · POST /v1/employees/:id/archive · POST /v1/employees/:id/restore
POST /v1/employees/check {ids?} → re-checks (fresh) up to 200 employees; returns them
Employee: { id, name, email, role, walletAddress, defaultAmount, defaultAmountStroops, group: {id,name}|null,
  archived, check: { status: "ready"|"problem"|"unchecked", reason, checkedAt } }

Payroll runs (any)
GET /v1/payroll-runs ?status, cursor, limit → { data: RunSummary[], nextCursor }
POST /v1/payroll-runs {name, walletId, payDate?, groupIds?, employeeIds?} → 201 { run }
GET /v1/payroll-runs/:id → { run } with items, batches, events
PATCH /v1/payroll-runs/:id {name?, payDate?, walletId?} (DRAFT)
POST /v1/payroll-runs/:id/items {employeeIds?, groupIds?} (DRAFT; people already on the run are skipped)
PATCH /v1/payroll-runs/:id/items/:itemId {amount} (DRAFT) · DELETE /v1/payroll-runs/:id/items/:itemId (DRAFT)
GET /v1/payroll-runs/:id/check → read-only pre-flight: per-line { ok, reason }, funding { usdcAvailable, xlmAvailable, enough, shortBy }
POST /v1/payroll-runs/:id/start → { run } (DRAFT → PAYING; 400 INSUFFICIENT_FUNDS; 409 NOTHING_TO_PAY)
POST /v1/payroll-runs/:id/batches/next → { batch: { id, number, xdr, txHash, maxTime, opCount, total }, run } or { batch: null, run }
POST /v1/payroll-runs/:id/batches/:batchId/submit {signedXdr} → { batch, run } (200 settled, 202 still SUBMITTED)
POST /v1/payroll-runs/:id/retry {itemIds?} → { run } (fresh check first; lines still failing stay FAILED)
POST /v1/payroll-runs/:id/cancel → { run } (DRAFT, or PAYING with no SENDING lines)
DELETE /v1/payroll-runs/:id (DRAFT only)

Summary (any): GET /v1/summary → { paidThisMonth, peoplePaidThisMonth, failedLines, activeEmployees,
  draftRuns: RunSummary[], recentRuns: RunSummary[], monthly: [{ month, paid }] (last 6), wallets }

Other: GET /health · GET /openapi.json · GET /docs

Stellar gateway
interface StellarGateway {
  loadAccount(address): { exists: false } | { exists: true, sequence, nativeBalance, nativeSellingLiabilities,
    subentries, sponsoring, sponsored, trustlines: [{ code, issuer, limit, balance, buyingLiabilities, sellingLiabilities, authorized }] }
  latestLedger(): { sequence, closedAt }
  getTransaction(hash): null | { successful, ledger, closedAt, resultXdr }
  submit(signedXdr): { kind: "success", ledger, closedAt } | { kind: "failed", txCode, opCodes[] } | { kind: "unknown" }
}
Horizon errors throw HORIZON_UNAVAILABLE. Bulk loads run 8 at a time.

Recipient check: account exists; a USDC trustline with the configured issuer, authorised; limit − balance −
buying liabilities ≥ amount. Funding check: USDC balance − selling liabilities ≥ amount; XLM balance −
selling liabilities − (2 + subentries + sponsoring − sponsored) × 0.5 XLM ≥ fee (1000 stroops bid per op; Testnet charges the 100-stroop base fee unless it is congested).

Op result → line: op_no_destination → ACCOUNT_NOT_FOUND; op_no_trust → NO_TRUSTLINE;
op_not_authorized → NOT_AUTHORIZED; op_line_full → TRUSTLINE_LIMIT_TOO_LOW; op_success / op_underfunded /
op_src_* / op_no_account / op_bad_auth → back to PENDING (not the recipient's fault); anything else → PAYMENT_FAILED.

Worker
confirmer every 5 s (SUBMITTED batches; unsigned ones every 30 s or once past their window; companies round-robin, 40 per tick), notifier every 15 s,
counter pruning hourly. Exactly one worker.

Env
NODE_ENV, PORT (4200), HOST, DATABASE_URL, HORIZON_URL, NETWORK_PASSPHRASE (testnet only), USDC_ISSUER,
WEB_ORIGIN, SESSION_SECRET, SMTP_URL?, MAIL_FROM, EMAIL_VERIFICATION, BATCH_WINDOW_SECONDS (300),
ALERT_TELEGRAM_*?, LOG_LEVEL. STELLAR_RPC_URL is no longer used.

Testing plan
Each case gets at least one test whose name starts with its ID.

People
E1  Invalid address, M-address or S… secret as an employee or funding wallet → 400; secret never stored or logged
E2  Same wallet on two active employees of one company → 409 WALLET_IN_USE (archived ones don't count)
E3  Default or line amount 0, negative, > 7 decimals, too large → 400
E4  Archived employee: not added to new runs, still shown on old runs (snapshot)
E5  Deleting a group ungroups its members
E6  Recipient check: missing account / no trustline / unauthorised / limit too low → reason stored and shown

Runs
R1  Run from groups + people: one line per active employee, no duplicates, amounts = defaults, total = exact sum
R2  Edits outside DRAFT → 409 RUN_LOCKED
R3  Start: lines that can't receive become FAILED with the reason; the rest proceed
R4  Start: funding wallet short of USDC or XLM → 400 INSUFFICIENT_FUNDS, nothing changes
R5  Start with nothing payable → 409 NOTHING_TO_PAY
R6  Next batch: ≤ 100 ops, one payment per line, correct sequence, memo and timebounds; asking again returns the same envelope
R7  Submit with a different transaction → 400 TX_MISMATCH
R8  Submit success → lines PAID with hash, ledger, time; run PAID
R9  tx_failed with op_no_trust on one op → that line FAILED (NO_TRUSTLINE), others back to PENDING, run stays PAYING
R10 Submit times out → batch SUBMITTED; confirmer finds it → PAID; a signed batch the network never got is sent again inside its window
R11 Batch submitted elsewhere (never through PayBridge) → confirmer finds it → PAID
R12 Window passes (by ledger close time) with nothing on chain → EXPIRED, lines PENDING; next batch builds a new envelope
R13 Retry: FAILED → PENDING only after a passing check; PAID lines are never queued again
R14 Cancel: DRAFT → CANCELLED; PAYING without SENDING lines → every unpaid line CANCELLED, run CANCELLED (nobody paid) or PARTIAL, retry can't undo it; with SENDING lines → 409
R15 Finish: all paid → PAID; some → PARTIAL; none → FAILED
R16 Same signed XDR submitted twice / submit racing the confirmer / landed elsewhere first (our submit gets tx_bad_seq, a lagging node 404s) → settled once, as paid
R17 Rejected before a ledger (tx_bad_seq, fee…) → not final: SUBMITTED until the ledger passes the window (plus 2 min if the sequence was used), then EXPIRED, lines PENDING

System
S1  Horizon down during check/start/batch → 503, nothing changes
S2  Postgres down → 503 from the API
S3  Worker restart: SUBMITTED batches are still resolved
S4  Boot refuses a non-testnet passphrase

Tenant isolation: every /v1 route returns 404 for another company's IDs.
