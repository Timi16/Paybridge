"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Icon } from "@/components/Icon";
import { CountUpAmount, CountUpInt } from "@/components/motion/CountUp";
import { useNewRequest } from "@/components/NewRequest";
import { RequestPill } from "@/components/StatusPill";
import { errorMessage } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { formatAmount, shortHash, timeAgo, timeLeft, toStroops } from "@/lib/format";
import { useNow, usePollWhenOffline } from "@/lib/live";
import { useMe, useWallets } from "@/lib/session";
import { displayStatus, isOpen, requestTitle } from "@/lib/status";
import type { Daily, Page, PaymentRequest, RequestStats, Summary } from "@/lib/types";
import styles from "./overview.module.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Short label over a bar, straight from the decimal string: "310.5", "1,030", "12.3k", "1.2M". The tooltip has the exact amount. */
function compact(amount: string): string {
  const [whole = "0", frac = ""] = amount.split(".");
  if (whole.length >= 7) return `${whole.slice(0, -6)}.${whole.slice(-6, -5)}M`;
  if (whole.length >= 5) return `${whole.slice(0, -3)}.${whole.slice(-3, -2)}k`;
  if (whole.length === 4) return formatAmount(whole, 0);
  const cents = frac.slice(0, 2).replace(/0+$/, "");
  return cents ? `${whole}.${cents}` : whole;
}

/** "2026-10-10" (a local calendar day from the API) -> a Date at local noon, safe from timezone edges. */
const dayDate = (date: string) => new Date(`${date}T12:00:00`);

interface TileProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  colour?: string;
  attention?: boolean;
  /** Changes when the tile should wiggle once. */
  nudge?: number;
}

function Tile({ label, value, sub, href, colour, attention, nudge = 0 }: TileProps) {
  const className = `${styles.tile}${attention ? ` ${styles.tileAttention}` : ""}${href ? " lift" : ""}`;
  const body = (
    <>
      <span className={styles.tileLabel} style={attention ? { color: "var(--attention-fg)", fontWeight: 700 } : undefined}>
        {attention ? <Icon name="alert" size={14} strokeWidth={2.4} /> : null}
        {label}
      </span>
      <span className={styles.tileValue} style={colour ? { color: colour } : undefined}>
        {value}
      </span>
      <span className={styles.tileSub}>{sub}</span>
    </>
  );
  return (
    // The outer element takes the arrival stagger; the wiggle lives on the inner one so they never fight.
    <div style={{ minWidth: 0 }}>
      <div key={nudge} className={nudge > 0 ? styles.nudge : undefined} style={{ height: "100%" }}>
        {href ? (
          <Link href={href} className={className}>
            {body}
          </Link>
        ) : (
          <div className={className}>{body}</div>
        )}
      </div>
    </div>
  );
}

