import type { Metadata } from "next";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { Reveal } from "@/components/motion/Reveal";
import { HeroDemo } from "./_landing/HeroDemo";
import { InView } from "./_landing/InView";
import { StickyHeader } from "./_landing/StickyHeader";
import styles from "./_landing/landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "PayBridge — get paid in USDC on Stellar with a link" },
  description:
    "Create a payment request and send your customer a link. They pay from any Stellar wallet, the money lands in your wallet, and PayBridge verifies it on the network and marks it Paid. Non-custodial. Free on Stellar Testnet.",
};

const ICONS = {
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6h-3",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4",
  check: "M5 12l5 5L20 7",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
} as const;

function Glyph({ d, size = 20, strokeWidth = 2, pathLength }: { d: string; size?: number; strokeWidth?: number; pathLength?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} pathLength={pathLength} />
    </svg>
  );
}

const TRUST = ["No custody, no float", "USDC and XLM", "Verified on the ledger", "Free on Testnet"];

const STEPS = [
  {
    title: "Create a request",
    text: "Amount, asset and the wallet that should receive it. You get a unique link and memo to send on WhatsApp, email or anywhere.",
  },
  {
    title: "Customer pays from any wallet",
    text: "Freighter, Lobstr or any Stellar wallet with a QR code. The payment goes directly to your settlement wallet on Stellar.",
  },
  {
    title: "We verify, you see Paid",
    text: "PayBridge watches Stellar Testnet, checks wallet, asset, amount and memo, and flips the request from Pending to Paid with the transaction hash.",
  },
];

const FEATURES: { icon: keyof typeof ICONS; title: string; text: string }[] = [
  {
    icon: "qr",
    title: "A pay page that just works",
    text: "Branded, on mobile and desktop. Wallet buttons, QR, or copy-paste the address and memo. Nothing to build.",
  },
  {
    icon: "shield",
    title: "Non-custodial by design",
    text: "Funds settle straight to your wallet. No balances to withdraw, no float sitting with us, nothing to freeze.",
  },
  {
    icon: "check",
    title: "Verified, not trusted",
    text: "We read the payment from Horizon ourselves: right wallet, right asset, right amount, right memo. Then we show you the hash.",
  },
  {
    icon: "bolt",
    title: "Memo matching done right",
    text: "Each checkout gets a unique memo. Underpaid, overpaid, wrong asset, late: every edge case gets a state and an event.",
  },
  {
    icon: "link",
    title: "Share the link anywhere",
    text: "WhatsApp, Instagram DMs, an invoice email, a QR on the counter. A request is just a link.",
  },
  {
    icon: "globe",
    title: "A receipt for every payment",
    text: "Each paid request keeps its transaction hash and a link to view it on Stellar. Email the customer a receipt in one click.",
  },
];

const DASH_ROWS: { what: string; who: string; amount: string; status: string; tone: "tagGood" | "tagInfo" | "tagWarn" | "tagMuted"; tx: string }[] = [
  { what: "Order LS-1047", who: "ada@example.com", amount: "80.00 USDC", status: "Pending", tone: "tagInfo", tx: "—" },
  { what: "Order LS-1046", who: "tunde@example.com", amount: "120.00 USDC", status: "Paid", tone: "tagGood", tx: "7a1c…e90b" },
  { what: "Order LS-1045", who: "zainab@example.com", amount: "40.00 USDC", status: "Underpaid", tone: "tagWarn", tx: "—" },
  { what: "Order LS-1044", who: "kemi@example.com", amount: "25.00 XLM", status: "Paid", tone: "tagGood", tx: "c41d…08af" },
  { what: "Order LS-1043", who: "—", amount: "60.00 USDC", status: "Expired", tone: "tagMuted", tx: "—" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does PayBridge hold my money?",
    a: "No. The customer pays straight into your own Stellar wallet. PayBridge only reads the network to confirm the payment, and never asks for a secret key.",
  },
  {
    q: "Which wallets can my customer pay from?",
    a: "Any Stellar wallet. Freighter in the browser, Lobstr or another mobile wallet by scanning the QR code, or by copying the address, amount and memo by hand.",
  },
  {
    q: "What if the customer sends the wrong amount?",
    a: "If it is short, the request shows Underpaid and the link stays open for the rest until it expires, or you can accept what arrived. If it is more, the request is marked Paid and you see the extra to send back.",
  },
  {
    q: "How quickly does a request turn Paid?",
    a: "Usually a few seconds after Stellar confirms the payment. The pay page and your dashboard both update by themselves, nobody has to refresh.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. PayBridge runs on Stellar Testnet, so you can try the whole flow with free test funds from Friendbot.",
  },
  {
    q: "What do I need to start?",
    a: "An email address and the public address of the Stellar wallet you want to be paid into. Setup takes about a minute.",
  },
];

