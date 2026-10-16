Architecture
System overview
PayBridge is two processes from one codebase (paybridge-api and paybridge-worker) sharing one
PostgreSQL database, plus one Next.js app. PayBridge never holds a Stellar secret key: it builds
unsigned transactions, the company signs them in Freighter, and PayBridge submits and confirms them.

Run-to-paid lifecycle
1. Draft. The company creates a run from groups and/or people. Each line snapshots the employee's
   name and wallet address, and starts at the employee's default amount. Lines can be added,
   removed and re-priced while the run is DRAFT. totalStroops is always the exact bigint sum.
2. Start. POST /start loads every recipient and the funding wallet fresh from Horizon (no cached
   data). Lines whose wallet cannot receive USDC become FAILED with the reason (nothing is sent to
   them). If the funding wallet cannot cover the rest in USDC (balance − selling liabilities) and
   XLM (fees + minimum reserve), the start is refused and nothing changes. Otherwise the run
   becomes PAYING and its lines are frozen.
3. Batch. POST /batches/next takes up to 100 PENDING lines, re-checks them and the funding wallet,
   and builds one unsigned transaction: source = funding wallet, sequence = account sequence + 1,
   one USDC payment op per line, memo "PayBridge payroll #<number>", timebounds now → now + 5 min
   (always strictly later than the run's previous batch, so a rebuilt envelope is never identical).
   The sequence is never behind the last batch this wallet landed (a lagging node can report an older one). Its hash
   is stored; the lines become SENDING. While a batch is AWAITING_SIGNATURE and its window is open,
   asking again returns the same envelope: a second envelope that could also land is never built.
4. Sign. The dashboard asks Freighter to sign the XDR with the funding wallet.
5. Submit. POST /batches/:id/submit with the signed XDR. The server checks the transaction hash
   equals the stored hash (signatures do not change the hash, so any edit is caught), marks the
   batch SUBMITTED, and submits to Horizon.
   Whatever Horizon answers, the batch is settled only from the ledger's own record of the hash
   (looked up straight away, then by the confirmer): found successful → CONFIRMED, every line PAID
   with tx hash, ledger and the ledger's close time; found failed → FAILED, and each line whose
   operation failed for a reason on the recipient's side (no account, no trustline, not authorised,
   line full) becomes FAILED with that reason, every other line goes back to PENDING. A rejection
   (even "tx_failed", which stellar-core also answers at validation) or a timeout is never final on
   its own: the code is recorded and the batch stays SUBMITTED.
6. Confirmer (worker, every 5 s). For every AWAITING_SIGNATURE or SUBMITTED batch: read the funding
   account and the latest ledger, THEN look the hash up (anything landed by then is findable).
   Found → settle as in step 5 (this also catches a batch the company submitted somewhere else).
   Not found, from a Horizon node whose Latest-Ledger is at least the ledger read, and that ledger
   closed more than 30 s after the batch's maxTime (2 minutes if the funding account already used
   the batch's sequence number) → it can never land → EXPIRED, lines back to PENDING. A SUBMITTED
   batch with no answer inside its window is sent again at most every 30 s (the same envelope can
   only land once). Companies take turns; unsigned batches inside their window are looked at every 30 s.
7. Finish. When a PAYING run has no PENDING or SENDING lines left it becomes PAID (every line paid),
   PARTIAL (some paid, some failed) or FAILED (none paid). Retry moves FAILED lines back to PENDING
   after a fresh check and the run back to PAYING. A PAID line never changes again.
8. Cancel. A draft becomes CANCELLED. A run being paid (no open batch) cancels every line not yet
   paid, PENDING and FAILED alike, so retry can't undo it; it ends CANCELLED if nobody was paid,
   else PARTIAL. On a finished PARTIAL/FAILED run, cancel gives up on the failed lines.

What protects each step
Failure | Protection
Paying someone twice | A line is in at most one open batch; one open batch per run; PAID is final; retry only touches FAILED lines
Signed envelope used later | Timebounds (5 min); expiry judged by ledger close time, never server clock
Two envelopes for the same lines both landing | No second envelope while one is open; an open envelope is only replaced after the network shows it can no longer land
Browser swaps the transaction | Server compares the signed XDR's hash with the hash it built
Recipient can't receive | Fresh Horizon check at start and at every batch build; excluded lines are never in a transaction
Funding wallet short | Fresh balance check (USDC spendable, XLM fees + reserve) at start and every batch
Submission timeout | Batch stays SUBMITTED; confirmer settles it from the ledger
Concurrent submit and confirm | SELECT … FOR UPDATE on the batch, conditional status updates
Status jumping somewhere invalid | transitions.ts allowed tables; conditional update on the expected status
Amount edited after start | Line edits only in DRAFT (409 RUN_LOCKED)
Employee wallet edited after a run is created | Lines snapshot name and address

