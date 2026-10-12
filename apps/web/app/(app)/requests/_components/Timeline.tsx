"use client";

import { formatAmount, formatTime, shortAddress, shortHash } from "@/lib/format";
import { PAYMENT_OUTCOME, REQUEST_STATUS } from "@/lib/status";
import type { ChainPayment, PaymentRequest, RequestEvent } from "@/lib/types";
import { clock, fromStroops, Glyph, groupInt, isPreReset, money, sameAsset, type GlyphName } from "./shared";
import styles from "./requests.module.css";

type Tone = "good" | "warn" | "bad" | "muted" | "todo";

interface Check {
  label: string;
  ok: boolean;
  /** Why it failed, e.g. "5.00 short". */
  note?: string;
}

export interface Step {
  key: string;
  /** Null for the one "still waiting" row at the end of an open request. */
  at: string | null;
  title: string;
  sub?: string;
  checks?: Check[];
  tone: Tone;
}

const PAYMENT_TITLE: Record<ChainPayment["outcome"], string> = {
  COUNTED: "Payment found on Stellar",
  WRONG_ASSET: "Payment found in the wrong asset",
  WRONG_ISSUER: "Payment found in a look-alike asset",
  LATE: "Payment arrived after expiry",
  AFTER_CANCEL: "Payment arrived after the request was cancelled",
  AFTER_RESET: "Payment arrived after the testnet reset",
  DUPLICATE: "Another payment arrived after this was paid",
  WRONG_WALLET: "Payment sent to a different wallet",
  NO_MEMO: "Payment found with no memo",
  UNKNOWN_MEMO: "Payment found with an unknown memo",
  MEMO_TYPE_MISMATCH: "Payment found with the wrong memo type",
};

/** The checks PayBridge ran on one payment, read back from what the API recorded about it. */
function paymentChecks(p: ChainPayment, request: PaymentRequest, amount: Check | null): Check[] {
  const checks: Check[] = [{ label: "wallet", ok: p.walletId === request.walletId, note: "not the wallet this request pays into" }];

  if (sameAsset(p.asset, request.asset)) checks.push({ label: "asset", ok: true });
  else checks.push({ label: "asset", ok: false, note: p.asset.code === request.asset.code ? "same name, different issuer" : `${p.asset.code}, asked ${request.asset.code}` });

  if (amount) checks.push(amount);

  if (p.assignedManually || p.matchedBy === "manual") checks.push({ label: "memo", ok: false, note: "assigned by hand" });
  else if (p.matchedBy === "amount") checks.push({ label: "memo", ok: false, note: "matched by its exact amount" });
  else if (p.outcome === "NO_MEMO") checks.push({ label: "memo", ok: false, note: "none" });
  else if (p.outcome === "UNKNOWN_MEMO") checks.push({ label: "memo", ok: false, note: "not one of yours" });
  else if (p.outcome === "MEMO_TYPE_MISMATCH") checks.push({ label: "memo", ok: false, note: `sent as ${p.memoType}` });
  else checks.push({ label: "memo", ok: true });

  if (p.outcome === "LATE") checks.push({ label: "in time", ok: false, note: "after expiry" });
  else if (p.outcome === "AFTER_CANCEL") checks.push({ label: "request open", ok: false, note: "cancelled" });
  else if (p.outcome === "DUPLICATE") checks.push({ label: "request open", ok: false, note: "already paid" });
  else if (p.outcome === "AFTER_RESET") checks.push({ label: "request open", ok: false, note: "closed by the reset" });
  else if (p.outcome === "COUNTED" && new Date(p.ledgerClosedAt).getTime() > new Date(request.expiresAt).getTime()) checks.push({ label: "in time", ok: false, note: "after expiry, accepted later" });

  return checks.map((c) => (c.ok ? { label: c.label, ok: true } : c));
}

