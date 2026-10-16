# PayBridge web: design system

Direction **"Pay stub"**: warm paper, forest-green ink, ledger figures. A payroll run is a document
you can trust: totals sit on a double rule, every payment has a status word and a hash.

Chosen on 16 Oct 2026 over a dark "Manifest" direction (graphite, lime, condensed caps) by three
judge agents. Payroll operator, visual craft and accessibility all picked Pay stub: it reads as an
accounting tool rather than a trading terminal, fits 390 px, and needed only token fixes for AA.
From Manifest we kept the row index (01, 02…), the boxed facts strip and the joined segmented filter.
Tokens live in `app/globals.css`; this file is the summary.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--paper` | `#F5F1E8` | Page background |
| `--sheet` | `#FFFDF8` | Cards, documents, dialogs |
| `--sunken` | `#EFEADF` | Hover on nav and icon buttons |
| `--rule` / `--rule-soft` | `#DCD5C5` / `#E9E3D6` | Card borders / row dividers |
| `--rule-strong` | `#8C8579` | Input, select, chip and secondary-button borders (≥ 3:1) |
| `--ink` / `--ink-2` / `--ink-3` | `#1B2620` / `#4A5650` / `#666D68` | Text: primary / secondary / labels (all ≥ 4.5:1 on paper and sheet) |
| `--green` / `--green-hover` / `--green-tint` | `#0F6B4B` / `#0B4F38` / `#E2EFE7` | Primary action, links, focus ring, the mark |
| `--night` | `#14201A` | Auth panel, landing "Safety" band |
| Paid | `#0F6B4B` on `#E2EFE7` | |
| Sending / in flight | `#8A5A0B` on `#F7EBCF`; ticks striped `#9A7B2C` | |
| Not sent / failed | `#A2361F` on `#F6E0D8`; callout text `#6E2414` | |
| Waiting for signature / info | `#2E4A7A` on `#E4EAF3` | |
| Draft / to pay / cancelled | `#4A5650` on `#ECE7DC` | |
| Testnet dot | `#C98A1B` | The permanent "Stellar Testnet · no real money" badge |

Light only. Status is never colour alone: every pill has an icon and a word, and the tick bar is
always accompanied by its counts in text.

## Type

- **Instrument Serif** (400, italic for emphasis) for page titles (44 / 34 mobile), section titles (26–28) and headline money (KPIs 40, run total up to 56). Nothing else.
- **Hanken Grotesk** for everything else: body 14–15, labels 13/600, eyebrows 11/600 caps +0.12em.
- **JetBrains Mono** for every amount in a list, addresses, hashes, memo text, row numbers.
- Rule: an amount is either serif (headline) or mono (ledger), never sans. Amounts are decimal strings end to end; `parseFloat`/`Number()` on amounts are banned (ESLint).

## Shape and spacing

- Sheets, dialogs, callouts: radius 4. Inputs and selects: 6. Buttons, chips, pills, segmented controls: 999.
- Buttons 44 px (52 for the one main action on a screen), small 36. Nav items 44.
- Sheet padding 24/28 (20 on mobile). Page gutter 44 (16 on mobile). One shadow: `--shadow-sheet`.
- Below 640 px, tables become stacked rows (`.table.stack`): name and amount on top, status, reason and tx hash below. The tx hash and failure reason are never hidden.

## Signature details (use them only where they mean something)

1. **Perforated edge** (`.stub`) on documents only: a payroll run, the review-and-pay step, the landing demo.
2. **Double rule** (`.total-rule`) under a binding total: the run total, the review total, the new-run total.
3. **Tick bar** (`<Ticks>`): one tick per person in paid / sending (striped) / not sent / to pay. Above 120 people it becomes a joined bar.
4. **Date tile** (`.date-tile`) for a scheduled pay date.

## Components

CSS (in `globals.css`): `.btn` + `.btn-primary | -dark | -secondary | -danger | -link`, `.btn-lg | -sm`;
`.field .label .input .select .textarea .hint .field-error .check`; callouts `.alert .notice .success .info-note`;
`.sheet .card .sheet-pad .stub .tear .divider .total-rule .ledger`; `.pill-good | -warn | -danger | -info | -muted | -brand`,
`.chip-tag`, `.tag-testnet`; `.ticks`; `.table .table.stack .idx .num .who .hash .why`; `.seg`; `.page-head .h1 .h2 .eyebrow .money .unit`;
`.date-tile`, `.empty`, `.skeleton`, `.spinner`, `.facts`, `.run-head`, `.run-totals`.

React: `Logo`, `LogoMark`, `Icon`, `Pill`, `RunStatusPill`, `ItemStatusPill`, `BatchStatusPill`, `Money`, `Ticks`,
`NewRunDialog`, `CopyButton`, `PasswordInput`, `Dialog`, `Toast` (`useToast`), `AppShell`.
Status words, tones and failure explanations live in `lib/payroll.ts`.

## Motion

Calm and quick: pages rise in once, ticks grow in, pills pop when a status changes. Everything is off
under `prefers-reduced-motion` except "working" spinners. Live updates poll every 2 s only while money
is moving, and the run's counts are announced in one polite `aria-live` line, not row by row.

## Voice

Plain and specific, about money and people: "1 payment wasn't sent: 1,750.00 USDC. Nothing was sent to
Tomás Reyes. Their wallet can't hold USDC yet…". Say what happened, whether money moved, and what to do
next. Never imply PayBridge holds funds or keys: "Sign in Freighter", "Your keys never leave Freighter".
No pronouns guessed for people on a run; use their name or "they".

## Rules

- Real `<button>`, `<a>`, `<label for>`; dialogs trap focus and close on Escape; focus ring 2 px green, offset 2.
- Every list has loading, empty and error states.
- The "Stellar Testnet · no real money" badge is always visible in the app (top bar, also on mobile).
- A pasted secret key (S…) is cleared from the field and never sent anywhere.
