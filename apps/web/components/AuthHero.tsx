"use client";

import styles from "@/app/(auth)/auth.module.css";
import { useReducedMotion } from "@/app/(auth)/_ui/useReducedMotion";
import { Logo } from "./Logo";

const POINTS = ["Non-custodial · funds never pass through us", "USDC and XLM on Stellar Testnet today", "Pending → Paid with the transaction hash"];

const at = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** The ink left panel of the sign-up and sign-in screens. */
export function AuthHero() {
  const reduced = useReducedMotion();
  return (
    <section className={styles.hero}>
      {/* Decoration only: two slow blurred shapes and a faint bridge that redraws, kept to the far side. */}
      <div className={styles.decor} aria-hidden="true">
        <span className={`${styles.blob} ${styles.blobA}`} />
        <span className={`${styles.blob} ${styles.blobB}`} />
        <svg className={styles.arch} viewBox="0 0 500 200" fill="none" stroke="currentColor" strokeLinecap="round">
          <path className={styles.archLine} pathLength={1} d="M20 180V150C120 20 380 20 480 150V180" strokeWidth="6" />
          <path className={styles.archLine} pathLength={1} d="M8 180H492" strokeWidth="6" />
          <path className={styles.archLine} pathLength={1} d="M130 180V96M250 180V54M370 180V96" strokeWidth="4" />
          <circle className={styles.archDot} r="7" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className={styles.in} style={at(0)}>
        <Logo on="dark" size={34} fontSize={21} animated={!reduced} style={{ display: "inline-flex" }} />
      </div>
      <div className={styles.heroBody}>
        <h2 className={`${styles.heroTitle} ${styles.in}`} style={at(1)}>
          Stellar payments, straight to your wallet.
        </h2>
        <p className={`${styles.heroText} ${styles.in}`} style={at(2)}>
          Payment links, a pay page and verification on the ledger. You keep the keys and the money, PayBridge does the checking.
        </p>
        <ul className={styles.heroList}>
          {POINTS.map((line, i) => (
            <li key={line} className={styles.in} style={at(3 + i)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className={styles.tick} style={at(3 + i)} d="M5 12l5 5L20 7" />
              </svg>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <span className={`${styles.heroFoot} ${styles.in}`} style={at(6)}>
        Currently in beta on Stellar Testnet. No real money moves.
      </span>
    </section>
  );
}