const CAUGHT: { label: string; tone: "tagWarn" | "tagBad" | "tagInfo"; text: string }[] = [
  { label: "Underpaid", tone: "tagWarn", text: "35.00 of 40.00 arrived. The link stays open for the rest." },
  { label: "Wrong asset", tone: "tagBad", text: "XLM sent to a USDC request. Flagged, never counted." },
  { label: "Late", tone: "tagInfo", text: "Arrived after the link expired. You decide whether to accept it." },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <StickyHeader>
        <div className={`${styles.wrap} ${styles.headerRow}`}>
          <span className={styles.brand}>
            <Logo size={34} fontSize={21} animated />
          </span>
          <div className={styles.headerActions}>
            <Link href="/login" className={`btn ${styles.signIn}`}>
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary">
              Get started
            </Link>
          </div>
        </div>
      </StickyHeader>

      <main>
        <section className={`${styles.wrap} ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className={styles.badge}>
              <Glyph d={ICONS.bolt} size={14} strokeWidth={2.4} />
              Now in beta on Stellar Testnet
            </span>
            <h1 className={styles.h1}>
              <span className={styles.h1Line}>Get paid in USDC</span> <span className={styles.h1Line}>on Stellar</span>{" "}
              <span className={styles.h1Line}>
                with <span className={styles.mark}>a link.</span>
              </span>
            </h1>
            <p className={styles.lede}>
              Create a payment request, send the customer a link. They pay from any Stellar wallet, the money lands in <strong>your</strong> wallet,
              and PayBridge verifies it on the network and marks it Paid with the transaction hash. We never touch the funds.
            </p>
            <div className={styles.heroActions}>
              <Link href="/signup" className={`btn btn-primary ${styles.cta}`}>
                Start on Testnet
              </Link>
              <a href="#pay-page" className={`btn btn-secondary ${styles.cta}`}>
                <Glyph d={ICONS.qr} size={18} />
                See a live checkout
              </a>
            </div>
            <ul className={styles.trust}>
              {TRUST.map((item) => (
                <li key={item}>
                  <Glyph d={ICONS.check} size={14} strokeWidth={2.8} pathLength={1} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <HeroDemo />
        </section>

        <section id="how-it-works" className={`${styles.wrap} ${styles.how} ${styles.anchor}`} aria-labelledby="how-title">
          <h2 id="how-title" className={styles.eyebrow}>
            How it works
          </h2>
          <InView className={styles.stepsWrap}>
            <span className={styles.stepsLine} aria-hidden="true">
              <span className={styles.stepsRunner} />
            </span>
            <ol className={styles.steps}>
              {STEPS.map((step, i) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepText}>{step.text}</p>
                </li>
              ))}
            </ol>
          </InView>
        </section>

        <section aria-label="What you get">
          <ul className={`${styles.wrap} ${styles.features}`}>
            {FEATURES.map((feature, i) => (
              <Reveal as="li" key={feature.title} delay={(i % 3) * 90}>
                <div className={`card lift ${styles.feature}`}>
                  <span className={styles.featureIcon}>
                    <Glyph d={ICONS[feature.icon]} />
                  </span>
                  <h3 className={styles.featureTitle}>{feature.title}</h3>
                  <p className={styles.featureText}>{feature.text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className={`${styles.wrap} ${styles.sec}`} aria-labelledby="dash-title">
          <Reveal className={styles.secHead}>
            <span className={styles.eyebrow}>Your dashboard</span>
            <h2 id="dash-title" className={styles.h2}>
              Every request on one screen.
            </h2>
            <p className={styles.secText}>Create a request, share the link, and watch its status change as the customer pays. No spreadsheet, no asking &quot;have you sent it?&quot;.</p>
          </Reveal>
          <InView className={styles.dashWrap}>
            <div
              className={styles.dash}
              role="img"
              aria-label="Illustration: a sample PayBridge dashboard. Paid today 120.00 USDC, 5 requests today, 1 pending. A table of five sample requests with statuses Pending, Paid, Underpaid, Paid and Expired."
            >
              <div className={styles.dashBar} aria-hidden="true">
                <i />
                <i />
                <i />
                <span>Requests</span>
              </div>
              <div className={styles.dashTiles} aria-hidden="true">
                <div>
                  <span>Paid today</span>
                  <b>
                    120.00 <em>USDC</em>
                  </b>
                </div>
                <div>
                  <span>Requests today</span>
                  <b>5</b>
                </div>
                <div>
                  <span>Pending</span>
                  <b>1</b>
                </div>
              </div>
              <div className={styles.dashTable} aria-hidden="true">
                <div className={`${styles.dashRow} ${styles.dashHeadRow}`}>
                  <span>For</span>
                  <span className={styles.colWide}>Customer</span>
                  <span className={styles.colNum}>Amount</span>
                  <span>Status</span>
                  <span className={`${styles.colWide} ${styles.colNum}`}>Transaction</span>
                </div>
                {DASH_ROWS.map((r, i) => (
                  <div key={r.what} className={styles.dashRow} style={{ "--i": i } as React.CSSProperties}>
                    <b>{r.what}</b>
                    <span className={styles.colWide}>{r.who}</span>
                    <span className={`${styles.colNum} ${styles.mono}`}>{r.amount}</span>
                    <span>
                      <span className={`${styles.tag} ${styles[r.tone]}`}>
                        {r.status === "Pending" && <i className={styles.miniRadar} />}
                        {r.status}
                      </span>
                    </span>
                    <span className={`${styles.colWide} ${styles.colNum} ${styles.mono} ${r.tx === "—" ? "" : styles.txLink}`}>{r.tx}</span>
                  </div>
                ))}
              </div>
            </div>
          </InView>
        </section>

        <section className={`${styles.wrap} ${styles.statusOuter}`} aria-labelledby="status-title">
          <div className={styles.live}>
            <Reveal className={styles.liveCopy} from="left">
              <span className={styles.eyebrow}>Live status</span>
              <h2 id="status-title" className={styles.h2}>
                Paid means the ledger says so.
              </h2>
              <p className={styles.liveText}>
                No more chasing screenshots. PayBridge reads each payment from Stellar itself and only marks a request Paid when the right
                amount reached the right wallet with the right memo.
              </p>
              <ul className={styles.caught} aria-label="Payments that are flagged, not lost">
                {CAUGHT.map((c) => (
                  <li key={c.label}>
                    <span className={`${styles.tag} ${styles[c.tone]}`}>{c.label}</span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                Create a request
              </Link>
            </Reveal>
            <InView className={styles.liveArt}>
              <div
                className={styles.ticket}
                role="img"
                aria-label="Illustration: a sample request for 80.00 USDC, order LS-1044. Request created with memo PB7F3KQ2. Payment found on Stellar from GCFX…2HQA in ledger 1,284,502: wallet, asset, amount and memo all correct. Marked Paid with transaction 7a1c…e90b."
              >
                <div className={styles.ticketHead} aria-hidden="true">
                  <span className={styles.ticketWho}>
                    <span>Order LS-1044</span>
                    <b>
                      80.00 <i>USDC</i>
                    </b>
                  </span>
                  <span className={styles.pillSwap}>
                    <span className={`${styles.tag} ${styles.tagInfo} ${styles.pillWas}`}>
                      <i className={styles.miniRadar} />
                      Pending
                    </span>
                    <span className={`${styles.tag} ${styles.tagGood} ${styles.pillNow}`}>
                      <Glyph d={ICONS.check} size={12} strokeWidth={3.2} />
                      Paid
                    </span>
                  </span>
                </div>
                <ol className={styles.events} aria-hidden="true">
                  <li className={styles.event}>
                    <span className={styles.eventDot}>
                      <Glyph d={ICONS.check} size={11} strokeWidth={3.4} />
                    </span>
                    <div className={styles.eventBody}>
                      <b>Request created</b>
                      <span>Link and memo PB7F3KQ2 generated</span>
                    </div>
                    <time>12:04:10</time>
                  </li>
                  <li className={styles.event}>
                    <span className={styles.eventDot}>
                      <Glyph d={ICONS.check} size={11} strokeWidth={3.4} />
                    </span>
                    <div className={styles.eventBody}>
                      <b>Payment found on Stellar</b>
                      <span>80.00 USDC from GCFX…2HQA · ledger 1,284,502</span>
                      <span className={styles.chips}>
                        {["wallet", "asset", "amount", "memo"].map((c, i) => (
                          <span key={c} className={styles.chip} style={{ "--i": i } as React.CSSProperties}>
                            <Glyph d={ICONS.check} size={10} strokeWidth={3.4} />
                            {c}
                          </span>
                        ))}
                      </span>
                    </div>
                    <time>12:04:41</time>
                  </li>
                  <li className={styles.event}>
                    <span className={styles.eventDot}>
                      <Glyph d={ICONS.check} size={11} strokeWidth={3.4} />
                    </span>
                    <div className={styles.eventBody}>
                      <b>Marked Paid</b>
                      <span className={styles.hash}>
                        <span className={styles.hashText}>tx 7a1c…e90b</span>
                        <i className={styles.caret} />
                      </span>
                    </div>
                    <time>12:04:42</time>
                  </li>
                </ol>
              </div>
            </InView>
          </div>
        </section>
        <section className={`${styles.wrap} ${styles.sec}`} aria-labelledby="faq-title">
          <Reveal className={styles.secHead}>
            <span className={styles.eyebrow}>Questions</span>
            <h2 id="faq-title" className={styles.h2}>
              Good to know before you start.
            </h2>
          </Reveal>
          <div className={styles.faq}>
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 60}>
                <details className={styles.faqItem}>
                  <summary>
                    {item.q}
                    <span className={styles.faqPlus} aria-hidden="true" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.closeOuter}`} aria-labelledby="close-title">
          <Reveal from="scale">
            <div className={styles.close}>
              <span className={styles.closeArch} aria-hidden="true">
                <svg viewBox="0 0 600 200" fill="none" preserveAspectRatio="none">
                  <path d="M0 200C120 30 480 30 600 200" stroke="currentColor" strokeWidth="2" />
                  <path d="M90 200C190 90 410 90 510 200" stroke="currentColor" strokeWidth="2" opacity="0.6" />
                </svg>
              </span>
              <h2 id="close-title" className={styles.closeTitle}>
                Send your first payment link today.
              </h2>
              <p className={styles.closeText}>Add your wallet, create a request, and see it turn Paid. It takes about a minute.</p>
              <div className={styles.closeActions}>
                <Link href="/signup" className={`btn ${styles.btnWhite}`}>
                  Get started
                </Link>
                <Link href="/login" className={`btn ${styles.btnGhost}`}>
                  Sign in
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerRow}`}>
          <span className={styles.footerBrand}>
            <LogoMark size={22} />
            <strong>PayBridge</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
