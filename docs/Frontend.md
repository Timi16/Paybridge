Frontend
One Next.js app (apps/web). Visual system: apps/web/DESIGN.md ("Pay stub", chosen 16 Oct 2026 over a
dark "Manifest" direction by three judge agents: payroll operator, visual craft, accessibility).

Routes
/                    Landing: what it does, the run demo, how signing works, testnet note
/signup /login /verify-email /forgot-password /reset-password
/onboarding          Company name → funding wallet → done
/dashboard           Overview: paid this month, funding wallet balance, failed lines (links to them),
                     next draft run (date tile + "Review and pay"), paid per month (6 months), recent runs
/people              Employees: search, group filter (joined segmented control), table with #, name/email,
                     wallet, group, default amount, ready status; add/edit dialog; groups dialog; archive;
                     "Check wallets"; CSV import
/payroll             Runs list with status filter, totals and dates; "New payroll" dialog
/payroll/[id]        The run document (perforated sheet):
                     DRAFT: editable amounts, add people/groups, remove lines; pre-flight check panel;
                       total ledger with double rule; "Start paying"
                     PAYING: batch panel (sign in Freighter → submitting → confirmed), live line statuses
                       (polling every 2 s while anything is SENDING), segmented progress bar
                     PAID / PARTIAL / FAILED: results, failures callout, "Check again and retry", CSV export
                     Lines: # · name + wallet · amount · status (+ reason or tx hash under it) — the hash and
                     reason are never hidden on mobile
/settings            Company, funding wallets, notifications, security, API keys, close account

Rules
- Every list has loading, empty and error states. Tables become stacked rows below 640 px.
- Amounts stay decimal strings; parseFloat/Number() banned. Every amount is serif (headline) or mono (ledger).
- Status is never colour alone: icon + word. Live changes announced in one polite aria-live summary.
- The Stellar Testnet badge is always visible in the app header.
- Freighter: connect, check network is testnet, check the address matches the funding wallet, sign.
