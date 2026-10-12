"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Icon, type AnyIcon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { CheckBurst } from "@/components/motion/CheckBurst";
import { CountUpAmount } from "@/components/motion/CountUp";
import { explorerTx, HORIZON_URL } from "@/lib/config";
import { countdown, formatAmount, formatDate, formatTime, initials, isPositive, shortAddress, shortHash, toStroops } from "@/lib/format";
import { isOpen } from "@/lib/status";
import type { Checkout } from "@/lib/types";
import styles from "./checkout.module.css";
import { Bridge, Steps } from "./Confirming";
import { PayOptions, type SentVia } from "./PayOptions";
import { useCheckout } from "./useCheckout";

const CONFIRM_WAIT_MS = 60_000;
const PAYBRIDGE_BLUE = "#1E4FD6";
/** The expiry bar turns warn-coloured in the last two minutes and pulses in the last thirty seconds. */
const WARN_MS = 120_000;
const LAST_MS = 30_000;

interface Waiting {
  via: SentVia;
  /** Transaction hash, when the customer paid with Freighter. */
  hash: string | null;
  /** What the request looked like when they paid; any change means the payment was seen. */
  key: string;
}

const snapshotKey = (c: Checkout) => `${c.status}|${c.amountReceived}`;

/** Stroops back to a decimal string, for the "extra" on an overpaid request. */
function fromStroops(stroops: bigint): string {
  const digits = stroops.toString().padStart(8, "0");
  return `${digits.slice(0, -7)}.${digits.slice(-7)}`;
}

/**
 * The business's brand colour, if white text is readable on it (WCAG contrast of 4.5 or more);
 * PayBridge blue otherwise. Used for the avatar and the main pay button only, never for status.
 */
function accentFor(brandColor: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(brandColor.trim())?.[1];
  if (!hex) return PAYBRIDGE_BLUE;
  const channel = (at: number) => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return 1.05 / (luminance + 0.05) >= 4.5 ? `#${hex}` : PAYBRIDGE_BLUE;
}