function WeekChart({ daily, error, asset }: { daily: Daily | undefined; error: unknown; asset: string }) {
  const all = daily?.days ?? [];
  const week = all.slice(-7);
  const before = all.slice(-14, -7);
  const sum = (days: Daily["days"]) => days.reduce((acc, d) => acc + toStroops(d.amount), 0n);
  const thisWeek = sum(week);
  const lastWeek = sum(before);
  const max = week.reduce((m, d) => (toStroops(d.amount) > m ? toStroops(d.amount) : m), 0n);

  // Change vs the seven days before, in whole percent, all in bigint stroops. Nothing to compare against -> nothing shown.
  let change: { up: boolean; pct: number; capped: boolean } | null = null;
  if (daily && before.length === 7 && lastWeek > 0n) {
    const up = thisWeek >= lastWeek;
    const pct = ((up ? thisWeek - lastWeek : lastWeek - thisWeek) * 100n) / lastWeek;
    const capped = pct > 999n;
    change = { up, pct: capped ? 999 : Number.parseInt(pct.toString(), 10), capped };
  }

  return (
    <section className={styles.panel} aria-labelledby="week-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 id="week-title" style={{ fontSize: 14, fontWeight: 800 }}>
            Paid · last 7 days
          </h2>
          <span style={{ fontSize: 13, color: "var(--slate)" }}>{asset}, verified payments only</span>
        </div>
        {change ? (
          <span className="anim-slide-right" style={{ fontSize: 13, fontWeight: 700, color: change.up ? "var(--good)" : "var(--bad)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={change.up ? "M7 17L17 7M8 7h9v9" : "M7 7l10 10M17 8v9H8"} />
            </svg>
            <span>
              {change.up ? "+" : "−"}
              <CountUpInt value={change.pct} suffix={change.capped ? "%+" : "%"} /> vs last week
            </span>
          </span>
        ) : null}
      </div>

      {error && !daily ? (
        <div className="empty" style={{ height: 200, justifyContent: "center", padding: 0 }}>
          <strong>Couldn&apos;t load the chart</strong>
          <span>{errorMessage(error)}</span>
        </div>
      ) : !daily ? (
        <div className={styles.chart} aria-busy="true">
          {[38, 62, 48, 80, 70, 90, 100].map((h, i) => (
            <div key={i} className={styles.col}>
              <div className={styles.track}>
                <div className={`skeleton ${styles.barBox}`} style={{ "--h": h } as React.CSSProperties} />
              </div>
              <span className={`skeleton ${styles.day}`}>Mon</span>
            </div>
          ))}
        </div>
      ) : max === 0n ? (
        <div className="empty" style={{ height: 200, justifyContent: "center", padding: 0 }}>
          <strong>No verified {asset} payments in the last 7 days</strong>
          <span>Each day gets a bar here as soon as a payment is verified on Stellar.</span>
        </div>
      ) : (
        <div className={styles.chart} role="list" aria-label={`${asset} paid per day, last 7 days`}>
          {week.map((d, i) => {
            const today = i === week.length - 1;
            // Height as a whole percent of the best day, computed in stroops; never a float amount.
            const pct = (toStroops(d.amount) * 100n) / max;
            const date = dayDate(d.date);
            const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
            const full = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
            const exact = `${formatAmount(d.amount)} ${asset}`;
            return (
              <div key={d.date} role="listitem" tabIndex={0} className={styles.col} aria-label={`${full}${today ? " (today)" : ""}: ${exact} from ${plural(d.payments, "payment")}`}>
                <div className={styles.track} aria-hidden="true">
                  <span className={`${styles.val}${today ? ` ${styles.valToday}` : ""}`} style={{ "--i": i } as React.CSSProperties}>
                    {compact(d.amount)}
                  </span>
                  <div className={`${styles.barBox}${today ? ` ${styles.barToday}` : ""}`} style={{ "--h": pct.toString() } as React.CSSProperties}>
                    <div className={`bar ${styles.barFill}`} style={{ "--i": i } as React.CSSProperties} />
                  </div>
                </div>
                <span className={`${styles.day}${today ? ` ${styles.dayToday}` : ""}`} aria-hidden="true">
                  {weekday}
                </span>
                <span className={`${styles.tip}${i < 2 ? ` ${styles.tipLeft}` : i > 4 ? ` ${styles.tipRight}` : ""}`} aria-hidden="true">
                  <span className={styles.tipMuted}>
                    {full}
                    {today ? " · today" : ""}
                  </span>
                  <span className={styles.tipStrong}>{exact}</span>
                  <span className={styles.tipMuted}>{d.payments === 0 ? "No payments" : plural(d.payments, "verified payment")}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const STEPS = [
  { title: "You create a request", text: "Amount, asset and the wallet that should receive it. You get a unique link and memo." },
  { title: "The customer pays", text: "They open the link and pay from any Stellar wallet. The money goes straight to your wallet." },
  { title: "We verify on Stellar", text: "Right wallet, right asset, right amount, right memo. The request flips to Paid with the transaction hash." },
];

function HowItWorks({ onCreate }: { onCreate: () => void }) {
  return (
    <section className={styles.panel} aria-labelledby="how-title">
      <h2 id="how-title" style={{ fontSize: 14, fontWeight: 800 }}>
        How PayBridge works
      </h2>
      {STEPS.map((step, i) => (
        <div key={step.title} className={styles.step}>
          <span className={styles.stepNum} style={{ "--i": i } as React.CSSProperties} aria-hidden="true">
            {i + 1}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{step.title}</span>
            <span style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5 }}>{step.text}</span>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={onCreate} style={{ marginTop: "auto", fontSize: 15 }}>
        <Icon name="plus" size={16} strokeWidth={2.6} />
        Create your first request
      </button>
    </section>
  );
}

function LookItem({ href, i, danger, title, text }: { href: string; i: number; danger?: boolean; title: string; text: string }) {
  return (
    <Link href={href} className={styles.look} style={{ "--i": i } as React.CSSProperties}>
      <span className={`${styles.lookIcon}${danger ? ` ${styles.lookIconDanger}` : ""}`}>
        <Icon name="alert" size={16} strokeWidth={2.2} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ fontSize: 13, color: "var(--slate)" }}>{text}</span>
      </span>
      <svg className={styles.lookArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

function NeedsALook({ summary }: { summary: Summary }) {
  const { unmatched, refunds, refundRequests } = summary.needsYou;
  const more = refunds - refundRequests.length;
  let i = 0;
  return (
    <section className={styles.panel} style={{ gap: 10 }} aria-labelledby="look-title">
      <h2 id="look-title" style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
        Needs a look
      </h2>
      {unmatched > 0 ? (
        <LookItem href="/unmatched" i={i++} danger title={`${plural(unmatched, "payment")} couldn't be matched`} text="Match each one to its request, or send it back from your wallet." />
      ) : null}
      {summary.open.underpaid > 0 ? (
        <LookItem
          href="/requests"
          i={i++}
          title={`${plural(summary.open.underpaid, "request")} underpaid`}
          text="The customer sent less than the amount. Wait for the rest, or accept what arrived."
        />
      ) : null}
      {refundRequests.map((r) => (
        <LookItem
          key={r.id}
          href={`/requests/${r.id}`}
          i={i++}
          title={`${requestTitle(r)}: ${r.refundDue.map((d) => `${formatAmount(d.amount)} ${d.asset.code}`).join(" + ")} to send back`}
          text="Send it back from your wallet, then mark it refunded."
        />
      ))}
      {more > 0 ? (
        <Link href="/requests" style={{ fontSize: 13, fontWeight: 700 }}>
          and {more} more with a refund to send
        </Link>
      ) : null}
    </section>
  );
}

export default function OverviewPage() {
  const { merchant } = useMe();
  const { data: wallets } = useWallets();
  const newRequest = useNewRequest();
  const router = useRouter();
  const now = useNow();
  const poll = usePollWhenOffline();

  // Start of today in the merchant's own timezone. Recomputed when the calendar day changes.
  const dayKey = new Date(now).toDateString();
  const from = useMemo(() => {
    const d = new Date(dayKey);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [dayKey]);
  const tzOffset = useMemo(() => -new Date(dayKey).getTimezoneOffset(), [dayKey]);

  // The asset the merchant settles in leads the tile and the chart; assets are never added together.
  const main = merchant?.defaultAsset ?? "USDC";
  const { data: summary, error: summaryError } = useSWR<Summary>(`/v1/summary?from=${encodeURIComponent(from)}`, { refreshInterval: poll, keepPreviousData: true });
  // 14 days: the last 7 are the bars, the 7 before are the "vs last week" comparison.
  const { data: daily, error: dailyError } = useSWR<Daily>(`/v1/summary/daily?days=14&tzOffsetMinutes=${tzOffset}&asset=${main}`, { refreshInterval: poll, keepPreviousData: true });
  const { data: requests, error: requestsError } = useSWR<Page<PaymentRequest>>("/v1/payment-requests?limit=6", { refreshInterval: poll });
  const { data: stats } = useSWR<RequestStats>("/v1/payment-requests/stats", { refreshInterval: poll });
  const { data: pending } = useSWR<Page<PaymentRequest>>("/v1/payment-requests?status=PENDING&limit=1", { refreshInterval: poll });

  const rows = requests?.data;
  // Newest request still open: the list is newest first, so the first open row wins; older ones come from the pending query.
  const payPage = rows?.find((r) => isOpen(r.status)) ?? pending?.data[0];

  const hour = new Date(now).getHours();
  const firstName = merchant?.businessName.trim().split(/\s+/)[0] ?? "";
  const greeting = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${firstName ? `, ${firstName}` : ""}`;

  const usdc = summary?.collected.find((c) => c.asset.code === main);
  const others = summary?.collected.filter((c) => c.asset.code !== main) ?? [];
  const needs = summary ? summary.open.underpaid + summary.needsYou.refunds + summary.needsYou.unmatched : null;
  const hasRequests = stats ? stats.total > 0 : rows && rows.length > 0 ? true : undefined;

  // "Needs a look" wiggles once whenever its count rises while the page is open.
  const lastNeeds = useRef<number | null>(null);
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    if (needs === null) return;
    if (lastNeeds.current !== null && needs > lastNeeds.current) setNudge((n) => n + 1);
    lastNeeds.current = needs;
  }, [needs]);

  // A row that is new, or whose status or received amount changed while on screen, flashes once.
  const seen = useRef<Map<string, string> | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!rows) return;
    const previous = seen.current;
    const next = new Map(rows.map((r) => [r.id, `${displayStatus(r).key}:${r.amountReceived}`]));
    seen.current = next;
    if (!previous) return;
    const changed = rows.filter((r) => previous.get(r.id) !== next.get(r.id)).map((r) => r.id);
    if (changed.length === 0) return;
    setFresh(new Set(changed));
    if (freshTimer.current) clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setFresh(new Set()), 1900);
  }, [rows]);
  useEffect(
    () => () => {
      if (freshTimer.current) clearTimeout(freshTimer.current);
    },
    [],
  );

  const side = hasRequests === undefined ? "loading" : !hasRequests ? "how" : summary && needs !== null && needs > 0 ? "look" : "none";

  return (
    <>
      <div className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <h1 className={`h1 ${styles.greet}`}>{greeting}</h1>
          <span className={`sub ${styles.greetSub}`}>{merchant ? `${merchant.businessName} · ` : ""}Stellar Testnet</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {payPage ? (
            <a className="btn btn-secondary" href={payPage.checkoutUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15 }}>
              <Icon name="qr" size={16} />
              See the pay page
            </a>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => newRequest()} title="No open request yet. Create one to see its pay page." style={{ fontSize: 15 }}>
              <Icon name="qr" size={16} />
              See the pay page
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => newRequest()} style={{ fontSize: 15 }}>
            <Icon name="plus" size={16} strokeWidth={2.6} />
            New payment request
          </button>
        </div>
      </div>

      {wallets && wallets.data.length === 0 ? (
        <div className="notice" role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px" }}>
          <span>
            <strong>Add a receiving wallet to start getting paid.</strong> Payments go straight to your own Stellar wallet, so PayBridge needs its public address.
          </span>
          <Link href="/onboarding" className="btn btn-dark btn-sm">
            Add a wallet
          </Link>
        </div>
      ) : null}

      {summaryError && !summary ? (
        <div role="alert" className="alert">
          We couldn&apos;t load today&apos;s numbers. {errorMessage(summaryError)}
        </div>
      ) : null}

      <div className={`${styles.tiles} stagger`} aria-busy={!summary}>
        <Tile
          label="Paid today"
          value={
            summary ? (
              <>
                <CountUpAmount value={usdc?.amount ?? "0"} /> <span className={styles.tileUnit}>{main}</span>
              </>
            ) : (
              <span className="skeleton">000.00 {main}</span>
            )
          }
          sub={
            summary
              ? [usdc ? plural(usdc.payments, "verified payment") : others.length === 0 ? "No payments yet today" : null, ...others.map((c) => `+ ${formatAmount(c.amount)} ${c.asset.code}`)]
                  .filter(Boolean)
                  .join(" · ")
              : null
          }
        />
        <Tile
          label="Requests today"
          value={summary ? <CountUpInt value={summary.requests.created} /> : <span className="skeleton">00</span>}
          sub={summary ? (summary.requests.created === 0 ? "None created yet" : `${summary.requests.settled} paid so far`) : null}
        />
        <Tile
          label="Pending"
          href="/requests"
          colour="var(--info)"
          value={summary ? <CountUpInt value={summary.open.count} /> : <span className="skeleton">00</span>}
          sub={summary ? (summary.open.nextExpiresAt ? `Next closes in ${timeLeft(summary.open.nextExpiresAt, now) || "a moment"}` : "No open requests") : null}
        />
        <Tile
          label="Needs a look"
          href={summary && summary.needsYou.unmatched > 0 ? "/unmatched" : "/requests"}
          colour="var(--warn)"
          attention={needs !== null && needs > 0}
          nudge={nudge}
          value={needs !== null ? <CountUpInt value={needs} /> : <span className="skeleton">00</span>}
          sub={
            summary
              ? needs === 0
                ? "Nothing waiting on you"
                : [
                    summary.open.underpaid > 0 ? `${summary.open.underpaid} underpaid` : null,
                    summary.needsYou.refunds > 0 ? plural(summary.needsYou.refunds, "refund") : null,
                    summary.needsYou.unmatched > 0 ? `${summary.needsYou.unmatched} unmatched` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
              : null
          }
        />
      </div>

      <div className={`${styles.split}${side === "none" ? ` ${styles.splitOne}` : ""}`}>
        <WeekChart daily={daily} error={dailyError} asset={main} />
        {side === "how" ? (
          <HowItWorks onCreate={() => newRequest()} />
        ) : side === "look" && summary ? (
          <NeedsALook summary={summary} />
        ) : side === "loading" ? (
          <section className={styles.panel} aria-busy="true">
            <span className="skeleton" style={{ alignSelf: "flex-start" }}>
              Loading this card
            </span>
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" style={{ height: 44 }} />
            ))}
          </section>
        ) : null}
      </div>

      <section className="card" style={{ overflow: "hidden" }} aria-labelledby="recent-title">
        <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
          <h2 id="recent-title" style={{ fontSize: 14, fontWeight: 800 }}>
            Recent requests
          </h2>
          <Link href="/requests" className={styles.allLink} style={{ fontSize: 13, fontWeight: 700 }}>
            All requests{" "}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
        {requestsError && !rows ? (
          <div className="empty">
            <strong>Couldn&apos;t load requests</strong>
            <span>{errorMessage(requestsError)}</span>
          </div>
        ) : rows && rows.length === 0 ? (
          <div className="empty">
            <strong>No requests yet</strong>
            <span>Create one and send the link. It shows up here and flips to Paid by itself.</span>
            <button type="button" className="btn btn-primary" onClick={() => newRequest()} style={{ marginTop: 8 }}>
              <Icon name="plus" size={16} strokeWidth={2.6} />
              New payment request
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className={`table cascade ${styles.recent}`}>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>For</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  ? rows.map((r) => (
                      <tr
                        key={r.id}
                        className={fresh.has(r.id) ? `is-fresh ${styles.fresh}` : undefined}
                        onClick={(e) => {
                          // The row is a shortcut for the mouse; links inside keep their own behaviour.
                          if ((e.target as HTMLElement).closest("a, button")) return;
                          router.push(`/requests/${r.id}`);
                        }}
                      >
                        <td style={{ color: "var(--slate)" }} title={new Date(r.createdAt).toLocaleString("en-GB")}>
                          {timeAgo(r.createdAt, now)}
                        </td>
                        <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                          <Link className="rowlink" href={`/requests/${r.id}`} style={{ fontWeight: 700 }}>
                            {r.description ? r.description : <span className="mono">{r.memo}</span>}
                          </Link>
                        </td>
                        <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{r.customerEmail ?? <span style={{ color: "var(--slate-soft)" }}>—</span>}</td>
                        <td className="num">
                          {formatAmount(r.amount)} {r.asset.code}
                        </td>
                        <td>
                          <RequestPill request={r} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {r.paidTxHash ? (
                            <a className={styles.txLink} href={explorerTx(r.paidTxHash)} target="_blank" rel="noopener noreferrer" aria-label={`Transaction ${shortHash(r.paidTxHash)} on Stellar Expert`}>
                              {shortHash(r.paidTxHash)}
                              <Icon name="external" size={12} strokeWidth={2.4} />
                            </a>
                          ) : (
                            <span style={{ color: "var(--slate-soft)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  : [0, 1, 2].map((i) => (
                      <tr key={i}>
                        <td colSpan={6}>
                          <span className="skeleton">Loading request</span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