Data model (Prisma, summary; apps/api/prisma/schema.prisma is the source)
Company: id, email, passwordHash, businessName, emailVerifiedAt, notifyPaid, notifyProblems, closedAt, createdAt. Plus Session, TrustedDevice, EmailVerification, PasswordReset, LoginThrottle, RateLimit, ApiKey (unchanged from before).
Wallet (funding wallets): id, companyId, address, label, verifiedAt?, accountExists, trustlines (json), nativeBalance, checkedAt, deletedAt. Unique per company; ownership proof (SEP-53) optional.
WalletChallenge: as before.
Group: id, companyId, name (unique per company), createdAt.
Employee: id, companyId, name, email?, role?, walletAddress, defaultAmountStroops BigInt, groupId?, archivedAt?, check fields (checkReason?, checkedAt?), createdAt, updatedAt. One active employee per (company, wallet).
PayrollRun: id, companyId, number (per company), name, payDate?, walletId, walletAddress (snapshot), assetCode, assetIssuer, status, startedAt?, finishedAt?, notifiedAt?, createdAt, updatedAt. Totals are computed from the lines, never stored.
PayrollItem: id, runId, companyId, employeeId?, position, name, walletAddress, amountStroops, status, failureCode?, failureDetail?, batchId?, opIndex?, txHash?, ledger?, paidAt?, attempts.
PayrollBatch: id, runId, companyId, number, txHash (unique), envelopeXdr, signedXdr?, sequence, maxTime, opCount, totalStroops, status, resultCode?, ledger?, closedAt?, submittedAt?, settledAt?.
PayrollEvent: append-only audit (runId, itemId?, batchId?, type, message, actor, createdAt).

Statuses
Run:   DRAFT → PAYING | CANCELLED; PAYING → PAID | PARTIAL | FAILED | CANCELLED; PARTIAL → PAYING (retry); FAILED → PAYING | CANCELLED. PAID and CANCELLED are final.
Line:  PENDING → SENDING | FAILED | CANCELLED; SENDING → PAID | FAILED | PENDING; FAILED → PENDING (retry) | CANCELLED. PAID and CANCELLED are final.
Batch: AWAITING_SIGNATURE → SUBMITTED | CONFIRMED | FAILED | EXPIRED; SUBMITTED → CONFIRMED | FAILED | EXPIRED. The rest are final.

Failure codes on a line: ACCOUNT_NOT_FOUND, NO_TRUSTLINE, NOT_AUTHORIZED, TRUSTLINE_LIMIT_TOO_LOW, PAYMENT_FAILED (any other recipient-side op failure; failureDetail keeps the raw code).

Security checklist
Accounts and access
[ ] Passwords argon2id, min 10 chars; sessions are 32-byte random tokens, only the HMAC stored, httpOnly Secure SameSite=Lax, 14-day expiry, rotated on login
[ ] CSRF: cookie-authenticated writes must carry Origin = WEB_ORIGIN
[ ] Login rate limit and lockout with trusted-device exemption (unchanged)
[ ] API keys pb_test_ + 32 random bytes, shown once, hash stored, revocable
[ ] Tenant isolation: every repo function takes companyId; tests prove cross-company access returns 404
[ ] Closing an account requires the current password; a closed account's password, reset links and sessions stop working
[ ] Free-text fields refuse anything that looks like a secret key
[ ] Horizon-heavy routes (check, start, next batch, retry, employee checks) have their own budget (20/min per company); at most 12 Horizon requests in flight per process; at most 10 runs being paid per company
Stellar
[ ] Never accept, store or log a secret key: any S… input is refused with SECRET_KEY_REJECTED
[ ] Testnet only: refuse to boot unless NETWORK_PASSPHRASE is the testnet one
[ ] Signed XDR must hash to the stored batch hash; the network passphrase is fixed server-side
[ ] Timebounds on every batch; expiry by ledger close time
Input and output
[ ] Zod .strict() on every body, query and param
[ ] Amounts: ^\d{1,12}(\.\d{1,7})?$ → bigint stroops, > 0; never floats (ESLint bans parseFloat/Number())
[ ] Names, emails, labels length-limited and rendered as plain text
HTTP
[ ] helmet, CORS allowlist = web origin with credentials, JSON body limit 50 kb (200 kb on bulk employee import), trust proxy 1
[ ] Rate limits: 300/min per company on /v1, 5/min on auth credentials
[ ] pino redaction for authorization, cookie, password, key, signedXdr fields

Infrastructure
Unchanged: paybridge-api and paybridge-worker under pm2 (ecosystem.config.cjs), Postgres, Caddy in front
of 127.0.0.1:4200, deploy/deploy.sh with health check and rollback. /health reports DB status and the
number of open batches.
