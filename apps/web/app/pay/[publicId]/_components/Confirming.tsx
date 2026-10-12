import { explorerTx } from "@/lib/config";
import { initials } from "@/lib/format";
import styles from "./checkout.module.css";
import type { SentVia } from "./PayOptions";

const ARCH = "M56 78 C 102 10 198 10 244 78";

/** A payment crossing the bridge from the customer to the business, over and over, while we wait for it to land. */
export function Bridge({ businessName }: { businessName: string }) {
  return (
    <div className={styles.bridge} aria-hidden="true">
      <svg viewBox="0 0 300 104" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* The span: arch, deck, cables. Same shape as the PayBridge mark. */}
        <path className={styles.arch} d={`M56 90V78${ARCH.slice(6)}V90`} stroke="#C7D4FA" strokeWidth="4" />
        <path className={styles.deck} d="M50 90H250" stroke="#C7D4FA" strokeWidth="4" />
        <path className={styles.cable} d="M98 90V41M150 90V28M202 90V41" stroke="#C7D4FA" strokeWidth="3" opacity="0.8" />
        {/* The light running along the arch, and the payment itself. */}
        <path className={styles.flow} d={ARCH} stroke="var(--brand)" strokeWidth="4" />
        <circle className={`${styles.coin} ${styles.coinTrail}`} r="3" fill="var(--brand-on-dark)" />
        <circle className={styles.coin} r="6" fill="var(--brand)" stroke="#fff" strokeWidth="2" />

        <g className={styles.node}>
          <circle cx="30" cy="78" r="22" fill="#fff" stroke="var(--border-input)" strokeWidth="1.5" />
          {/* a wallet */}
          <path d="M21 72h17a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2V73a2 2 0 0 1 2-2h13M35 78.5h2" stroke="var(--ink)" strokeWidth="2" />
        </g>

        <circle className={styles.ringOut} cx="270" cy="78" r="22" stroke="var(--info)" strokeWidth="2" />
        <circle className={`${styles.ringOut} ${styles.ringOut2}`} cx="270" cy="78" r="22" stroke="var(--info)" strokeWidth="2" />
        <g className={`${styles.node} ${styles.nodeFar}`}>
          <g className={styles.catch}>
            <circle cx="270" cy="78" r="22" fill="var(--accent)" />
            <text x="270" y="83" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" stroke="none">
              {initials(businessName)}
            </text>
          </g>
        </g>
      </svg>
      <div className={styles.bridgeEnds}>
        <span>You</span>
        <span>{businessName}</span>
      </div>
    </div>
  );
}

function Tick() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

const FIRST_STEP: Record<SentVia, string> = {
  freighter: "Payment sent",
  manual: "You said you sent it",
  link: "You opened your wallet",
};

interface StepsProps {
  via: SentVia;
  /** Transaction hash, when the customer paid with Freighter. */
  hash: string | null;
  /** PayBridge reported a change to this request (a status event or a fresh read). */
  seen: boolean;
  /** The request is now paid, overpaid or partly paid. */
  verified: boolean;
  /** One line, for under the "Paid" heading. */
  compact?: boolean;
}

/**
 * What is known so far. Each step is ticked by a real signal only: nothing here runs on a timer.
 */
export function Steps({ via, hash, seen, verified, compact = false }: StepsProps) {
  const steps: { label: string; state: "done" | "active" | "todo" }[] = [
    { label: FIRST_STEP[via], state: "done" },
    { label: "Seen on Stellar", state: seen ? "done" : "active" },
    { label: "Verified by PayBridge", state: verified ? "done" : seen ? "active" : "todo" },
  ];
  return (
    <ol className={`${styles.steps} ${compact ? styles.stepsDone : ""}`}>
      {steps.map((step, i) => (
        <li key={step.label} className={styles.step} data-state={step.state} style={{ "--n": compact ? i : 0 } as React.CSSProperties}>
          <span className={styles.stepDot} aria-hidden="true">
            <Tick />
          </span>
          <span>
            {step.label}
            <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "active" ? " (in progress)" : " (not yet)"}</span>
            {i === 0 && hash && !compact && (
              <>
                {" · "}
                <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className={styles.stepLink}>
                  see it
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
