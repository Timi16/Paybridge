# PayBridge

Stellar Testnet payroll: a company adds its people and their wallets, groups them, creates a payroll
run, signs it once in Freighter, and PayBridge sends USDC to everyone and tracks each payment to Paid
(with tx hash) or Failed (with the reason).

**Read everything in /docs before starting any task.** `docs/Build-plan.md`, `docs/Archiecture.md`,
`docs/Backend.md` and `docs/Frontend.md` are the spec. On 16 Oct 2026 the product changed from payment
requests to payroll; anything about memos, checkout or request matching is history (see git before
that date), not spec.

Conventions kept from before: API keys `pb_test_`, cookies `pb_session` / `pb_device`, API port 4200,
dev database port 5436.

## Working rules

1. Follow the docs. If something is unclear or seems wrong, ask before building. If we agree on a change, update the matching doc in the same commit.
2. One phase at a time, in order. A phase is done only when its gate check passes.
3. TypeScript strict everywhere; no `any`, no unexplained `@ts-ignore`.
4. Money is never a float: bigint stroops in code, BigInt columns in Postgres, decimal strings in JSON. `parseFloat` and `Number()` on amounts are banned (ESLint enforces it).
5. Run, line and batch statuses change only in `apps/api/src/modules/payroll/transitions.ts`, which checks the allowed-transitions tables and updates conditionally on the expected status inside a transaction holding row locks. ESLint forbids `status:` in any other `payrollRun` / `payrollItem` / `payrollBatch` update.
6. A line is never paid twice: at most one open batch per run, PAID is final, retry touches only FAILED lines, and an open envelope is replaced only after the ledger shows it can no longer land.
7. Batch expiry is judged by ledger close time, never by server clock alone.
8. Every edge-case ID in the docs (E1–E6, R1–R17, S1–S4) gets at least one test whose name starts with that ID.
9. PayBridge never holds, accepts, stores or logs a Stellar secret key. The company signs in Freighter. Never log passwords, API keys, session tokens, full Authorization headers or signed XDR.
10. Testnet only: refuse to boot unless the network passphrase is the testnet one.
11. Before saying a task is done, run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and report the results.
12. Small commits with conventional messages (`feat:`, `fix:`, `test:`, `docs:`).

## Layout

- `apps/api`: one codebase, two processes. `src/server.ts` (API) and `src/worker.ts` (batch confirmer, notifier).
- `apps/web`: Next.js app with landing, auth and dashboard (Overview, People, Payroll, Settings). Design system: `apps/web/DESIGN.md`. Amounts stay decimal strings; `parseFloat`/`Number()` are banned there too.
- `packages/shared`: Zod schemas and types shared with the web app.
- `apps/api/scripts`: `seed.ts` (demo company, people and runs), `scenario.ts` (testnet end-to-end).
- Layering: routes → service → repo. Repos that touch company data take `companyId` first.

## Commands

`pnpm db:up` · `pnpm --filter @paybridge/api db:deploy` · `pnpm dev` · `pnpm dev:worker` · `pnpm dev:web` ·
`pnpm lint` · `pnpm typecheck` · `pnpm test` (needs Docker for Testcontainers) ·
`pnpm scenario` · `pnpm seed` · `pnpm --filter @paybridge/api openapi`
