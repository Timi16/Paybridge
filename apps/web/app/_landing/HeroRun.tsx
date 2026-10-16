"use client";

import { useEffect, useState } from "react";
import styles from "./landing.module.css";

// A demonstration, not data: names and hashes are illustrative and labelled as such on the page.
const PEOPLE = [
  { name: "Ada Okafor", wallet: "GBQ2…4KXA", amount: "3,200.00" },
  { name: "Kenji Watanabe", wallet: "GDZ7…M2PQ", amount: "2,850.00" },
  { name: "Priya Raman", wallet: "GA4M…77RT", amount: "4,100.00" },
  { name: "Tomás Reyes", wallet: "GCC9…XY01", amount: "1,750.00", noTrust: true },
  { name: "Lena Fischer", wallet: "GBMN…0LKE", amount: "2,400.00" },
];
const HASH = "9f3c…e21a";

/** 0 draft → 1 checked (one excluded) → 2 signing → 3 sending → 4 paid; then it starts over. */
const STAGES = [2200, 1800, 1600, 1600, 3400];

export function HeroRun() {
  const [stage, setStage] = useState(4);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // rests on "paid"
    let s = 0;
    setStage(0);
    let timer = setTimeout(function tick() {
      s = (s + 1) % STAGES.length;
      setStage(s);
      timer = setTimeout(tick, STAGES[s]);
    }, STAGES[0]);
    return () => clearTimeout(timer);
  }, []);

  const status = (p: (typeof PEOPLE)[number]) => {
    if (stage >= 1 && p.noTrust) return "failed";
    if (stage === 3) return "sending";
    if (stage === 4) return "paid";
    return "pending";
  };
  const caption = ["Draft · 5 people", "Checked on Stellar · 1 can't receive", "Waiting for your signature in Freighter", "Sending · 1 transaction", "4 paid · 1 not sent · 1 signature"][stage];

  return (
    <div className={`sheet stub ${styles.demo}`} aria-label="Example payroll run (illustration)" role="img">
      <div className={styles.demoHead}>
        <div>
          <span className="eyebrow">Payroll · Run #0007</span>
          <div className="serif" style={{ fontSize: 26, lineHeight: 1.1, marginTop: 6 }}>
            September contractors
          </div>
        </div>
        <span className={`pill ${stage === 4 ? "pill-danger" : stage >= 2 ? "pill-warn" : "pill-muted"}`}>
          {stage === 4 ? "Partly paid" : stage === 3 ? "Paying" : stage === 2 ? "Signing" : "Draft"}
        </span>
      </div>
      <div className={styles.demoTicks}>
        <div className="ticks">
          {PEOPLE.map((p) => (
            <i key={p.name} className={status(p) === "pending" ? "" : status(p)} />
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {caption}
        </span>
      </div>
      {stage === 2 ? (
        <div className={styles.freighter}>
          <span className="spinner" aria-hidden="true" /> Freighter · approve 4 payments, 12,550.00 USDC
        </div>
      ) : null}
      <ul className={styles.demoRows}>
        {PEOPLE.map((p) => {
          const st = status(p);
          return (
            <li key={p.name}>
              <span className="who">
                <b>{p.name}</b>
                <span>{p.wallet}</span>
              </span>
              <span className="mono tnum">{p.amount}</span>
              <span className={styles.demoStatus}>
                <span
                  key={st}
                  className={`pill ${st === "paid" ? "pill-good" : st === "failed" ? "pill-danger" : st === "sending" ? "pill-warn" : "pill-muted"}`}
                >
                  {st === "paid" ? "✓ Paid" : st === "failed" ? "✕ Not sent" : st === "sending" ? "Sending" : "To pay"}
                </span>
                <span className={st === "failed" ? "why" : "hash"} style={{ fontSize: 11 }}>
                  {st === "paid" ? HASH : st === "failed" ? "No USDC trustline" : " "}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className={styles.demoTotal}>
        <span className="eyebrow">{stage === 4 ? "Paid" : "To send"}</span>
        <span className="money total-rule" style={{ fontSize: 34 }}>
          {stage >= 1 ? "12,550.00" : "14,300.00"}
          <span className="unit">USDC</span>
        </span>
      </div>
    </div>
  );
}
