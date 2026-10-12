"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Icon } from "@/components/Icon";
import { CountUpInt } from "@/components/motion/CountUp";
import { useNewRequest } from "@/components/NewRequest";
import { RequestPill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { api, errorMessage, qs } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { shortAddress, shortHash } from "@/lib/format";
import { useNow, usePollWhenOffline } from "@/lib/live";
import { useWallets } from "@/lib/session";
import { displayStatus, REQUEST_STATUS } from "@/lib/status";
import type { Page, PaymentRequest, RequestStats, RequestStatus } from "@/lib/types";
import { CopyMorph, dayTime, forLabel, Glyph, money } from "./_components/shared";
import styles from "./_components/requests.module.css";

const PAGE_SIZE = 20;
const EXPORT_PAGE = 100;
const EXPORT_MAX = 1000;

/** Always shown. Overpaid and Network reset appear only when they have requests. */
const CHIPS: RequestStatus[] = ["PENDING", "PAID", "UNDERPAID", "EXPIRED", "CANCELLED"];
const RARE_CHIPS: RequestStatus[] = ["OVERPAID", "NETWORK_RESET"];

const SKELETON_WIDTHS = [96, 150, 150, 96, 120, 92, 78, 88, 84];

interface ChipItem {
  status: RequestStatus | null;
  label: string;
  count: number | null;
}

/** Status filter. One highlight slides to the active chip instead of each chip switching on and off. */
function Chips({ items, active, onPick }: { items: ChipItem[]; active: RequestStatus | null; onPick: (s: RequestStatus | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const shape = items.map((i) => i.status ?? "all").join(",");

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!on) return setInk(null);
      const next = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
      setInk((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    if (!("ResizeObserver" in window)) return;
    // Counts change width as they count up, and chips wrap on narrow screens: follow both.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll("button").forEach((b) => observer.observe(b));
    return () => observer.disconnect();
  }, [active, shape]);

  return (
    <div ref={wrap} role="group" aria-label="Filter by status" className={styles.chips}>
      {ink ? <span aria-hidden="true" className={styles.chipInk} style={{ width: ink.w, height: ink.h, transform: `translate(${ink.x}px, ${ink.y}px)` }} /> : null}
      {items.map((c) => {
        const on = active === c.status;
        return (
          <button key={c.status ?? "all"} type="button" aria-pressed={on} onClick={() => onPick(c.status)} className={`${styles.chip} ${on ? (ink ? styles.chipOn : styles.chipSolid) : ""}`}>
            {c.label}
            {c.count !== null ? (
              <span className="mono">
                <CountUpInt value={c.count} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** One CSV cell: quoted, and never something a spreadsheet would run as a formula. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: PaymentRequest[]): string {
  const head = ["created", "for", "customer", "amount", "asset", "to wallet", "memo", "status", "transaction", "link"];
  const lines = rows.map((r) =>
    [r.createdAt, forLabel(r), r.customerEmail ?? "", r.amount, r.asset.code, r.wallet, r.memo, displayStatus(r).label, r.paidTxHash ?? "", r.checkoutUrl].map(csvCell).join(","),
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}

function download(name: string, text: string) {
  // The BOM makes spreadsheet apps read the file as UTF-8.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RequestsPage() {
  const router = useRouter();
  const newRequest = useNewRequest();
  const toast = useToast();
  const wallets = useWallets();
  const now = useNow();
  const refreshInterval = usePollWhenOffline();

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<RequestStatus | null>(null);
  /** The cursor that opened each page after the first; the last one is the current page. */
  const [cursors, setCursors] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Debounce typing into the query, and go back to the first page when it changes.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim().slice(0, 64));
      setCursors((c) => (c.length ? [] : c));
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const cursor = cursors[cursors.length - 1];
  const listKey = `/v1/payment-requests${qs({ status, q, cursor, limit: PAGE_SIZE })}`;
  // No keepPreviousData here on purpose: a new filter shows the shimmer, then its rows cascade in.
  // Live refreshes reuse the same key, so they update rows in place.
  const list = useSWR<Page<PaymentRequest>>(listKey, { refreshInterval });
  const stats = useSWR<RequestStats>(`/v1/payment-requests/stats${qs({ q })}`, { refreshInterval, keepPreviousData: true });

  const page = list.data;
  const rows = page?.data ?? [];
  const loading = !page && !list.error;
  const failed = !page && Boolean(list.error);
  const filtered = q !== "" || status !== null;
  const nextCursor = page?.nextCursor ?? null;

  // A row whose status changes while the page is open flashes once.
  const seen = useRef(new Map<string, string>());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!page) return;
    const changed: string[] = [];
    for (const r of page.data) {
      const key = displayStatus(r).key;
      const before = seen.current.get(r.id);
      if (before !== undefined && before !== key) changed.push(r.id);
      seen.current.set(r.id, key);
    }
    if (changed.length === 0) return;
    setFresh((s) => new Set([...s, ...changed]));
    setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !changed.includes(id)))), 1900);
  }, [page]);

  const count = (s: RequestStatus | null) => (stats.data ? (s === null ? stats.data.total : (stats.data.byStatus[s] ?? 0)) : null);
  const chips: ChipItem[] = [
    { status: null, label: "All", count: count(null) },
    ...[...CHIPS, ...RARE_CHIPS.filter((s) => status === s || (count(s) ?? 0) > 0)].map((s) => ({ status: s, label: REQUEST_STATUS[s].label, count: count(s) })),
  ];

  const walletLabel = new Map((wallets.data?.data ?? []).map((w) => [w.id, w.label]));

  const total = count(status);
  const first = cursors.length * PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const shownTotal = total ?? (page ? rows.length : null);
  let footer = "";
  if (shownTotal !== null) {
    const noun = `${shownTotal} request${shownTotal === 1 ? "" : "s"}`;
    footer = rows.length > 0 && shownTotal > rows.length && shownTotal >= last ? `${first}–${last} of ${noun}` : noun;
  }

  const pick = (s: RequestStatus | null) => {
    setStatus(s);
    setCursors([]);
  };
  const clear = () => {
    setSearch("");
    setQ("");
    setStatus(null);
    setCursors([]);
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all: PaymentRequest[] = [];
      let next: string | null | undefined;
      do {
        const part: Page<PaymentRequest> = await api.get<Page<PaymentRequest>>(`/v1/payment-requests${qs({ status, q, cursor: next, limit: EXPORT_PAGE })}`);
        all.push(...part.data);
        next = part.nextCursor;
      } while (next && all.length < EXPORT_MAX);
      const out = all.slice(0, EXPORT_MAX);
      if (out.length === 0) {
        toast("Nothing to export for this filter");
        return;
      }
      const name = `paybridge-requests-${new Date().toISOString().slice(0, 10)}.csv`;
      download(name, toCsv(out));
      toast(`${name} · ${out.length} row${out.length === 1 ? "" : "s"}${next || all.length > EXPORT_MAX ? " (the first 1,000)" : ""}`);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 className="h1">Requests</h1>
          <span className="sub">Every payment request you created and what Stellar says about it.</span>
        </div>
        <div className={styles.headTools}>
          <div className={styles.search}>
            <span className={styles.searchIcon}>
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              aria-label="Search requests"
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={64}
              placeholder="Search reference, description, memo"
            />
          </div>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 15, padding: "0 18px" }} onClick={exportCsv} disabled={exporting || total === 0} aria-busy={exporting}>
            <Glyph name={exporting ? "refresh" : "download"} strokeWidth={2.2} className={exporting ? styles.spinning : undefined} />
            {exporting ? "Preparing…" : "Export CSV"}
          </button>
          <button type="button" className="btn btn-primary" style={{ fontSize: 15 }} onClick={() => newRequest()}>
            <Icon name="plus" size={16} strokeWidth={2.6} />
            New payment request
          </button>
        </div>
      </div>

      <Chips items={chips} active={status} onPick={pick} />

      <div className="card" style={{ overflow: "hidden" }}>
        {failed ? (
          <div className="empty" role="alert">
            <strong>We couldn&apos;t load your requests</strong>
            <span>{errorMessage(list.error)}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => list.mutate()} style={{ marginTop: 4 }}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table cascade" style={{ minWidth: 1080 }} aria-busy={loading}>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>For</th>
                    <th>Customer</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>To wallet</th>
                    <th>Memo</th>
                    <th>Status</th>
                    <th>Transaction</th>
                    <th style={{ textAlign: "right" }}>
                      <span className="sr-only">Payment link</span>
                    </th>
                  </tr>
                </thead>
                {/* Keyed by the query so rows cascade in again whenever the filter, search or page changes. */}
                <tbody key={loading ? "loading" : listKey}>
                  {loading
                    ? Array.from({ length: 8 }, (_, i) => (
                        <tr key={i}>
                          {SKELETON_WIDTHS.map((w, j) => (
                            <td key={j} style={j === 8 ? { textAlign: "right" } : undefined}>
                              <span className="skeleton" style={{ display: "inline-block", width: w, height: 16 }}>
                                &nbsp;
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))
                    : rows.map((r) => {
                        const title = forLabel(r);
                        const label = walletLabel.get(r.walletId);
                        return (
                          <tr
                            key={r.id}
                            className={`${styles.row} ${fresh.has(r.id) ? styles.rowFlash : ""}`}
                            onClick={(e) => {
                              // The whole row opens the request; links and buttons inside keep their own job.
                              if ((e.target as HTMLElement).closest("a, button")) return;
                              router.push(`/requests/${r.id}`);
                            }}
                          >
                            <td style={{ color: "var(--slate)" }}>{dayTime(r.createdAt, now)}</td>
                            <td>
                              <Link className={`rowlink ${styles.clip}`} href={`/requests/${r.id}`} style={{ fontWeight: 700 }} title={title}>
                                {title}
                              </Link>
                            </td>
                            <td>
                              {r.customerEmail ? (
                                <span className={styles.clip} title={r.customerEmail}>
                                  {r.customerEmail}
                                </span>
                              ) : (
                                <span style={{ color: "var(--slate-soft)" }}>—</span>
                              )}
                            </td>
                            <td className="num">{money(r.amount, r.asset.code)}</td>
                            <td style={{ color: "var(--slate)", fontSize: 13 }} title={r.wallet}>
                              {label ? <span style={{ color: "var(--ink)", fontWeight: 600 }}>{label} · </span> : null}
                              <span className="mono">{shortAddress(r.wallet)}</span>
                            </td>
                            <td className="mono" style={{ fontSize: 13 }}>
                              {r.memo}
                            </td>
                            <td>
                              <RequestPill request={r} />
                            </td>
                            <td>
                              {r.paidTxHash ? (
                                <a href={explorerTx(r.paidTxHash)} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  {shortHash(r.paidTxHash)}
                                  <Glyph name="external" size={12} strokeWidth={2.4} />
                                  <span className="sr-only">on Stellar Expert (opens in a new tab)</span>
                                </a>
                              ) : (
                                <span style={{ color: "var(--slate-soft)" }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <CopyMorph value={r.checkoutUrl} label="Copy link" icon="link" size="xs" ariaLabel={`Copy payment link for ${title}`} />
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
            {page && rows.length === 0 ? (
              filtered ? (
                <div className="empty anim-slide-up">
                  <strong>No requests match</strong>
                  <span style={{ fontSize: 13 }}>Try another status or clear the search.</span>
                  <button type="button" className={styles.copy} onClick={clear} style={{ marginTop: 6 }}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="empty anim-slide-up">
                  <strong>No requests yet</strong>
                  <span style={{ fontSize: 13 }}>Create a payment request and send its link to your customer.</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => newRequest()} style={{ marginTop: 6 }}>
                    <Icon name="plus" size={14} strokeWidth={2.6} />
                    New payment request
                  </button>
                </div>
              )
            ) : null}
            <div className={styles.foot}>
              <span aria-live="polite">{footer ? `${footer} · ` : ""}Stellar Testnet · verified against Horizon</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className={styles.pager} disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.pager}
                  disabled={!nextCursor}
                  onClick={() => {
                    if (nextCursor) setCursors((c) => [...c, nextCursor]);
                  }}
                >
                  Next
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
