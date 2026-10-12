"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { formatAmount, formatTime } from "@/lib/format";
import styles from "./requests.module.css";
import type { AssetRef, ChainPayment, PaymentOutcome, PaymentRequest } from "@/lib/types";

/** Below 0.01 of an asset a refund is dust: anyone can attach a one-stroop payment to a public memo. */
export const DUST_STROOPS = 100_000n;

/** Outcomes where money reached the wallet but was not applied, so it should go back. */
export const REFUNDABLE_OUTCOMES: PaymentOutcome[] = ["DUPLICATE", "LATE", "AFTER_CANCEL", "AFTER_RESET", "WRONG_ASSET"];

/** Payments recorded before a testnet reset: that money no longer exists on the network. */
export const isPreReset = (p: Pick<ChainPayment, "eventId">) => p.eventId.startsWith("reset-");

export const sameAsset = (a: AssetRef, b: AssetRef) => a.code === b.code && (a.issuer ?? null) === (b.issuer ?? null);

/** "50.00 USDC" */
export const money = (amount: string, code: string) => `${formatAmount(amount)} ${code}`;

/** Stroops (bigint, not negative) -> a 7-decimal string, for amounts worked out on screen. */
export function fromStroops(stroops: bigint): string {
  const abs = stroops < 0n ? 0n : stroops;
  return `${abs / 10_000_000n}.${(abs % 10_000_000n).toString().padStart(7, "0")}`;
}

/** "today at 10:42", "tomorrow at 09:00", "yesterday at 18:20", "12 Oct at 10:42". */
export function dayAt(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  const day = (offset: number) => new Date(now + offset * 86_400_000).toDateString();
  const key = at.toDateString();
  let label: string;
  if (key === day(0)) label = "today";
  else if (key === day(1)) label = "tomorrow";
  else if (key === day(-1)) label = "yesterday";
  else {
    const sameYear = at.getFullYear() === new Date(now).getFullYear();
    label = at.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  }
  return `${label} at ${formatTime(iso)}`;
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard API unavailable (insecure context): fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

/** The design's 40 px square copy button; confirms with a toast. */
export function CopyIconButton({ value, ariaLabel, toast }: { value: string; ariaLabel: string; toast: string }) {
  const show = useToast();
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={async () => {
        await copyText(value);
        show(toast);
      }}
      style={{ width: 40, height: 40, flexShrink: 0, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 8, color: "var(--slate-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="copy" size={16} />
    </button>
  );
}

export interface RefundLine {
  asset: AssetRef;
  amount: string;
  stroops: bigint;
}

/**
 * Splits what a request still owes back into its two sources:
 * - `payments`: linked payments that were not applied and are not yet marked refunded;
 * - `own`: whatever `refundDue` holds beyond those (overpaid excess, or money counted before
 *   the request closed), which is recorded against the request itself.
 * Dust is left out of both.
 */
export function splitRefunds(request: PaymentRequest, payments: ChainPayment[]): { payments: ChainPayment[]; own: RefundLine[] } {
  const pending = payments.filter((p) => REFUNDABLE_OUTCOMES.includes(p.outcome) && !isPreReset(p) && p.refundedAt === null);
  const own: RefundLine[] = [];
  for (const line of request.refundDue) {
    const explained = pending.filter((p) => sameAsset(p.asset, line.asset)).reduce((sum, p) => sum + BigInt(p.amountStroops), 0n);
    const rest = BigInt(line.amountStroops) - explained;
    if (rest >= DUST_STROOPS) own.push({ asset: line.asset, amount: fromStroops(rest), stroops: rest });
  }
  return { payments: pending.filter((p) => BigInt(p.amountStroops) >= DUST_STROOPS), own };
}

/** What a request is for, in lists and headings: the description, else the merchant's reference, else the memo. */
export const forLabel = (r: Pick<PaymentRequest, "description" | "customerRef" | "memo">) => r.description || r.customerRef || r.memo;

/** "Today 10:24", "Yesterday 18:02", "12 Oct 10:24". */
export function dayTime(iso: string, now: number = Date.now()): string {
  const text = dayAt(iso, now).replace(" at ", " ");
  return text.replace(/^./, (c) => c.toUpperCase());
}

/** Timeline clock: "10:25:31" for today, otherwise "12 Oct 10:25". */
export function clock(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  if (at.toDateString() === new Date(now).toDateString()) return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${formatTime(iso)}`;
}

/** A length of time in words: "15 minutes", "2 hours", "1 hour 30 minutes", "3 days". */
export function span(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes < 60) return unit(minutes, "minute");
  if (minutes < 48 * 60) {
    const rest = minutes % 60;
    return `${unit(Math.floor(minutes / 60), "hour")}${rest ? ` ${unit(rest, "minute")}` : ""}`;
  }
  return unit(Math.round(minutes / 1440), "day");
}

/** "1284502" -> "1,284,502" (ledger numbers, counts). */
export const groupInt = (n: number) => n.toLocaleString("en-GB");

/** Opens WhatsApp with a message ready to send; the merchant picks the chat. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

const GLYPHS = {
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  copy: "M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM5 15V5a2 2 0 0 1 2-2h10",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  refresh: "M20 11A8 8 0 0 0 5.6 6.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.4 4.4L20 16M20 20v-4h-4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  chevronLeft: "M15 5l-7 7 7 7",
  warning: "M12 3l10 18H2zM12 10v4M12 17.5v.01",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2",
  check: "M5 12l5 5L20 7",
  cross: "M6 6l12 12M18 6L6 18",
  bang: "M12 6v7M12 17v.01",
  dash: "M6 12h12",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
} as const;
export type GlyphName = keyof typeof GLYPHS;

/** The design's own stroke icons that the shared Icon set does not carry. Decorative. */
export function Glyph({ name, size = 16, strokeWidth = 2, className, style }: { name: GlyphName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flexShrink: 0, ...style }}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}

interface CopyMorphProps {
  value: string;
  /** Visible label; leave out for an icon-only button (then `ariaLabel` is required). */
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  icon?: "link" | "copy";
  size?: "xs" | "sm" | "lg" | "icon";
  /** Also confirm with a toast. */
  toast?: string;
  onCopied?: () => void;
}

/** Copies `value`; the button turns green and its icon redraws as a tick for two seconds. */
export function CopyMorph({ value, label, copiedLabel = "Copied", ariaLabel, icon = "copy", size = "sm", toast, onCopied }: CopyMorphProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useToast();
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const sizeClass = size === "xs" ? styles.copyXs : size === "lg" ? styles.copyLg : size === "icon" ? styles.copyIcon : "";
  const px = size === "lg" ? 16 : size === "sm" ? 14 : 13;
  return (
    <button
      type="button"
      className={`${styles.copy} ${sizeClass} ${copied ? styles.copied : ""}`}
      aria-label={ariaLabel}
      onClick={async () => {
        await copyText(value);
        setCopied(true);
        if (toast) show(toast);
        onCopied?.();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <svg key="done" className={styles.glyph} width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path className={styles.tick} d="M5 12l5 5L20 7" />
        </svg>
      ) : (
        <Glyph key="idle" name={icon} size={px} />
      )}
      {label ? <span aria-live="polite">{copied ? copiedLabel : label}</span> : <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>}
    </button>
  );
}