function eventStep(e: RequestEvent, request: PaymentRequest): Step {
  const by = e.actor === "api" ? "through the API" : "by you";
  const key = `e-${e.id}`;
  const code = request.asset.code;
  switch (e.reason) {
    case "payment_counted":
      if (e.fromStatus === e.toStatus) return { key, at: e.createdAt, title: "Payment applied", sub: `Still ${REQUEST_STATUS[e.toStatus].label}`, tone: e.toStatus === "UNDERPAID" ? "warn" : "good" };
      if (e.toStatus === "PAID") return { key, at: e.createdAt, title: "Marked Paid", sub: request.paidTxHash ? "Transaction hash saved below" : undefined, tone: "good" };
      if (e.toStatus === "OVERPAID") return { key, at: e.createdAt, title: "Marked Paid, with extra", sub: "More arrived than you asked for", tone: "good" };
      if (e.toStatus === "UNDERPAID") return { key, at: e.createdAt, title: "Marked Underpaid", sub: "Less arrived than you asked for", tone: "warn" };
      break;
    case "expired":
      return { key, at: e.createdAt, title: "Expired", sub: `Not paid in full by ${formatTime(request.expiresAt)}`, tone: "warn" };
    case "cancelled":
      return { key, at: e.createdAt, title: `Cancelled ${by}`, sub: "The payment link was closed", tone: "muted" };
    case "accepted":
      return { key, at: e.createdAt, title: `Accepted as paid ${by}`, sub: `${money(request.amountReceived, code)} counted as full payment`, tone: "good" };
    case "network_reset":
      return { key, at: e.createdAt, title: "Closed by a testnet reset", sub: "Stellar Testnet was wiped and restarted", tone: "muted" };
  }
  const tone: Tone = e.toStatus === "PAID" || e.toStatus === "OVERPAID" ? "good" : e.toStatus === "UNDERPAID" || e.toStatus === "EXPIRED" ? "warn" : "muted";
  return { key, at: e.createdAt, title: `Marked ${REQUEST_STATUS[e.toStatus].label}`, tone };
}

/**
 * The request's story, oldest first, built only from what the API returned: the request itself,
 * each payment seen on the ledger, each status change, and each refund the merchant recorded.
 */
export function buildTimeline(request: PaymentRequest, payments: ChainPayment[], events: RequestEvent[]): Step[] {
  const code = request.asset.code;
  const asked = BigInt(request.amountStroops);
  const dated: { step: Step; time: number; rank: number }[] = [];
  const add = (step: Step, rank: number) => dated.push({ step, time: step.at ? new Date(step.at).getTime() : 0, rank });

  let running = 0n;
  const byLedger = [...payments].sort((a, b) => a.ledger - b.ledger || a.eventId.localeCompare(b.eventId));
  for (const p of byLedger) {
    let amount: Check | null = null;
    if (p.outcome === "COUNTED" && sameAsset(p.asset, request.asset)) {
      running += BigInt(p.amountStroops);
      // What the status became when this payment was counted says whether the amount was enough.
      const to = events.find((e) => e.paymentEventId === p.eventId && e.reason === "payment_counted")?.toStatus;
      if (to === "PAID") amount = { label: "amount", ok: true };
      else if (to === "OVERPAID" || (!to && running > asked)) amount = { label: "amount", ok: false, note: running > asked ? `${formatAmount(fromStroops(running - asked))} over` : "more than asked" };
      else if (to === "UNDERPAID" || (!to && running < asked)) amount = { label: "amount", ok: false, note: running < asked ? `${formatAmount(fromStroops(asked - running))} short` : "less than asked" };
      else amount = { label: "amount", ok: true };
    }
    const checks = paymentChecks(p, request, amount);
    const counted = p.outcome === "COUNTED";
    const tone: Tone = counted ? (checks.every((c) => c.ok) ? "good" : "warn") : p.outcome === "WRONG_ASSET" || p.outcome === "WRONG_ISSUER" || p.outcome === "WRONG_WALLET" ? "bad" : "warn";
    const facts = [`${money(p.amount, p.asset.code)} from ${shortAddress(p.from)}`, `ledger ${groupInt(p.ledger)}`];
    if (!counted) facts.push("not counted");
    if (isPreReset(p)) facts.push("from before the testnet reset");
    add({ key: `p-${p.eventId}`, at: p.ledgerClosedAt, title: PAYMENT_TITLE[p.outcome] ?? `${PAYMENT_OUTCOME[p.outcome].label} payment`, sub: facts.join(" · "), checks, tone }, 0);
    if (p.refundedAt) {
      add({ key: `r-${p.eventId}`, at: p.refundedAt, title: "Refund recorded", sub: `${money(p.amount, p.asset.code)} sent back to ${shortAddress(p.from)}${p.refundTxHash ? ` · tx ${shortHash(p.refundTxHash)}` : ""}`, tone: "muted" }, 2);
    }
  }
  for (const e of events) add(eventStep(e, request), 1);
  if (request.refundedAt) add({ key: "r-request", at: request.refundedAt, title: "Refund recorded", sub: "You sent back what this request owed", tone: "muted" }, 2);

  dated.sort((a, b) => a.time - b.time || a.rank - b.rank);

  const created: Step = {
    key: "created",
    at: request.createdAt,
    title: "Request created",
    sub: `Link and memo ${request.memo} generated · ${money(request.amount, code)} to ${shortAddress(request.wallet)} · ${request.createdVia === "api" ? "through the API" : "from the dashboard"}`,
    tone: "good",
  };
  const steps = [created, ...dated.map((d) => d.step)];

  // The one row that is not history: what an open request is doing right now.
  if (request.status === "PENDING") steps.push({ key: "waiting", at: null, title: "Waiting for payment", sub: "Watching every new ledger. This page updates by itself.", tone: "todo" });
  else if (request.status === "UNDERPAID") steps.push({ key: "waiting", at: null, title: "Waiting for the rest", sub: `${money(request.amountRemaining, code)} still due · open until ${formatTime(request.expiresAt)}`, tone: "todo" });
  return steps;
}

