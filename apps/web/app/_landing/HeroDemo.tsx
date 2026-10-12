"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { CheckBurst } from "@/components/motion/CheckBurst";
import styles from "./landing.module.css";

type Phase = "pending" | "confirming" | "paid";

/** One loop of the demo, in seconds: waiting for the payment, checking it, paid. */
const PENDING_FOR = 6;
const CONFIRMING_FOR = 3;
const PAID_FOR = 4;
const LOOP = PENDING_FOR + CONFIRMING_FOR + PAID_FOR;
/** The sample request starts with 14:32 left. */
const STARTS_AT_SECONDS = 14 * 60 + 32;

function phaseAt(second: number): Phase {
  if (second < PENDING_FOR) return "pending";
  return second < PENDING_FOR + CONFIRMING_FOR ? "confirming" : "paid";
}

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

const PILL: Record<Phase, { label: string; className: string }> = {
  pending: { label: "Pending", className: "pill pill-info" },
  confirming: { label: "Confirming", className: "pill pill-brand" },
  paid: { label: "Paid", className: "pill pill-good" },
};

type Tab = "wallet" | "qr" | "manual";
const TABS: { id: Tab; label: string }[] = [
  { id: "wallet", label: "Wallet" },
  { id: "qr", label: "QR" },
  { id: "manual", label: "Manual" },
];

/** A QR-looking pattern for the sample card. Fixed and not a real code: it scans to nothing. */
const QR_SIZE = 21;
const QR_CELLS: boolean[] = Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
  const x = i % QR_SIZE;
  const y = Math.floor(i / QR_SIZE);
  const finder = (fx: number, fy: number) => {
    const dx = x - fx;
    const dy = y - fy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };
  return finder(0, 0) ?? finder(QR_SIZE - 7, 0) ?? finder(0, QR_SIZE - 7) ?? (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0;
});

const ARCH = "M28 50 C 100 -2, 260 -2, 332 50";

/**
 * The hero illustration: a sample pay page that loops Pending → Confirming → Paid while a
 * payment dot crosses the bridge from the customer's wallet to the merchant's. Sample content
 * only; it is exposed to assistive tech as a single image. Stands still with reduced motion,
 * off screen, in a background tab, or when paused.
 */
