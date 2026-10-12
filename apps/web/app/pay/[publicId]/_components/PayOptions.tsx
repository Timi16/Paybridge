"use client";

import { useEffect, useRef, useState } from "react";
import { formatAmount, shortAddress } from "@/lib/format";
import { FreighterError } from "@/lib/freighter";
import { PayError, payWithFreighter } from "@/lib/stellar-pay";
import type { Checkout } from "@/lib/types";
import styles from "./checkout.module.css";

/**
 * How the customer says a payment is on its way: Freighter returned a hash, they tapped
 * "I have sent it", or they came back to this page after opening a wallet link.
 */
export type SentVia = "freighter" | "manual" | "link";

type Tab = "wallet" | "qr" | "manual";
const TABS: { key: Tab; label: string }[] = [
  { key: "wallet", label: "Wallet" },
  { key: "qr", label: "QR code" },
  { key: "manual", label: "Manual" },
];

interface Props {
  checkout: Checkout;
  onSent: (via: SentVia, hash?: string) => void;
}

/** The three ways to pay an open request: a wallet (SEP-7 link or Freighter), a QR code, or by hand. */
export function PayOptions({ checkout, onSent }: Props) {
  const [at, setAt] = useState<{ tab: Tab; dir: "forward" | "back" }>({ tab: "wallet", dir: "forward" });
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const index = TABS.findIndex((t) => t.key === at.tab);

  const pick = (tab: Tab) => {
    const next = TABS.findIndex((t) => t.key === tab);
    if (next !== index) setAt({ tab, dir: next > index ? "forward" : "back" });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    if (!next) return;
    pick(next.key);
    tabRefs.current[next.key]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="How to pay" onKeyDown={onKey} className={styles.tabs}>
        <span className={styles.tabThumb} style={{ "--i": index } as React.CSSProperties} aria-hidden="true" />
        {TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            type="button"
            role="tab"
            id={`pay-tab-${t.key}`}
            aria-selected={at.tab === t.key}
            aria-controls="pay-panel"
            tabIndex={at.tab === t.key ? 0 : -1}
            onClick={() => pick(t.key)}
            className={styles.tab}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={at.tab} data-dir={at.dir} className={styles.tabPanel} role="tabpanel" id="pay-panel" aria-labelledby={`pay-tab-${at.tab}`}>
        {at.tab === "wallet" && <WalletPanel checkout={checkout} onSent={onSent} />}
        {at.tab === "qr" && <QrPanel uri={checkout.sep7Uri} memo={checkout.memo} />}
        {at.tab === "manual" && <ManualPanel checkout={checkout} onSent={onSent} />}
      </div>
    </>
  );
}

function Chevron() {
  return (
    <svg className={styles.chev} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function WalletPanel({ checkout, onSent }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The wallet whose SEP-7 link the customer just opened. */
  const [opened, setOpened] = useState<string | null>(null);
  const away = useRef(false);
  const blocked = !checkout.canReceive;
  // These are plain SEP-7 links: the customer's own wallet app picks them up, if one is installed.
  const link = checkout.sep7Uri.startsWith("web+stellar:") ? checkout.sep7Uri : undefined;

  // Coming back to this page after the wallet took over: start looking for the payment.
  useEffect(() => {
    if (!opened) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away.current = true;
      else if (away.current) {
        away.current = false;
        onSent("link");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [opened, onSent]);

  const pay = async () => {
    if (busy || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const { hash } = await payWithFreighter({
        destination: checkout.wallet,
        asset: checkout.asset,
        amount: checkout.amountRemaining,
        memo: checkout.memo,
      });
      onSent("freighter", hash);
    } catch (err) {
      setError(err instanceof FreighterError || err instanceof PayError ? err.message : "That didn't go through. Nothing was sent. Try again.");
      setBusy(false);
    }
  };

  const sep7 = (name: string, primary: boolean, icon: React.ReactNode, sub?: string) => {
    const className = `${styles.wallet} ${primary ? styles.walletPrimary : ""}`;
    const body = (
      <>
        {icon}
        <span className={styles.walletText}>
          <span>{primary ? `Pay with ${name}` : name}</span>
          {sub && <span className={styles.walletSub}>{sub}</span>}
        </span>
        <Chevron />
      </>
    );
    return blocked || !link ? (
      <button type="button" disabled className={className}>
        {body}
      </button>
    ) : (
      <a
        href={link}
        className={className}
        onClick={() => {
          away.current = false;
          setOpened(name);
        }}
      >
        {body}
      </a>
    );
  };

  return (
    <>
      <button type="button" onClick={pay} disabled={busy || blocked} aria-busy={busy} className={`${styles.wallet} ${styles.walletPrimary}`}>
        <span className={styles.walletIcon} style={{ background: "var(--ink)" }} aria-hidden="true">
          F
        </span>
        <span className={styles.walletText}>
          <span>Pay with Freighter</span>
          <span className={styles.walletSub}>{busy ? "Waiting for Freighter…" : "Amount and memo filled in for you"}</span>
        </span>
        {busy ? <span className={styles.spinner} aria-hidden="true" /> : <Chevron />}
      </button>
      {sep7(
        "Lobstr",
        false,
        <span className={styles.walletIcon} style={{ background: "#1E88E5" }} aria-hidden="true">
          L
        </span>,
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <span role="status" className={styles.hint}>
          Approve the payment in the Freighter window. Keep this page open.
        </span>
      )}
      {opened && !busy && (
        <div className={styles.opened} role="status">
          <span>
            Approved it in {opened}? Tap below and this page will look for your payment. If nothing opened, {opened} is not on this device: use the QR
            code or Manual tab.
          </span>
          <button type="button" onClick={() => onSent("manual")} className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }}>
            I have sent it
          </button>
        </div>
      )}
      <span className={styles.hint}>Opens your wallet with a SEP-7 payment request. Check the amount and memo there, then approve.</span>
    </>
  );
}

function QrPanel({ uri, memo }: { uri: string; memo: string }) {
  const [qr, setQr] = useState<{ uri: string; src: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((mod) => {
        // CommonJS package: depending on the bundler the functions sit on the namespace or on `default`.
        const lib = mod.default ?? mod;
        return lib.toString(uri, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0F172A", light: "#FFFFFF" } });
      })
      .then((svg) => {
        if (live) setQr({ uri, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {
        if (live) setQr({ uri, src: null });
      });
    return () => {
      live = false;
    };
  }, [uri]);

  const ready = qr && qr.uri === uri ? qr : null;

  return (
    <>
      {ready && !ready.src ? (
        <div className="alert" role="alert">
          Couldn&apos;t draw the QR code. Copy the payment link below, or use the Manual tab.
        </div>
      ) : (
        <div className={styles.qrFrame} style={{ alignSelf: "center" }}>
          {ready?.src ? (
            <>
              <img src={ready.src} className={styles.qrImg} alt="Payment QR code with the address, amount and memo" />
              <span className={styles.qrScan} aria-hidden="true" />
            </>
          ) : (
            <div className={`skeleton ${styles.qrImg}`} role="img" aria-label="Drawing the QR code" />
          )}
        </div>
      )}
      <span style={{ fontSize: 14, fontWeight: 700, textAlign: "center" }}>Scan with any Stellar wallet</span>
      <span className={styles.hint}>
        The code carries the address, amount and memo. If your wallet asks for a memo, it is{" "}
        <span className={styles.mono} style={{ color: "var(--ink)", fontWeight: 600 }}>
          {memo}
        </span>
        .
      </span>
      <CopyChip value={uri} label="Copy payment link" what="payment link" style={{ alignSelf: "center" }} />
    </>
  );
}

function ManualPanel({ checkout, onSent }: Props) {
  const { asset } = checkout;
  // What a wallet's amount box accepts: no thousands separators.
  const plainAmount = formatAmount(checkout.amountRemaining).replace(/,/g, "");
  const groups = checkout.wallet.match(/.{1,8}/g) ?? [checkout.wallet];

  return (
    <>
      <div className={styles.memoBox}>
        <span className={styles.memoLabel}>Memo · required, or the payment cannot be matched</span>
        <div className={styles.line}>
          <span className={styles.memoValue}>{checkout.memo}</span>
          <CopyChip value={checkout.memo} what="memo" />
        </div>
      </div>

      <div className={styles.box}>
        <span className={styles.boxLabel}>Send to</span>
        <div className={styles.line}>
          {/* Shown in groups of 8 so it can be checked by eye; the groups are spaced with CSS, so selecting it copies no spaces. */}
          <span className={styles.address}>
            <span className="sr-only" style={{ userSelect: "none" }}>
              {checkout.wallet}
            </span>
            {groups.map((group, i) => (
              <span key={i} aria-hidden="true">
                {group}
              </span>
            ))}
          </span>
          <CopyChip value={checkout.wallet} what="address" />
        </div>
      </div>

      <div className={styles.box}>
        <div className={styles.line}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span className={styles.boxLabel}>Amount · exactly</span>
            <span className={styles.mono} style={{ fontSize: 16, fontWeight: 600 }}>
              {formatAmount(checkout.amountRemaining)} {asset.code}
            </span>
            <span style={{ fontSize: 13, color: "var(--slate)" }}>
              {asset.issuer ? (
                <>
                  {asset.code} issued by{" "}
                  <span className={styles.mono} title={asset.issuer}>
                    {shortAddress(asset.issuer)}
                  </span>
                </>
              ) : (
                `${asset.code} · Stellar's own currency`
              )}
            </span>
          </div>
          <CopyChip value={plainAmount} what="amount" />
        </div>
      </div>

      <details className={`${styles.box} ${styles.disclosure}`}>
        <summary>Your wallet cannot send a text memo? Send to this address instead</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className={styles.line}>
            <span className={styles.mono} style={{ fontSize: 12, wordBreak: "break-all" }}>
              {checkout.muxedAddress}
            </span>
            <CopyChip value={checkout.muxedAddress} what="address that needs no memo" />
          </div>
          <span style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5 }}>
            This address (it starts with M) already carries this payment&apos;s reference, so leave the memo empty. Send the same amount and asset.
          </span>
        </div>
      </details>

      <button type="button" onClick={() => onSent("manual")} className="btn btn-secondary btn-block" style={{ height: 46, fontSize: 15 }}>
        I have sent it
      </button>
    </>
  );
}

/**
 * A copy button that turns into a drawn tick for two seconds. Local to the pay page because the
 * shared CopyButton only swaps its text.
 */
function CopyChip({ value, what, label = "Copy", style }: { value: string; what: string; label?: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
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
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" onClick={copy} className={styles.copy} data-copied={copied} style={style} aria-label={`Copy ${what}`}>
      <span key={copied ? "done" : "idle"} className={styles.copyFace}>
        {copied && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
        {copied ? "Copied" : label}
      </span>
      <span className="sr-only" role="status">
        {copied ? `${what} copied` : ""}
      </span>
    </button>
  );
}