/** The business's website as a safe link (http or https only) and the host to show. */
function siteOf(website: string | null): { href: string; host: string } | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { href: url.href, host: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

export function CheckoutClient({ publicId }: { publicId: string }) {
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  /** Set when 60 s passed without the payment showing up. */
  const [overdue, setOverdue] = useState<Waiting | null>(null);
  /** The partly-paid request the customer chose to finish paying (its snapshot key). */
  const [payRestKey, setPayRestKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { state, retry, setEager } = useCheckout(publicId);

  const checkout = state.phase === "ready" ? state.checkout : null;
  const open = checkout ? isOpen(checkout.status) : false;
  const key = checkout ? snapshotKey(checkout) : "";
  const confirming = open && waiting !== null && waiting.key === key;
  const closing = open && checkout !== null && new Date(checkout.expiresAt).getTime() <= now;
  const wantEager = confirming || closing;

  // While the customer waits for a payment (or for the link to close), also poll: belt and braces.
  useEffect(() => {
    setEager(wantEager);
  }, [wantEager, setEager]);

  useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [open]);

  // Still nothing after a minute: back to the pay options, with a note. Once the request has
  // changed, `waiting` is kept so the Paid screen can show what the customer watched happen.
  useEffect(() => {
    if (!waiting || !confirming) return;
    const timer = setTimeout(() => {
      setOverdue(waiting);
      setWaiting(null);
    }, CONFIRM_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, confirming]);

  const onSent = (via: SentVia, hash?: string) => {
    if (!checkout) return;
    setOverdue(null);
    setWaiting({ via, hash: hash ?? null, key: snapshotKey(checkout) });
  };

  return (
    <div className={styles.page} style={{ "--accent": checkout ? accentFor(checkout.brandColor) : PAYBRIDGE_BLUE } as React.CSSProperties}>
      <div className={styles.bar}>
        <div className={styles.barInner}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span className={styles.barLabel}>Checkout</span>
          <span className={styles.barNet}>
            <span className={styles.netDot} aria-hidden="true" />
            Stellar Testnet · no real money moves
          </span>
        </div>
      </div>

      <main className={styles.stage}>
        {state.phase === "loading" && <Loading />}
        {state.phase === "not-found" && <NotFound />}
        {state.phase === "error" && <LoadError message={state.message} retry={retry} />}
        {state.phase === "ready" && (
          <Ready
            checkout={state.checkout}
            paidSeenAt={state.paidSeenAt}
            now={now}
            confirming={confirming ? waiting : null}
            landed={waiting !== null && waiting.key !== key ? waiting : null}
            overdue={open && overdue !== null && overdue.key === key ? overdue : null}
            closing={closing}
            payingRest={payRestKey === key}
            onPayRest={() => setPayRestKey(key)}
            onSent={onSent}
            onNotSent={() => setWaiting(null)}
          />
        )}
      </main>

      <div className={styles.footer}>
        <LogoMark size={18} travelling={confirming} />
        <span>
          Powered by <strong>PayBridge</strong> · non-custodial
        </span>
      </div>
    </div>
  );
}

function Loading() {
  const block = (width: string | number, height: number, radius = 6): React.CSSProperties => ({ width, height, borderRadius: radius, opacity: 0.55 });
  return (
    <div className={styles.shell} aria-busy="true">
      <span className="sr-only" role="status">
        Loading this payment…
      </span>
      <div className={styles.summary}>
        <div className={styles.head}>
          <div className="skeleton" style={block(40, 40, 10)} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton" style={block("50%", 16)} />
            <div className="skeleton" style={block("70%", 13)} />
          </div>
        </div>
        <div className="skeleton" style={block("60%", 44)} />
        <div className="skeleton" style={block("100%", 18)} />
      </div>
      <div className={styles.panel}>
        <div className="skeleton" style={block("100%", 46, 12)} />
        <div className="skeleton" style={block("100%", 50, 12)} />
        <div className="skeleton" style={block("100%", 50, 12)} />
        <div className="skeleton" style={block("100%", 50, 12)} />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className={styles.lone}>
      <span
        aria-hidden="true"
        style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--border)", color: "var(--slate)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}
      >
        ?
      </span>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>We can&apos;t find this checkout</h1>
      <span style={{ fontSize: 15, color: "var(--slate)", lineHeight: 1.5 }}>
        Check the link you were sent, or ask the business for a new one. Don&apos;t send money to an address you can&apos;t confirm.
      </span>
    </div>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className={styles.lone}>
      <span
        aria-hidden="true"
        style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--border)", color: "var(--slate)", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="refresh" size={24} />
      </span>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>We couldn&apos;t load this checkout</h1>
      <span style={{ fontSize: 15, color: "var(--slate)", lineHeight: 1.5 }} role="alert">
        {message} Don&apos;t send anything until this page loads.
      </span>
      <button type="button" onClick={retry} className="btn btn-primary" style={{ minWidth: 160 }}>
        Try again
      </button>
    </div>
  );
}

const PILLS: Record<string, { label: string; tone: string; icon: AnyIcon }> = {
  PENDING: { label: "Awaiting payment", tone: "pill-info", icon: "clock" },
  UNDERPAID: { label: "Partly paid", tone: "pill-warn", icon: "alert" },
  CONFIRMING: { label: "Confirming", tone: "pill-brand", icon: "clock" },
  CLOSING: { label: "Closing…", tone: "pill-muted", icon: "clock" },
  PAID: { label: "Paid", tone: "pill-good", icon: "check" },
  OVERPAID: { label: "Paid", tone: "pill-good", icon: "check" },
  EXPIRED: { label: "Expired", tone: "pill-muted", icon: "cross" },
  CANCELLED: { label: "Cancelled", tone: "pill-muted", icon: "dash" },
  NETWORK_RESET: { label: "Closed", tone: "pill-muted", icon: "dash" },
};

