import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { HeroRun } from "./_landing/HeroRun";
import { StickyHeader } from "./_landing/StickyHeader";
import styles from "./_landing/landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "PayBridge · Payroll in USDC on Stellar, signed once" },
  description:
    "Add your team and their Stellar wallets, set this month's amounts, approve one transaction in Freighter. PayBridge pays everyone in USDC and keeps every transaction hash. Non-custodial, on Stellar Testnet.",
};

const STEPS = [
  {
    title: "Add your people",
    text: "Name, Stellar wallet and usual amount, one by one or from a spreadsheet. Group them the way you pay them. PayBridge checks each wallet can actually receive USDC.",
  },
  {
    title: "Draft and review the run",
    text: "Pick groups or people, change this month's amounts, and see the exact total. Before you sign, every wallet and your funding balance are checked again on Stellar.",
  },
  {
    title: "Sign once, track every payment",
    text: "Approve up to 100 payments in one Freighter signature. Each person ends up Paid with the transaction hash, or Not sent with the reason and a way to retry.",
  },
];

const SAFETY: { title: string; text: string }[] = [
  { title: "Your keys never leave Freighter", text: "PayBridge builds the transaction; you sign it. We never see, store or ask for a secret key, and we refuse one if it's pasted." },
  { title: "Checked before you sign", text: "A Stellar transaction is all or nothing, so anyone who can't receive USDC is shown by name and left out before you sign, never silently dropped." },
  { title: "Nobody is paid twice", text: "One open batch per run, a five-minute signature window judged by the ledger's own clock, and a paid line that can never be queued again." },
  { title: "Every payment, on the record", text: "Transaction hash, ledger and time for each person, a full history of the run, and a CSV export for your books." },
];

const FAQ = [
  {
    q: "Does PayBridge hold our money?",
    a: "No. Salaries are paid straight from your own Stellar account to each person's wallet. PayBridge prepares the transaction and records what happened; only your signature in Freighter can move the money.",
  },
  {
    q: "What do employees need?",
    a: "A Stellar wallet with a USDC trustline. If someone doesn't have one yet, PayBridge tells you before you pay and they simply aren't included until it's fixed.",
  },
  {
    q: "What happens if a payment fails?",
    a: "Their line shows Not sent with the reason, for example no USDC trustline. Nothing was sent to them. Once it's fixed, Check again and retry pays just them; nobody already paid is paid again.",
  },
  {
    q: "How many people can we pay at once?",
    a: "Up to 100 in a single signature, and runs of up to 1,000 people in batches of 100, one Freighter approval each.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. PayBridge runs on Stellar Testnet only: free test USDC and XLM, so you can try the whole flow safely.",
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <StickyHeader>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <Logo href="/" />
          <nav className={styles.nav} aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#safety">Safety</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className={styles.headerEnd}>
            <span className="tag-testnet">Stellar Testnet</span>
            <Link href="/login" className="btn btn-secondary btn-sm">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-dark btn-sm">
              Get started
            </Link>
          </div>
        </div>
      </StickyHeader>

      <main>
        <section className={`${styles.wrap} ${styles.hero}`}>
          <div className="stagger">
            <span className="eyebrow">Payroll in USDC · on Stellar</span>
            <h1 className={styles.heroTitle}>
              Pay everyone.
              <br />
              <em>Sign once.</em>
            </h1>
            <p className={styles.heroSub}>
              Add your team and their Stellar wallets, set this month&apos;s amounts, and approve one transaction in Freighter. PayBridge sends USDC to everyone and keeps every
              transaction hash.
            </p>
            <div className={styles.heroCtas}>
              <Link href="/signup" className="btn btn-primary btn-lg">
                Start your first payroll
              </Link>
              <a href="#how" className="btn btn-secondary btn-lg">
                How it works
              </a>
            </div>
            <ul className={styles.trust}>
              <li>Non-custodial</li>
              <li>Up to 100 people per signature</li>
              <li>Hash for every payment</li>
              <li>Free on Testnet</li>
            </ul>
          </div>
          <div>
            <HeroRun />
            <p className="faint" style={{ fontSize: 12, marginTop: 12, textAlign: "center" }}>
              Illustration. Names, amounts and hashes are examples.
            </p>
          </div>
        </section>

        <section id="how" className={styles.band}>
          <div className={styles.wrap}>
            <span className="eyebrow">How it works</span>
            <h2 className={styles.sectionTitle}>
              From spreadsheet to <em>paid</em>, in three steps.
            </h2>
            <ol className={styles.steps}>
              {STEPS.map((s, i) => (
                <li key={s.title} className={styles.step}>
                  <span className={styles.stepNum}>0{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="safety" className={`${styles.band} ${styles.bandDark}`}>
          <div className={styles.wrap}>
            <span className={`eyebrow ${styles.eyebrowDark}`}>Safety</span>
            <h2 className={styles.sectionTitle}>
              Built so money moves <em>exactly once</em>.
            </h2>
            <div className={styles.safety}>
              {SAFETY.map((s) => (
                <div key={s.title}>
                  <h3>
                    <Icon name="shield" size={18} />
                    {s.title}
                  </h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className={styles.band}>
          <div className={styles.wrap}>
            <span className="eyebrow">Questions</span>
            <h2 className={styles.sectionTitle}>Good to know.</h2>
            <div className={styles.faq}>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.band}>
          <div className={`${styles.wrap} ${styles.cta}`}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
              Run this month&apos;s payroll <em>on Stellar</em>.
            </h2>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Create a free account
            </Link>
          </div>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <span>PayBridge · Stellar Testnet only, no real money moves.</span>
        <span>
          <Link href="/login">Log in</Link> · <Link href="/signup">Sign up</Link>
        </span>
      </footer>
    </div>
  );
}