export function HeroDemo() {
  const [second, setSecond] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<Tab>("wallet");
  /** Someone is trying the sample card: the loop waits on Pending until they press pay or play. */
  const [held, setHeld] = useState(false);
  const art = useRef<HTMLDivElement>(null);
  const onScreen = useRef(true);

  useEffect(() => {
    const el = art.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      onScreen.current = entry?.isIntersecting ?? true;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.hidden || !onScreen.current) return;
      setSecond((s) => (s + 1) % LOOP);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, held]);

  const pick = (next: Tab) => {
    setTab(next);
    setSecond(0);
    setHeld(true);
  };
  const samplePay = () => {
    setHeld(false);
    setPaused(false);
    setSecond(PENDING_FOR);
  };

  const phase = phaseAt(second);
  const pill = PILL[phase];

  return (
    <div id="pay-page" className={styles.demo} data-paused={paused}>
      <span className={styles.glow} aria-hidden="true" />
      <div
        ref={art}
        className={styles.demoArt}
        role="group"
        aria-label="Sample PayBridge pay page for Lumi Store, order LS-1044, asking for 80.00 USDC on Testnet. Illustration only: no payment is made. It goes from Pending to Confirming to Paid."
      >
        <div className={styles.float}>
          <div className={styles.payCard}>
            <div className={styles.payHead}>
              <span className={styles.payAvatar}>LS</span>
              <span className={styles.payWho}>
                <b>Lumi Store</b>
                <span>Order LS-1044</span>
              </span>
              <span className={styles.payNet}>
                <i />
                Testnet
              </span>
            </div>
            <div className={styles.payAmount}>
              <b>80.00</b>
              <span>USDC</span>
              <span key={phase} className={pill.className}>
                {pill.label}
              </span>
            </div>

            <div className={styles.stage}>
              {phase === "pending" ? (
                <div key="pending" className={styles.stagePending}>
                  <div className={styles.tabs} role="group" aria-label="Ways to pay (sample)">
                    {TABS.map((t) => (
                      <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => pick(t.id)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {tab === "wallet" ? (
                    <div key="wallet" className={styles.tabPanel}>
                      <button type="button" className={styles.fakeBtn} onClick={samplePay}>
                        Pay with Freighter
                      </button>
                      <button type="button" className={`${styles.fakeBtn} ${styles.fakeBtnAlt}`} onClick={samplePay}>
                        Lobstr
                      </button>
                    </div>
                  ) : tab === "qr" ? (
                    <div key="qr" className={`${styles.tabPanel} ${styles.qrPanel}`}>
                      <svg className={styles.fakeQr} viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} role="img" aria-label="Sample QR code (not scannable)" shapeRendering="crispEdges">
                        {QR_CELLS.map((on, i) => (on ? <rect key={i} x={i % QR_SIZE} y={Math.floor(i / QR_SIZE)} width="1" height="1" /> : null))}
                      </svg>
                      <span className={styles.qrText}>
                        <b>Scan with any Stellar wallet</b>
                        The code carries the address, amount and memo.
                      </span>
                    </div>
                  ) : (
                    <dl key="manual" className={`${styles.tabPanel} ${styles.manual}`}>
                      <div>
                        <dt>Memo · required</dt>
                        <dd>PB7F3KQ2</dd>
                      </div>
                      <div>
                        <dt>Send to</dt>
                        <dd>GDLU…M1ST</dd>
                      </div>
                      <div>
                        <dt>Amount</dt>
                        <dd>80.00 USDC</dd>
                      </div>
                    </dl>
                  )}
                </div>
              ) : phase === "confirming" ? (
                <div key="confirming" className={styles.stageCenter}>
                  <LogoMark size={40} travelling />
                  <span className={styles.stageTitle}>Payment seen</span>
                  <ul className={styles.checks}>
                    {["Right wallet", "Right asset and amount", "Right memo"].map((label) => (
                      <li key={label}>
                        <i>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        </i>
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div key="paid" className={styles.stageCenter}>
                  <CheckBurst size={64} />
                  <span className={styles.stageTitle}>Paid</span>
                  <span className={styles.stageSub}>80.00 USDC received</span>
                  <span className={styles.paidHash}>7a1c…e90b · ledger 1,284,502</span>
                </div>
              )}
            </div>

            <div className={styles.payFoot}>
              {phase === "pending" ? (
                <>
                  <span className="radar" />
                  <span>
                    Expires in <b>{clock(STARTS_AT_SECONDS - second)}</b> · goes straight to the merchant&#39;s wallet
                  </span>
                </>
              ) : phase === "confirming" ? (
                <span>Checking the payment on Stellar Testnet</span>
              ) : (
                <span>Verified on the ledger · marked Paid with the transaction hash</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.bridge} data-phase={phase} aria-hidden="true">
          <svg viewBox="0 0 360 64" fill="none">
            <path className={styles.deck} d="M28 50H332" />
            <path className={styles.arch} d={ARCH} pathLength={1} />
            <circle className={`${styles.pier} ${styles.pierFrom}`} cx="28" cy="50" r="7" />
            <circle className={styles.pierRing} cx="332" cy="50" r="9" />
            <circle className={`${styles.pier} ${styles.pierTo}`} cx="332" cy="50" r="7" />
            <circle className={styles.dotHalo} r="7" />
            <circle className={styles.dot} r="5" />
          </svg>
          <div className={styles.bridgeLabels}>
            <span>Customer&#39;s wallet</span>
            <span>{phase === "paid" ? "Your wallet · Paid" : "Your wallet"}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={styles.demoToggle}
        onClick={() => {
          if (held) {
            setHeld(false);
            setPaused(false);
          } else setPaused((p) => !p);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {paused || held ? <path d="M7 4l13 8-13 8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
        </svg>
        {paused || held ? "Play the demo" : "Pause the demo"}
      </button>
    </div>
  );
}