function StatusPill({ name, className = "" }: { name: string; className?: string }) {
  const pill = PILLS[name] ?? PILLS.PENDING!;
  return (
    <span className={`pill ${pill.tone} ${className}`} style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
      <Icon name={pill.icon} size={12} strokeWidth={2.6} />
      {pill.label}
    </span>
  );
}

/** The countdown clock. Each character that changes rolls in, so the seconds tick visibly. */
function Ticker({ text, warn }: { text: string; warn: boolean }) {
  const chars = Array.from(text);
  return (
    <span role="timer" aria-label={text} className={styles.ticker} data-warn={warn}>
      {chars.map((ch, i) => (
        // Keyed from the right, so the seconds keep their place when the clock gets shorter.
        <span key={`${chars.length - i}:${ch}`} aria-hidden="true" className={/\d/.test(ch) ? styles.digit : undefined}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/** A thin bar draining toward the expiry. Full means "the time that was left when this page opened". */
function ExpiryBar({ expiresAt, now, className }: { expiresAt: string; now: number; className?: string }) {
  const [span] = useState(() => Math.max(1000, new Date(expiresAt).getTime() - Date.now()));
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  const fraction = Math.min(1, left / span);
  return (
    <div className={`${styles.expiry} ${className ?? ""}`} data-warn={left <= WARN_MS} data-last={left <= LAST_MS} aria-hidden="true">
      <div className={styles.expiryFill} style={{ transform: `scaleX(${fraction.toFixed(4)})` }} />
    </div>
  );
}

/** The big amount. It counts up once, when the page loads; later changes simply appear. */
function Amount({ value, dim }: { value: string; dim: boolean }) {
  const [first] = useState(value);
  return <span className={`${styles.amount} ${dim ? styles.amountDim : ""}`}>{value === first ? <CountUpAmount value={value} /> : formatAmount(value)}</span>;
}

function VerifiedMark({ biz, label }: { biz: string; label?: string }) {
  const title = `${biz} proved it owns this wallet`;
  return (
    <span className={styles.verified} title={title}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label ? undefined : `Verified: ${title}`} aria-hidden={label ? true : undefined}>
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4" />
      </svg>
      {label && (
        <>
          {label}
          <span className="sr-only">: {title}</span>
        </>
      )}
    </span>
  );
}

interface ReadyProps {
  checkout: Checkout;
  paidSeenAt: number | null;
  now: number;
  confirming: Waiting | null;
  /** The customer was waiting when the request changed: they watched it land. */
  landed: Waiting | null;
  overdue: Waiting | null;
  closing: boolean;
  payingRest: boolean;
  onPayRest: () => void;
  onSent: (via: SentVia, hash?: string) => void;
  onNotSent: () => void;
}

function Ready({ checkout, paidSeenAt, now, confirming, landed, overdue, closing, payingRest, onPayRest, onSent, onNotSent }: ReadyProps) {
  const { status, businessName: biz } = checkout;
  const code = checkout.asset.code;
  const paid = status === "PAID" || status === "OVERPAID";
  const open = isOpen(status);
  const under = status === "UNDERPAID";
  const site = siteOf(checkout.website);
  const pillName = confirming ? "CONFIRMING" : open && closing ? "CLOSING" : status;
  const showTimer = open && !confirming && !closing;
  const timer = showTimer ? countdown(checkout.expiresAt, now) : "";
  const warn = new Date(checkout.expiresAt).getTime() - now <= WARN_MS;
  const view = paid ? "paid" : !open ? "closed" : confirming ? "confirming" : closing ? "closing" : under && !payingRest ? "underpaid" : "pay";

  const amountLabel = paid ? "Amount paid" : under ? "Still due" : open ? "Amount due" : "Amount";
  const amountShown = paid ? (status === "OVERPAID" ? checkout.amountReceived : checkout.amount) : open ? checkout.amountRemaining : checkout.amount;

  return (
    <div className={styles.shell} data-paid={paid ? (paidSeenAt !== null ? "live" : "true") : undefined}>
      <section className={styles.summary} aria-label="What you are paying">
        <div className={styles.head}>
          <div className={styles.avatar} aria-hidden="true">
            {initials(biz)}
          </div>
          <div className={styles.who}>
            <h1 className={styles.biz}>
              {biz}
              {checkout.walletVerified && (
                <span className={styles.mobileOnly} style={{ color: "var(--brand)", display: "inline-flex" }}>
                  <VerifiedMark biz={biz} />
                </span>
              )}
            </h1>
            {checkout.description && <span className={`${styles.sub} ${styles.mobileOnly}`}>{checkout.description}</span>}
            {(site || checkout.walletVerified) && (
              <span className={`${styles.sub} ${styles.desktopOnly}`} style={{ fontSize: 12 }}>
                {site?.host}
                {site && checkout.walletVerified && " · "}
                {checkout.walletVerified && <VerifiedMark biz={biz} label="verified" />}
              </span>
            )}
          </div>
          <StatusPill key={pillName} name={pillName} className={styles.mobileOnly} />
        </div>

        <div className={styles.due}>
          {checkout.description && <span className={`${styles.sub} ${styles.desktopOnly}`}>{checkout.description}</span>}
          <span className={styles.sub}>{amountLabel}</span>
          <div className={styles.amountRow}>
            <Amount value={amountShown} dim={!open && !paid} />
            <span className={styles.code}>{code}</span>
          </div>
          {!open && !paid && isPositive(checkout.amountReceived) && (
            <span className={styles.sub}>
              {formatAmount(checkout.amountReceived)} of {formatAmount(checkout.amount)} {code} was received.
            </span>
          )}
          {open && (
            <div className={styles.meta}>
              <span>Straight to {biz}&apos;s wallet</span>
              {showTimer && (
                <span className={styles.mobileOnly}>
                  Expires in <Ticker text={timer} warn={warn} />
                </span>
              )}
            </div>
          )}
          {showTimer && <ExpiryBar expiresAt={checkout.expiresAt} now={now} className={styles.mobileOnly} />}
        </div>

        <div className={`${styles.facts} ${styles.desktopOnly}`}>
          <div className={styles.fact}>
            <span>To wallet</span>
            <span className={styles.mono} title={checkout.wallet}>
              {shortAddress(checkout.wallet)}
            </span>
          </div>
          <div className={styles.fact}>
            <span>Memo</span>
            <span className={styles.mono}>{checkout.memo}</span>
          </div>
          <div className={styles.fact}>
            <span>Network</span>
            <span>Stellar Testnet</span>
          </div>
        </div>

        <span className={`${styles.powered} ${styles.desktopOnly}`}>
          <LogoMark size={18} travelling={confirming !== null} />
          <span>Powered by PayBridge · the money goes straight to the merchant&apos;s wallet</span>
        </span>
      </section>

      <section className={styles.panel} aria-label="Pay with Stellar">
        <div className={`${styles.panelHead} ${styles.desktopOnly}`}>
          <h2 className={styles.panelTitle}>Pay with Stellar</h2>
          <StatusPill key={pillName} name={pillName} />
        </div>
        {showTimer && (
          <div className={`${styles.panelTimer} ${styles.desktopOnly}`}>
            <span>
              This checkout expires in <Ticker text={timer} warn={warn} />. Pay from your phone or a browser wallet.
            </span>
            <ExpiryBar expiresAt={checkout.expiresAt} now={now} />
          </div>
        )}

        {view === "paid" && <PaidView key="paid" checkout={checkout} paidSeenAt={paidSeenAt} landed={landed} site={site} />}

        {view === "closed" && <ClosedView key="closed" checkout={checkout} site={site} />}

        {view === "confirming" && confirming && (
          <div key="confirming" className={styles.view}>
            <div className={styles.confirm} role="status">
              <Bridge businessName={biz} />
              <span className={styles.confirmTitle}>{confirming.via === "link" ? "Waiting for your wallet…" : "Confirming on Stellar…"}</span>
              <span className={styles.confirmText}>
                {confirming.via === "freighter" ? (
                  "Your payment is on its way. This usually takes about 5 seconds, and this page updates by itself."
                ) : confirming.via === "link" ? (
                  "Approve the request in your wallet. This page updates by itself when the payment arrives."
                ) : (
                  <>
                    Watching {biz}&apos;s wallet for a payment with memo <span className={styles.mono}>{checkout.memo}</span>. This usually takes about 5 seconds.
                  </>
                )}
              </span>
              <Steps via={confirming.via} hash={confirming.hash} seen={false} verified={false} />
            </div>
            {confirming.via !== "freighter" && (
              <button type="button" onClick={onNotSent} className="btn btn-link" style={{ alignSelf: "center", fontSize: 13 }}>
                I have not paid yet. Show the ways to pay
              </button>
            )}
          </div>
        )}

        {view === "closing" && (
          <div key="closing" className={styles.view}>
            <div className={styles.closed} role="status">
              <span className={styles.closedTitle}>This checkout is closing</span>
              <span className={styles.closedText}>Its time is up, so don&apos;t send a payment now. If you already paid, stay on this page: it will update by itself.</span>
            </div>
          </div>
        )}

        {(view === "underpaid" || view === "pay") && (
          <div key={view} className={styles.view}>
            {overdue && <OverdueNote overdue={overdue} biz={biz} />}
            {under && <UnderpaidCard checkout={checkout} />}
            {!checkout.canReceive && <CannotReceive checkout={checkout} />}
            {view === "underpaid" ? (
              <button type="button" onClick={onPayRest} className={`btn btn-block ${styles.accentBtn}`} style={{ height: 48, fontSize: 15, whiteSpace: "normal", lineHeight: 1.2 }}>
                Pay the remaining {formatAmount(checkout.amountRemaining)} {code}
              </button>
            ) : (
              <PayOptions checkout={checkout} onSent={onSent} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * The fee the paying transaction was actually charged, read from Stellar itself. Nothing is
 * shown until (and unless) the real figure is known.
 */
function NetworkFee({ txHash }: { txHash: string }) {
  const [fee, setFee] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${HORIZON_URL}/transactions/${txHash}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ fee_charged?: string | number }>) : null))
      .then((tx) => {
        const charged = tx?.fee_charged === undefined ? "" : String(tx.fee_charged);
        if (!cancelled && /^\d{1,15}$/.test(charged)) setFee(formatAmount(fromStroops(BigInt(charged)), 5));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [txHash]);
  if (!fee) return null;
  return (
    <Row label="Network fee">
      <span className={styles.mono}>{fee} XLM</span>
    </Row>
  );
}

function PaidView({ checkout, paidSeenAt, landed, site }: { checkout: Checkout; paidSeenAt: number | null; landed: Waiting | null; site: { href: string; host: string } | null }) {
  const biz = checkout.businessName;
  const code = checkout.asset.code;
  const over = checkout.status === "OVERPAID";
  // The ledger time of the payment when the API has it; else when this page saw it flip.
  const seen = checkout.paidAt ?? (paidSeenAt === null ? null : new Date(paidSeenAt).toISOString());
  const extra = over ? toStroops(checkout.amountReceived) - toStroops(checkout.amount) : 0n;

  return (
    <div className={styles.view}>
      {/* The words are in the page at once; only the tick and rings animate. */}
      <div className={styles.paid} role="status">
        <span className={`${styles.burst} ${styles.noPrint}`}>
          <CheckBurst size={76} />
        </span>
        <h2 className={styles.paidTitle}>Paid</h2>
        <span className={styles.paidText}>
          {formatAmount(over ? checkout.amountReceived : checkout.amount)} {code} reached {biz}&apos;s wallet. They have been told, you can close this page.
        </span>
        {over && extra > 0n && (
          <span style={{ fontSize: 13, color: "var(--warn)", fontWeight: 600, lineHeight: 1.5 }}>
            That is {formatAmount(fromStroops(extra))} {code} more than the {formatAmount(checkout.amount)} {code} asked for. {biz} has been told about the extra.
          </span>
        )}
        {landed && (
          <div className={styles.noPrint}>
            <Steps via={landed.via} hash={landed.hash} seen verified compact />
          </div>
        )}
      </div>

      <div className={styles.receipt}>
        {seen && (
          <Row label="Paid">
            {formatDate(seen)}, {formatTime(seen)}
          </Row>
        )}
        <Row label="Paid to">
          <span className={styles.mono} title={checkout.wallet}>
            {shortAddress(checkout.wallet)}
          </span>
        </Row>
        <Row label="Memo">
          <span className={styles.mono}>{checkout.memo}</span>
        </Row>
        {checkout.paidTxHash && <NetworkFee txHash={checkout.paidTxHash} />}
        {checkout.paidTxHash && (
          <Row label="Transaction">
            <a
              href={explorerTx(checkout.paidTxHash)}
              target="_blank"
              rel="noreferrer"
              className={styles.mono}
              style={{ fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}
              aria-label={`Transaction ${shortHash(checkout.paidTxHash)} on Stellar Expert (opens in a new tab)`}
            >
              {shortHash(checkout.paidTxHash)}
              <Icon name="external" size={12} strokeWidth={2.4} />
            </a>
          </Row>
        )}
      </div>

      {site && (
        <a href={site.href} className={`btn btn-primary btn-block ${styles.noPrint}`} style={{ height: 48, fontSize: 15, whiteSpace: "normal", lineHeight: 1.2 }}>
          Back to {biz}
        </a>
      )}
      <button type="button" onClick={() => window.print()} className={`btn btn-secondary btn-block ${styles.noPrint}`} style={{ height: 46, fontSize: 15 }}>
        Save receipt
      </button>
    </div>
  );
}

function UnderpaidCard({ checkout }: { checkout: Checkout }) {
  const code = checkout.asset.code;
  // Whole percent of the total received, in exact integer maths.
  const total = toStroops(checkout.amount);
  const raw = total > 0n ? (toStroops(checkout.amountReceived) * 100n) / total : 0n;
  const percent = raw > 100n ? "100" : raw.toString();

  return (
    <div className={styles.under}>
      <span className={styles.underTitle}>
        {formatAmount(checkout.amountReceived)} of {formatAmount(checkout.amount)} {code} received
      </span>
      <span className={styles.underText}>
        Send the remaining{" "}
        <span className={styles.mono} style={{ fontWeight: 600 }}>
          {formatAmount(checkout.amountRemaining)} {code}
        </span>{" "}
        with the same memo before the timer runs out to complete this payment. {checkout.businessName} can also refund what arrived.
      </span>
      <div className={styles.underBar} role="progressbar" aria-label="Amount received" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseInt(percent, 10)}>
        <div className={styles.underFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OverdueNote({ overdue, biz }: { overdue: Waiting; biz: string }) {
  return (
    <div className="notice" role="status" style={{ borderRadius: 14, padding: "12px 16px", lineHeight: 1.5 }}>
      {overdue.via === "freighter" ? (
        <>
          Your payment was sent, but it hasn&apos;t shown up here yet. Don&apos;t pay again. This page will update by itself when it arrives
          {overdue.hash ? (
            <>
              {" "}
              (
              <a href={explorerTx(overdue.hash)} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                see the transaction
              </a>
              )
            </>
          ) : null}
          . If it still doesn&apos;t, tell {biz}.
        </>
      ) : (
        <>
          Your payment hasn&apos;t shown up yet. If you sent it, don&apos;t send it again: this page will update by itself when it arrives. If you haven&apos;t, check the
          amount and the memo below.
        </>
      )}
    </div>
  );
}

function ClosedView({ checkout, site }: { checkout: Checkout; site: { href: string; host: string } | null }) {
  const biz = checkout.businessName;
  const code = checkout.asset.code;
  const contact = checkout.supportContact?.trim() || null;
  const isPhone = contact !== null && /^[+\d][\d\s().-]{5,}$/.test(contact);
  // The API does not say when the request was created, so its lifetime can't be quoted: "in time".
  const arrived = isPositive(checkout.amountReceived)
    ? `Only ${formatAmount(checkout.amountReceived)} of ${formatAmount(checkout.amount)} ${code} arrived in time.`
    : "Nothing arrived in time.";

  // A payment that lands after this is recorded and the business decides what to do with it:
  // it is never lost, but it does not complete this checkout by itself.
  const copy =
    checkout.status === "CANCELLED"
      ? { title: "This checkout was cancelled", body: `${biz} cancelled this request, so don't send a payment. If you already paid, ${biz} can see your payment and nothing is lost.` }
      : checkout.status === "NETWORK_RESET"
        ? {
            title: "This checkout is closed",
            body: `Stellar Testnet was reset, which closed this request. Don't send a payment. If you still need to pay, ask ${biz} for a new link.`,
          }
        : {
            title: "This checkout has expired",
            body: `${arrived} Go back to ${biz} and start again. If you already paid, ${biz} can see your payment and nothing is lost.`,
          };

  return (
    <div className={styles.view}>
      <div className={styles.closed}>
        <span className={styles.closedTitle}>{copy.title}</span>
        <span className={styles.closedText}>{copy.body}</span>
        {checkout.status === "EXPIRED" && (
          <span className={styles.closedText} style={{ fontSize: 13 }}>
            Expired{" "}
            <span className={styles.mono} style={{ color: "var(--ink)", fontWeight: 600 }}>
              {formatDate(checkout.expiresAt)}, {formatTime(checkout.expiresAt)}
            </span>
          </span>
        )}
        {contact && (
          <>
            <span className={styles.closedText}>
              Reach {biz}: <span style={{ fontWeight: 700, color: "var(--ink)", overflowWrap: "anywhere" }}>{contact}</span>
            </span>
            <CopyButton
              value={contact}
              label={`Copy ${biz}'s ${isPhone ? "number" : "contact"}`}
              copiedLabel={`${contact} copied`}
              className="btn btn-secondary btn-block"
              style={{ height: 44, whiteSpace: "normal", lineHeight: 1.2 }}
            />
          </>
        )}
      </div>
      {site && (
        <a href={site.href} className="btn btn-secondary btn-block" style={{ height: 48, fontSize: 15, whiteSpace: "normal", lineHeight: 1.2 }}>
          Back to {biz}
        </a>
      )}
    </div>
  );
}

function CannotReceive({ checkout }: { checkout: Checkout }) {
  const biz = checkout.businessName;
  const code = checkout.asset.code;
  const why =
    checkout.cannotReceiveReason === "ACCOUNT_NOT_FOUND"
      ? `${biz}'s wallet isn't active on Stellar Testnet yet.`
      : checkout.cannotReceiveReason === "NO_TRUSTLINE"
        ? `${biz}'s wallet isn't set up to hold ${code} yet.`
        : checkout.cannotReceiveReason === "TRUSTLINE_LIMIT_TOO_LOW"
          ? `${biz}'s wallet can't hold this much ${code} right now.`
          : `${biz}'s wallet can't accept this payment right now.`;

  return (
    <div className="alert" role="alert" style={{ borderRadius: 14, padding: "14px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Icon name="alert" size={18} style={{ marginTop: 1 }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontWeight: 800 }}>Don&apos;t send this payment yet</span>
        <span>
          {why} A payment sent now would fail. Tell {biz} so they can fix it, then reload this page.
        </span>
      </span>
    </div>
  );
}
