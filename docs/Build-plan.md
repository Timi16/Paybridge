PayBridge Payroll — Build Plan
16 Oct 2026 · @Timmy

Scope change (16 Oct 2026)
PayBridge was a payment-request app (a customer pays a merchant). It is now a payroll app (a company
pays its people). Payment requests, the public checkout, memos, the chain-event matcher and the
unmatched-payments flow are removed; they stay in git history before this change. Auth, sessions,
API keys, wallet checks, amount handling, deploy and the design kit carry over.

The brief
A simple payroll platform on Stellar Testnet:
1. Employee management: add and manage employees, save each one's Stellar wallet, group them.
2. Payroll: create a run, set what each person receives, see the exact total, review and pay.
3. Stellar: send USDC to everyone, track each payment, show success or failure, keep the tx hash.
4. Dashboard: employees and amounts, create and execute payroll, paid and failed payments, hashes and run status.

End-to-end flow
1. A company signs up, confirms its email, adds a funding wallet (the Stellar account payroll is paid from).
2. It adds employees: name, email, G… address, default amount, group. PayBridge checks each wallet can receive USDC.
3. It creates a payroll run from groups and/or people. Each line starts at the person's default amount and can be changed while the run is a draft. The total is the exact sum, in stroops.
4. Review: PayBridge re-checks every recipient and the funding wallet's balance on Horizon. People who cannot receive are shown and excluded; the company starts paying the rest.
5. Pay: PayBridge builds one transaction of up to 100 USDC payments. The company signs it once in Freighter. PayBridge submits it to Stellar and records the result. Repeat per batch of 100.
6. Each payment ends Paid (with tx hash, ledger and time) or Failed (with the reason). Failed payments can be retried once the problem is fixed; a paid line is never sent again.

Decisions already made
• Backend: Node.js 22 + Express 5 + TypeScript, Prisma, PostgreSQL 16. No Redis.
• Frontend: one Next.js app (landing, auth, dashboard).
• Non-custodial: PayBridge never sees or stores a secret key. The company signs every batch in Freighter. PayBridge builds, checks, submits and confirms.
• Stellar data: Horizon only (account checks, submission, confirmation, latest ledger).
• Asset: USDC (Circle testnet issuer GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5, overridable by USDC_ISSUER). XLM is used only for fees.
• A Stellar transaction is all-or-nothing, so recipients are checked before anything is signed, and a batch that fails as a whole sends nobody anything.
• Batches: at most 100 payments, a 5-minute signature window (timebounds), one open batch per run at a time.
• Login: email + password; API keys for automation.

Out of scope
Mainnet, scheduled/automatic runs, tax and deductions, fiat conversion, payslip PDFs, employee self-service logins, multi-approver sign-off.

Phases
Phase 0 — Pivot foundation
[ ] Docs rewritten for payroll (this file, Architecture, Backend, Frontend, CLAUDE.md)
[ ] Remove payment requests, checkout, engine, memos and their tests
[ ] Prisma schema: Company, Wallet, Group, Employee, PayrollRun, PayrollItem, PayrollBatch, PayrollEvent; fresh migration
[ ] Design direction picked by review (two directions, three judge agents); tokens in apps/web/DESIGN.md
Gate: lint, typecheck and test pass on the trimmed codebase.

Phase 1 — People
[ ] Groups: create, rename, delete (members become ungrouped)
[ ] Employees: add, edit, archive, restore, list with search and group filter; recipient check
[ ] Tests E1–E6
Gate: an employee with no USDC trustline shows "No USDC trustline"; one with a secret pasted is refused.

Phase 2 — Payroll engine
[ ] Runs: create from groups/people, edit lines in draft, totals, cancel
[ ] Start: fresh checks, exclusions, funding check
[ ] Batches: build, sign window, submit, confirm, fail with per-line reasons, expire by ledger time
[ ] Worker confirmer for submitted and unsigned batches; run notifier emails
[ ] transitions.ts: the only place run, line and batch statuses change
[ ] Tests R1–R17, S1–S4, tenant isolation
Gate: integration tests prove no line is ever paid twice, including timeouts, out-of-band submission and retries.

Phase 3 — Dashboard
[ ] Overview, People, Payroll list, Run detail (draft → review → sign → live results), Settings
[ ] Loading, empty and error states; works at 360 px
Gate: a new company goes from sign-up to a paid run using only the dashboard and Freighter on testnet.

Phase 4 — Harden and hand over
[ ] Code review by agents, fixes applied
[ ] README: setup, env, deploy, runbook
Gate: definition of done below.

Definition of done
[ ] pnpm lint, typecheck and test green
[ ] Every edge-case ID (E1–E6, R1–R17, S1–S4) has a passing test named with its ID
[ ] Live testnet demo: three employees (one without a trustline) → run → sign → two Paid with hash, one excluded → fix → retry → Paid
[ ] Security checklist in Architecture fully ticked