const DOT: Record<Tone, { cls: string; glyph: GlyphName | null }> = {
  good: { cls: styles.tlGood ?? "", glyph: "check" },
  warn: { cls: styles.tlWarn ?? "", glyph: "bang" },
  bad: { cls: styles.tlBad ?? "", glyph: "cross" },
  muted: { cls: styles.tlMuted ?? "", glyph: "dash" },
  todo: { cls: styles.tlTodo ?? "", glyph: null },
};

/** Verification timeline: the rail draws itself and each event ticks in turn. */
export function Timeline({ steps, now }: { steps: Step[]; now: number }) {
  return (
    <ol className={styles.tl}>
      {steps.map((s, i) => {
        const dot = DOT[s.tone];
        // Past the eighth row the sequence stops stretching, so a long history does not keep the reader waiting.
        const order = { "--i": Math.min(i, 8) } as React.CSSProperties;
        return (
          <li key={s.key} className={styles.tlRow} style={order}>
            <div className={styles.tlRail} aria-hidden="true">
              <span className={`${styles.tlDot} ${dot.cls}`}>{dot.glyph ? <Glyph name={dot.glyph} size={11} strokeWidth={3.4} /> : null}</span>
              {i < steps.length - 1 ? <span className={styles.tlLine} /> : null}
            </div>
            <div className={styles.tlBody}>
              <div className={styles.tlTop}>
                <span className={`${styles.tlTitle} ${s.tone === "todo" ? styles.tlTitleTodo : ""}`}>{s.title}</span>
                {s.at ? (
                  <time className={styles.tlTime} dateTime={s.at}>
                    {clock(s.at, now)}
                  </time>
                ) : null}
              </div>
              {s.sub ? <span className={styles.tlSub}>{s.sub}</span> : null}
              {s.checks && s.checks.length > 0 ? (
                <ul className={styles.checks} style={{ listStyle: "none", padding: 0, margin: "3px 0 0" }} aria-label="Checks">
                  {s.checks.map((c, j) => (
                    <li key={c.label} className={`${styles.check} ${c.ok ? styles.checkOk : styles.checkNo}`} style={{ "--j": j } as React.CSSProperties}>
                      <Glyph name={c.ok ? "check" : "cross"} size={11} strokeWidth={3.2} />
                      <span className="sr-only">{c.ok ? "Passed: " : "Failed: "}</span>
                      {c.label}
                      {!c.ok && c.note ? ` (${c.note})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
