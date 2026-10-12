"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Dialog } from "@/components/Dialog";
import { LogoMark } from "@/components/Logo";
import { CheckBurst } from "@/components/motion/CheckBurst";
import { CountUpAmount } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { useNewRequest } from "@/components/NewRequest";
import { OutcomePill, Pill, RequestPill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { api, ApiError, errorMessage } from "@/lib/api";
import { explorerAccount, explorerTx } from "@/lib/config";
import { countdown, formatAmount, isPositive, shortAddress, shortHash } from "@/lib/format";
import { useNow, usePollWhenOffline } from "@/lib/live";
import { useWallets } from "@/lib/session";
import { displayStatus, REQUEST_STATUS, type DisplayKey } from "@/lib/status";
import type { ChainPayment, PaymentRequest, RequestDetail } from "@/lib/types";
import { RefundDialog } from "../_components/RefundDialog";
import { buildTimeline, Timeline } from "../_components/Timeline";
import { useNetworkFee } from "../_components/useNetworkFee";
import { clock, CopyMorph, copyText, dayAt, forLabel, fromStroops, Glyph, groupInt, isPreReset, money, sameAsset, span, splitRefunds, whatsappUrl, type RefundLine } from "../_components/shared";
import styles from "../_components/requests.module.css";

type RefundTarget = { kind: "payment"; payment: ChainPayment } | { kind: "request"; line: RefundLine };
type DialogName = "accept" | "cancel" | "receipt" | "resend";

const touches = (k: unknown) => typeof k === "string" && (k.startsWith("/v1/payment-requests") || k.startsWith("/v1/payments") || k.startsWith("/v1/summary"));

/** "today 10:24", "yesterday 18:02", "12 Oct 10:24". */
const when = (iso: string, now: number) => dayAt(iso, now).replace(" at ", " ");

const BANNER: Record<DisplayKey, string | undefined> = {
  pending: styles.bannerPending,
  underpaid: styles.bannerUnderpaid,
  failed: styles.bannerFailed,
  expired: styles.bannerMuted,
  cancelled: styles.bannerMuted,
  reset: styles.bannerMuted,
  paid: styles.bannerPaid,
  refunded: styles.bannerRefunded,
};

function Back() {
  return (
    <Link href="/requests" className={styles.back}>
      <Glyph name="chevronLeft" size={14} strokeWidth={2.6} />
      Requests
    </Link>
  );
}

/** The time left on the link, ticking every second. */
function Countdown({ iso }: { iso: string }) {
  const now = useNow(1000);
  return (
    <span className="mono tnum" style={{ fontWeight: 600 }}>
      {countdown(iso, now)}
    </span>
  );
}

/** "Expires in 12:41." Past the time, the request is only closed once a ledger confirms it, so say that. */
function ExpiresIn({ iso }: { iso: string }) {
  const now = useNow(1000);
  if (new Date(iso).getTime() <= now) return <>Its time is up; it closes as soon as the next ledger confirms that.</>;
  return (
    <>
      Expires in{" "}
      <span className="mono tnum" style={{ fontWeight: 600 }}>
        {countdown(iso, now)}
      </span>
      .
    </>
  );
}

/** A thin bar along the bottom of the banner that empties as the link runs out of time. */
function Drain({ from, to }: { from: string; to: string }) {
  const now = useNow(1000);
  const end = new Date(to).getTime();
  const total = end - new Date(from).getTime();
  const share = total > 0 ? Math.min(1, Math.max(0, (end - now) / total)) : 0;
  return (
    <span className={styles.drain} role="progressbar" aria-label="Time left before the request expires" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
      <span className={styles.drainFill} style={{ transform: `scaleX(${share})` }} />
    </span>
  );
}

/** Why a payment that was not applied has to go back, in one clause. */
function refundReason(p: ChainPayment, request: PaymentRequest): string {
  switch (p.outcome) {
    case "WRONG_ASSET":
      return `sent instead of ${request.asset.code}, so it isn't counted`;
    case "DUPLICATE":
      return "arrived after this request was already paid";
    case "LATE":
      return "arrived after the request expired";
    case "AFTER_CANCEL":
      return "arrived after this request was cancelled";
    case "AFTER_RESET":
      return "arrived after a testnet reset closed this request";
    default:
      return "wasn't applied to this request";
  }
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const refreshInterval = usePollWhenOffline();
  const { data, error, isLoading, mutate: reload } = useSWR<RequestDetail>(`/v1/payment-requests/${encodeURIComponent(id)}`, { refreshInterval });

  // Becoming Paid while this page is open is celebrated once. Opening an already-paid request is not.
  const key = data ? displayStatus(data.request).key : null;
  const before = useRef<DisplayKey | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (key === null) return;
    // With reduced motion the banner simply changes; the burst's drawn tick would never draw.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (before.current !== null && before.current !== "paid" && key === "paid" && !still) setCelebrate(true);
    before.current = key;
  }, [key]);

  if (data) return <Detail data={data} celebrate={celebrate} reload={async () => void (await reload())} />;

  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
    return (
      <>
        <Back />
        <div className="card empty anim-scale-in" style={{ padding: "56px 24px" }}>
          <LogoMark size={44} fill="var(--slate-soft)" />
          <strong style={{ fontSize: 17, marginTop: 6 }}>We couldn&apos;t find that request</strong>
          <span>The link may be wrong, or the request belongs to another account.</span>
          <Link href="/requests" className="btn btn-primary" style={{ marginTop: 8 }}>
            Back to requests
          </Link>
        </div>
      </>
    );
  }
  if (error && !isLoading) {
    return (
      <>
        <Back />
        <div className="card empty" role="alert" style={{ padding: "56px 24px" }}>
          <strong style={{ fontSize: 17 }}>We couldn&apos;t load this request</strong>
          <span>{errorMessage(error)}</span>
          <button type="button" className="btn btn-secondary" onClick={() => reload()} style={{ marginTop: 8 }}>
            Try again
          </button>
        </div>
      </>
    );
  }
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="sr-only">Loading request</span>
      <div className="skeleton" style={{ width: 90, height: 16 }} />
      <div className="skeleton" style={{ width: 280, maxWidth: "100%", height: 42 }} />
      <div className="skeleton" style={{ width: 420, maxWidth: "100%", height: 16 }} />
      <div className="skeleton" style={{ height: 52, borderRadius: 12 }} />
      <div className={styles.grid}>
        <div className="skeleton" style={{ height: 340, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 340, borderRadius: 14 }} />
      </div>
    </div>
  );
}

function Detail({ data, celebrate, reload }: { data: RequestDetail; celebrate: boolean; reload: () => Promise<void> }) {
  const { request, payments, events, customer } = data;
  const wallets = useWallets();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const newRequest = useNewRequest();
  const now = useNow();

  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refund, setRefund] = useState<RefundTarget | null>(null);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [checking, setChecking] = useState<"idle" | "busy" | "done">("idle");
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
  }, []);

  const code = request.asset.code;
  const status = request.status;
  const shown = displayStatus(request);
  const label = forLabel(request);
  const link = request.checkoutUrl;
  const base = `/v1/payment-requests/${encodeURIComponent(request.id)}`;

  const asked = BigInt(request.amountStroops);
  const received = BigInt(request.amountReceivedStroops);
  const open = status === "PENDING" || status === "UNDERPAID";

  // Payments set aside because they arrived after the request closed: "Accept as paid" counts them.
  const setAsideOutcome = status === "EXPIRED" ? "LATE" : status === "CANCELLED" ? "AFTER_CANCEL" : null;
  const setAside = setAsideOutcome ? payments.filter((p) => p.outcome === setAsideOutcome && !isPreReset(p)) : [];
  const canAcceptLate = setAside.length > 0 && setAside.every((p) => p.refundedAt === null) && !request.refundedAt;
  const setAsideStroops = setAside.filter((p) => sameAsset(p.asset, request.asset)).reduce((sum, p) => sum + BigInt(p.amountStroops), 0n);
  const canAccept = (status === "UNDERPAID" && !request.refundedAt) || canAcceptLate;
  const acceptStroops = status === "UNDERPAID" ? received : received + setAsideStroops;
  const acceptAmount = fromStroops(acceptStroops);
  const remainingAfterAccept = asked > acceptStroops ? asked - acceptStroops : 0n;
  const extraAfterAccept = acceptStroops > asked ? acceptStroops - asked : 0n;

  const refunds = splitRefunds(request, payments);
  const accepted = events.some((e) => e.reason === "accepted");
  const counted = payments.filter((p) => p.outcome === "COUNTED");
  const matchedByMemo = counted.length > 0 && counted.every((p) => !p.assignedManually && (p.matchedBy === null || p.matchedBy === "memo"));
  const senders = [...new Set(counted.map((p) => p.from))];
  const sender = senders.length === 1 && senders[0] ? senders[0] : null;
  // The wrong-asset payment the "Wrong asset" state is about: the latest one not yet sent back.
  const wrong = payments.filter((p) => (p.outcome === "WRONG_ASSET" || p.outcome === "WRONG_ISSUER") && !isPreReset(p) && p.refundedAt === null).at(-1);
  const wrongDue = request.refundDue.find((l) => !sameAsset(l.asset, request.asset));

  // The transaction this page is about: the one that paid, else the latest one counted, else the wrong-asset one.
  const paying = (request.paidTxHash ? payments.find((p) => p.txHash === request.paidTxHash) : undefined) ?? counted.at(-1) ?? (shown.key === "failed" ? wrong : undefined);
  const txHash = paying?.txHash ?? request.paidTxHash;
  const fee = useNetworkFee(txHash ?? null);

  const wallet = wallets.data?.data.find((w) => w.id === request.walletId);
  const steps = buildTimeline(request, payments, events);
  const lifetime = span(new Date(request.expiresAt).getTime() - new Date(request.createdAt).getTime());
  const showPayments = payments.length > 1 || payments.some((p) => p.outcome !== "COUNTED");

  const shareText =
    status === "UNDERPAID"
      ? `${money(request.amountRemaining, code)} is still due for ${label}. Pay the rest here: ${link}`
      : status === "PAID" || status === "OVERPAID"
        ? `Your receipt for ${label} (${money(request.amount, code)}): ${link}`
        : `Payment link for ${label} (${money(request.amount, code)}): ${link}`;

  const closeDialog = () => {
    setDialog(null);
    setActionError(null);
  };

  const run = async (path: string, done: string) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post<{ request: PaymentRequest }>(path);
      await mutate(touches);
      setDialog(null);
      toast(done);
    } catch (err) {
      setActionError(errorMessage(err));
      // The request moved on while the dialog was open: show where it stands now.
      if (err instanceof ApiError && err.code === "INVALID_TRANSITION") void mutate(touches);
    } finally {
      setBusy(false);
    }
  };

  const sendReceipt = async () => {
    if (busy) return;
    const email = receiptEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setActionError("Enter the email address the receipt should go to.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const { sentTo } = await api.post<{ sentTo: string }>(`${base}/receipt`, { email });
      // The first receipt saves the address on the request.
      await mutate(touches);
      setDialog(null);
      toast(`Receipt emailed to ${sentTo}`);
    } catch (err) {
      // 503 means email is not set up on the server: its own message says so.
      setActionError(err instanceof ApiError ? (err.field("email") ?? errorMessage(err)) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const recordRefund = async (hash: string | undefined) => {
    if (!refund) return;
    const body = hash ? { txHash: hash } : {};
    if (refund.kind === "payment") await api.post(`/v1/payments/${encodeURIComponent(refund.payment.eventId)}/refunded`, body);
    else await api.post(`${base}/refunded`, body);
    await mutate(touches);
    setRefund(null);
    toast("Refund recorded");
  };

  const checkNow = async () => {
    if (checking === "busy") return;
    setChecking("busy");
    // Held for a beat so the answer is seen even when the API replies instantly.
    await Promise.all([reload().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 700))]);
    setChecking("done");
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => setChecking("idle"), 2600);
  };

  const resend = async () => {
    await copyText(link);
    setDialog("resend");
  };

  const recreate = () =>
    newRequest({
      amount: request.amount,
      asset: code === "XLM" ? "XLM" : "USDC",
      description: request.description ?? undefined,
      customerEmail: request.customerEmail ?? undefined,
    });

  /* ───── Header actions, by where the request stands ───── */

  const acceptButton = canAccept ? (
    <button type="button" className="btn btn-primary" onClick={() => setDialog("accept")}>
      Accept as paid
    </button>
  ) : null;
  const recreateButton = (
    <button type="button" className={`btn ${canAccept ? "btn-secondary" : "btn-primary"}`} onClick={recreate}>
      <Glyph name="refresh" />
      Create a new request
    </button>
  );
  const resendButton = (text: string) => (
    <button type="button" className="btn btn-secondary" style={{ padding: "0 18px" }} onClick={resend}>
      <Glyph name="link" />
      {text}
    </button>
  );

  let actions: React.ReactNode;
  if (status === "PENDING") {
    actions = (
      <>
        {shown.key === "failed" ? resendButton("Resend link") : <CopyMorph value={link} label="Copy payment link" copiedLabel="Link copied" icon="link" size="lg" />}
        <button type="button" className="btn btn-secondary" style={{ padding: "0 18px" }} onClick={checkNow} disabled={checking === "busy"} aria-live="polite">
          {checking === "done" ? (
            <svg key="done" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className={styles.tick} d="M5 12l5 5L20 7" />
            </svg>
          ) : (
            <Glyph key="idle" name="refresh" className={checking === "busy" ? styles.spinning : undefined} />
          )}
          {checking === "busy" ? "Checking…" : checking === "done" ? "Up to date" : "Check now"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ padding: "0 18px", color: "var(--error)" }} onClick={() => setDialog("cancel")}>
          Cancel
        </button>
      </>
    );
  } else if (status === "UNDERPAID") {
    actions = (
      <>
        {resendButton("Resend link for the rest")}
        {acceptButton}
      </>
    );
  } else if (status === "PAID" || status === "OVERPAID") {
    actions = (
      <>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: "0 18px" }}
          onClick={() => {
            setReceiptEmail(request.customerEmail ?? "");
            setDialog("receipt");
          }}
        >
          <Glyph name="mail" />
          Email receipt
        </button>
        {request.paidTxHash ? (
          <a href={explorerTx(request.paidTxHash)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Glyph name="external" size={15} strokeWidth={2.4} />
            View on Stellar Expert
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
      </>
    );
  } else {
    // Expired, cancelled or closed by a reset: the link is dead, so the way forward is a new request.
    actions = (
      <>
        {recreateButton}
        {acceptButton}
      </>
    );
  }

  /* ───── The banner: what is true right now, in one or two sentences ───── */

  const lateNote = (closedHow: string) =>
    setAsideStroops > 0n
      ? `${money(fromStroops(setAsideStroops), code)} arrived after ${closedHow}. It is recorded but not counted: accept it as paid, or send it back from your wallet and mark it refunded below.`
      : `A payment arrived after ${closedHow}. It is recorded but not counted: accept it as paid, or send it back from your wallet and mark it refunded below.`;

  let lead: React.ReactNode;
  let message: React.ReactNode;
  switch (shown.key) {
    case "pending":
      lead = (
        <span className={styles.bannerLead} aria-hidden="true">
          <span className="radar" />
          <LogoMark size={28} travelling />
        </span>
      );
      message = (
        <>
          <strong>Watching Stellar Testnet</strong> for a payment of {money(request.amount, code)} to <span className="mono">{shortAddress(request.wallet)}</span> with memo <span className="mono">{request.memo}</span>. <ExpiresIn iso={request.expiresAt} /> This page updates by itself.
        </>
      );
      break;
    case "underpaid":
      lead = <Glyph name="warning" size={18} strokeWidth={2.2} className={styles.bannerIcon} />;
      message = (
        <>
          <strong>
            Customer sent {formatAmount(request.amountReceived)} {code} of {formatAmount(request.amount)}.
          </strong>{" "}
          {matchedByMemo ? "Right wallet, right asset, right memo, wrong amount." : "Right wallet, right asset, wrong amount."} The request stays open for the remaining {formatAmount(request.amountRemaining)} until it expires, or you can accept it as paid.
        </>
      );
      break;
    case "failed": {
      const sent = wrong ? money(wrong.amount, wrong.asset.code) : wrongDue ? money(wrongDue.amount, wrongDue.asset.code) : null;
      const sentCode = wrong?.asset.code ?? wrongDue?.asset.code ?? "other asset";
      lead = <Glyph name="warning" size={18} strokeWidth={2.2} className={styles.bannerIcon} />;
      message = (
        <>
          <strong>Wrong asset.</strong>{" "}
          {wrong?.outcome === "WRONG_ISSUER"
            ? `${sent} from a different issuer arrived with this memo. It only shares its name with the ${code} you asked for.`
            : `${sent ?? "A payment"} arrived with this memo but the request asked for ${code}.`}{" "}
          It is not counted. The {sentCode} is in your wallet; refund it from there if you want.{" "}
          {status === "PENDING" ? (
            <>
              Still watching for {money(request.amount, code)}. <ExpiresIn iso={request.expiresAt} />
            </>
          ) : (
            "The request has since expired."
          )}
        </>
      );
      break;
    }
    case "expired":
      lead = <Glyph name="clock" size={18} strokeWidth={2.2} className={styles.bannerIcon} />;
      message = (
        <>
          {received > 0n ? `Only ${formatAmount(request.amountReceived)} of ${money(request.amount, code)} arrived in ${lifetime}, so the request expired.` : `Nothing arrived in ${lifetime}.`}{" "}
          {canAcceptLate ? lateNote("it expired") : "If a payment with this memo shows up later it is still matched here and shown as late. You can then accept it or send it back."}
        </>
      );
      break;
    case "cancelled":
      lead = <Glyph name="cross" size={18} strokeWidth={2.4} className={styles.bannerIcon} />;
      message = (
        <>
          <strong>Cancelled{request.cancelledAt ? ` ${when(request.cancelledAt, now)}` : ""}.</strong> The payment link no longer accepts payments.{" "}
          {canAcceptLate ? lateNote("it was cancelled") : "If a payment with this memo still shows up it is matched here, and you can accept it or send it back."}
        </>
      );
      break;
    case "reset":
      lead = <Glyph name="dash" size={18} strokeWidth={2.4} className={styles.bannerIcon} />;
      message = (
        <>
          <strong>Closed by a Stellar Testnet reset.</strong> Testnet was wiped and restarted, so this request can no longer be paid and payments from before the reset no longer exist on the network. Create a new request if you still need this payment.
        </>
      );
      break;
    case "refunded":
      lead = <Glyph name="check" size={18} strokeWidth={2.6} className={styles.bannerIcon} />;
      message = (
        <>
          <strong>Refunded.</strong> You recorded sending back what this request owed{request.refundedAt ? ` ${when(request.refundedAt, now)}` : ""}. The request itself is {REQUEST_STATUS[status].label.toLowerCase()}.
        </>
      );
      break;
    default: {
      const extra = received > asked ? fromStroops(received - asked) : null;
      lead = celebrate ? (
        <CheckBurst size={36} />
      ) : (
        <span className={`${styles.paidDisc} ${styles.bannerIcon}`} aria-hidden="true">
          <Glyph name="check" size={15} strokeWidth={3} />
        </span>
      );
      if (accepted && received < asked) {
        message = (
          <>
            <strong>Paid.</strong> You accepted {formatAmount(request.amountReceived)} of {money(request.amount, code)} as full payment. The remaining {formatAmount(request.amountRemaining)} is not being collected.
          </>
        );
      } else if (extra) {
        message = (
          <>
            <strong>Paid, with {money(extra, code)} extra.</strong> Your customer sent more than you asked for.{" "}
            {refunds.own.length > 0 ? "Send the extra back from your wallet, then mark it refunded below." : request.refundedAt ? "The extra has been marked as refunded." : ""}
          </>
        );
      } else if (accepted) {
        message = (
          <>
            <strong>Paid.</strong> You accepted {money(request.amountReceived, code)} as full payment.
          </>
        );
      } else {
        message = (
          <>
            <strong>Paid in full.</strong> {money(request.amountReceived, code)} arrived{sender ? <> from <span className="mono">{shortAddress(sender)}</span></> : null}
            {request.paidAt ? ` ${when(request.paidAt, now)}` : ""}. {matchedByMemo ? "Right wallet, right asset, right amount, right memo." : "It is matched to this request."} Your customer now sees a Paid receipt.
          </>
        );
      }
    }
  }

  /* ───── Request card values ───── */

  let receivedText: string;
  if (received === 0n && shown.key === "failed" && wrong) receivedText = `${money(wrong.amount, wrong.asset.code)} (wrong asset)`;
  else if (received === 0n) receivedText = open ? "nothing yet" : "nothing";
  else if (received < asked) receivedText = `${formatAmount(request.amountReceived)} of ${money(request.amount, code)}`;
  else receivedText = money(request.amountReceived, code);

  let expires: React.ReactNode;
  if (open) {
    expires = (
      <>
        in <Countdown iso={request.expiresAt} /> · {when(request.expiresAt, now)}
      </>
    );
  } else if (status === "PAID" || status === "OVERPAID") expires = `Paid${request.paidAt ? ` ${when(request.paidAt, now)}` : ""}`;
  else if (status === "EXPIRED") expires = `Expired ${when(request.expiresAt, now)}`;
  else if (status === "CANCELLED") expires = `Cancelled ${when(request.cancelledAt ?? request.updatedAt, now)}`;
  else expires = "Closed by the testnet reset";

  let acceptText: string;
  if (status === "UNDERPAID") {
    acceptText = `This request will be marked Paid. The remaining ${money(fromStroops(remainingAfterAccept), code)} won't be collected, and the link closes for your customer.`;
  } else {
    acceptText = `This request will be marked Paid, counting ${setAsideStroops > 0n ? `the ${money(fromStroops(setAsideStroops), code)}` : "the payment"} that arrived after ${status === "EXPIRED" ? "it expired" : "it was cancelled"}.`;
    if (remainingAfterAccept > 0n) acceptText += ` The remaining ${money(fromStroops(remainingAfterAccept), code)} won't be collected.`;
    if (extraAfterAccept > 0n) acceptText += ` That is ${money(fromStroops(extraAfterAccept), code)} more than you asked for, which you'd still owe back.`;
    acceptText += " Your customer will see a Paid receipt.";
  }

  const paidByCustomer = customer ? customer.paid.filter((l) => isPositive(l.amount)) : [];

  return (
    <>
      <Back />

      <div className={styles.head}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className={styles.amount}>
              <CountUpAmount value={request.amount} /> <span className={styles.amountCode}>{code}</span>
            </h1>
            <span className={styles.bigPill}>
              <RequestPill request={request} />
            </span>
          </div>
          <span className="sub" style={{ overflowWrap: "anywhere" }}>
            For <strong style={{ color: "var(--ink)" }}>{label}</strong> · created {when(request.createdAt, now)} · memo <span className="mono">{request.memo}</span>
          </span>
        </div>
        <div className={styles.actions}>{actions}</div>
      </div>

      <div role="status" className={`${styles.banner} ${BANNER[shown.key] ?? ""} ${celebrate && shown.key === "paid" ? styles.celebrate : ""}`}>
        {/* Keyed by state so the icon and wording arrive fresh while the colour eases across. */}
        <span key={`lead-${shown.key}`} style={{ display: "inline-flex", flexShrink: 0 }}>
          {lead}
        </span>
        <span key={`text-${shown.key}`} className={styles.bannerText}>
          {message}
        </span>
        {shown.key === "pending" ? <Drain from={request.createdAt} to={request.expiresAt} /> : null}
      </div>

      {refunds.payments.length > 0 || refunds.own.length > 0 ? (
        <section aria-labelledby="refund-title" className={styles.refund}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 id="refund-title" className={styles.panelTitle}>
              To send back
            </h2>
            <span style={{ fontSize: 13 }}>PayBridge never moves money. Send it from your own wallet, then mark it here.</span>
          </div>
          {refunds.payments.map((p) => (
            <div key={p.eventId} className={styles.refundRow}>
              <span style={{ flex: "1 1 280px", minWidth: 0 }}>
                <strong className="mono">{money(p.amount, p.asset.code)}</strong> to{" "}
                <span className="mono" title={p.from}>
                  {shortAddress(p.from)}
                </span>{" "}
                <CopyMorph value={p.from} size="icon" ariaLabel="Copy the sender's address" />
                <span style={{ display: "block", fontSize: 13 }}>
                  It {refundReason(p, request)}.{canAcceptLate && p.outcome === setAsideOutcome ? " Or accept it as paid above." : ""}
                </span>
              </span>
              <button type="button" className={styles.copy} onClick={() => setRefund({ kind: "payment", payment: p })}>
                Mark as refunded
              </button>
            </div>
          ))}
          {refunds.own.map((line) => (
            <div key={`${line.asset.code}-${line.asset.issuer ?? ""}`} className={styles.refundRow}>
              <span style={{ flex: "1 1 280px", minWidth: 0 }}>
                <strong className="mono">{money(line.amount, line.asset.code)}</strong>
                {sender ? (
                  <>
                    {" "}
                    to{" "}
                    <span className="mono" title={sender}>
                      {shortAddress(sender)}
                    </span>{" "}
                    <CopyMorph value={sender} size="icon" ariaLabel="Copy the sender's address" />
                  </>
                ) : null}
                <span style={{ display: "block", fontSize: 13 }}>{status === "PAID" || status === "OVERPAID" ? "It is more than you asked for." : "It was received before the request closed without being paid."}</span>
              </span>
              <button type="button" className={styles.copy} onClick={() => setRefund({ kind: "request", line })}>
                Mark as refunded
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <div className={styles.grid}>
        <div className={`${styles.col} stagger`}>
          <section aria-labelledby="verify-title" className={styles.panel} style={{ gap: 4 }}>
            <h2 id="verify-title" className={styles.panelTitle} style={{ marginBottom: 10 }}>
              Verification
            </h2>
            <Timeline steps={steps} now={now} />
          </section>

          {txHash ? (
            <section aria-labelledby="tx-title" className={styles.panel} style={{ gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h2 id="tx-title" className={styles.panelTitle}>
                  Transaction
                </h2>
                <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Stellar Expert <Glyph name="external" size={12} strokeWidth={2.4} />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code className={styles.hash}>{txHash}</code>
                <CopyMorph value={txHash} label="Copy" ariaLabel="Copy transaction hash" />
              </div>
              {paying || fee ? (
                <div className={styles.facts}>
                  {paying ? (
                    <>
                      <div className={styles.fact}>
                        <span style={{ color: "var(--slate)" }}>Ledger</span>
                        <span className={styles.factValue}>{groupInt(paying.ledger)}</span>
                      </div>
                      <div className={styles.fact}>
                        <span style={{ color: "var(--slate)" }}>From</span>
                        <span className={styles.factValue}>
                          <a href={explorerAccount(paying.from)} target="_blank" rel="noopener noreferrer" title={paying.from} style={{ color: "var(--ink)" }}>
                            {shortAddress(paying.from)}
                          </a>
                          <CopyMorph value={paying.from} size="icon" ariaLabel="Copy the payer's address" />
                        </span>
                      </div>
                    </>
                  ) : null}
                  {fee ? (
                    <div className={styles.fact}>
                      <span style={{ color: "var(--slate)" }}>Network fee</span>
                      <span className={styles.factValue}>{fee}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className={`${styles.col} stagger`}>
          <section aria-labelledby="request-title" className={styles.panel} style={{ padding: "18px 22px" }}>
            <h2 id="request-title" className={styles.panelTitle} style={{ marginBottom: 6 }}>
              Request
            </h2>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Amount asked</span>
              <span className={styles.kvValue}>{money(request.amount, code)}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Received</span>
              <span className={styles.kvValue}>{receivedText}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>To wallet</span>
              <span className={styles.kvValue}>
                <span>
                  {wallet?.label ? <span style={{ fontFamily: "var(--font-sans)" }}>{wallet.label} · </span> : null}
                  <a href={explorerAccount(request.wallet)} target="_blank" rel="noopener noreferrer" title={request.wallet} style={{ color: "var(--ink)" }}>
                    {shortAddress(request.wallet)}
                  </a>
                </span>
                <CopyMorph value={request.wallet} size="icon" ariaLabel="Copy wallet address" />
              </span>
            </div>
            <div style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: 10 }}>
              <div className={styles.kv} style={{ borderBottom: "none", paddingBottom: 6 }}>
                <span className={styles.kvLabel}>Memo</span>
                <span className={styles.kvValue}>
                  {request.memo}
                  <CopyMorph value={request.memo} size="icon" ariaLabel="Copy memo" />
                </span>
              </div>
              <details className={styles.disclosure}>
                <summary>Wallet can&apos;t send a text memo?</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, fontSize: 13 }}>
                  <span style={{ color: "var(--slate)" }}>Either of these matches this request exactly like the memo does.</span>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ color: "var(--slate)" }}>Memo as a number (memo ID)</span>
                      <span className="mono" style={{ wordBreak: "break-all", fontWeight: 600 }}>
                        {request.memoId}
                      </span>
                    </span>
                    <CopyMorph value={request.memoId} size="icon" ariaLabel="Copy memo ID" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ color: "var(--slate)" }}>Address with the memo built in</span>
                      <span className="mono" style={{ wordBreak: "break-all", fontSize: 12, fontWeight: 600 }}>
                        {request.muxedAddress}
                      </span>
                    </span>
                    <CopyMorph value={request.muxedAddress} size="icon" ariaLabel="Copy the address with the memo built in" />
                  </div>
                </div>
              </details>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Payment link</span>
              <span className={styles.kvValue} style={{ fontSize: 13 }}>
                <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", wordBreak: "break-all" }}>
                  {link.replace(/^https?:\/\//, "")}
                </a>
                <CopyMorph value={link} size="icon" icon="link" ariaLabel="Copy payment link" />
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Expires</span>
              <span style={{ fontWeight: 600, textAlign: "right" }}>{expires}</span>
            </div>
          </section>

          {customer ? (
            <section aria-labelledby="customer-title" className={styles.panel} style={{ padding: "18px 22px", gap: 10 }}>
              <h2 id="customer-title" className={styles.panelTitle}>
                Customer
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span className={styles.avatar} aria-hidden="true">
                  {customer.email.charAt(0).toUpperCase()}
                </span>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{customer.email}</span>
                  <span style={{ fontSize: 13, color: "var(--slate)" }}>
                    {customer.requests} request{customer.requests === 1 ? "" : "s"} · {paidByCustomer.length > 0 ? `${paidByCustomer.map((l) => money(l.amount, l.asset.code)).join(" + ")} paid` : "nothing paid yet"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CopyMorph value={link} label="Copy link" icon="link" />
                <a href={whatsappUrl(shareText)} target="_blank" rel="noopener noreferrer" className={styles.copy}>
                  Share on WhatsApp
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {showPayments ? (
        <Reveal>
          <section aria-labelledby="payments-title" className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 id="payments-title" className={styles.panelTitle}>
                Payments seen for this request
              </h2>
              <span style={{ fontSize: 13, color: "var(--slate)" }}>
                {payments.length} payment{payments.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="table-wrap">
              <table className="table cascade" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>From</th>
                    <th>Outcome</th>
                    <th style={{ textAlign: "right" }}>Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.eventId}>
                      <td className="mono" style={{ fontSize: 13, color: "var(--slate)" }}>
                        {clock(p.ledgerClosedAt, now)}
                      </td>
                      <td className="num">{money(p.amount, p.asset.code)}</td>
                      <td className="mono" style={{ fontSize: 13 }}>
                        <a href={explorerAccount(p.from)} target="_blank" rel="noopener noreferrer" title={p.from} style={{ color: "var(--ink)" }}>
                          {shortAddress(p.from)}
                        </a>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <OutcomePill outcome={p.outcome} />
                          {p.refundedAt ? <Pill tone="muted">Refunded</Pill> : null}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <a href={explorerTx(p.txHash)} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 13, display: "inline-flex", gap: 4, alignItems: "center" }}>
                          {shortHash(p.txHash)}
                          <Glyph name="external" size={12} strokeWidth={2.4} />
                          <span className="sr-only">on Stellar Expert (opens in a new tab)</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </Reveal>
      ) : null}

      <Dialog
        open={dialog === "accept"}
        onClose={closeDialog}
        title={`Accept ${money(acceptAmount, code)} as full payment?`}
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeDialog} disabled={busy} aria-busy={busy}>
              Not now
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => run(`${base}/accept`, "Accepted · marked Paid")}>
              {busy ? "Accepting…" : "Accept as paid"}
            </button>
          </>
        }
      >
        <span style={{ fontSize: 15, color: "var(--slate)" }}>{acceptText}</span>
        {actionError ? (
          <div role="alert" className="alert">
            {actionError}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={closeDialog}
        title="Cancel this request?"
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeDialog} disabled={busy} aria-busy={busy}>
              Keep request
            </button>
            <button type="button" className="btn" style={{ background: "var(--error)", color: "#FFFFFF" }} disabled={busy} aria-busy={busy} onClick={() => run(`${base}/cancel`, "Request cancelled. The link is closed.")}>
              {busy ? "Cancelling…" : "Cancel request"}
            </button>
          </>
        }
      >
        <span style={{ fontSize: 15, color: "var(--slate)" }}>
          The payment link stops working right away. {request.refundDue.length > 0 ? "What already arrived in the wrong asset is not counted and stays yours to send back." : "Nothing has been received, so there is nothing to refund."} If your customer pays after this, the money still reaches your wallet and you can accept it or send it back.
        </span>
        {actionError ? (
          <div role="alert" className="alert">
            {actionError}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "receipt"}
        onClose={closeDialog}
        title="Email the receipt"
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeDialog} disabled={busy} aria-busy={busy}>
              Not now
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={sendReceipt}>
              {busy ? "Sending…" : "Send receipt"}
            </button>
          </>
        }
      >
        <span style={{ fontSize: 15, color: "var(--slate)" }}>
          {request.customerEmail ? "The receipt goes to the customer's address on this request. Change it if it should go somewhere else." : "This request has no customer email yet. Where should the receipt go?"}
        </span>
        <div className="field">
          <label htmlFor="receipt-email" className="label">
            Customer email
          </label>
          <input
            id="receipt-email"
            type="email"
            className={`input${actionError ? " invalid" : ""}`}
            value={receiptEmail}
            onChange={(e) => {
              setReceiptEmail(e.target.value);
              setActionError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendReceipt();
              }
            }}
            placeholder="customer@example.com"
            autoComplete="off"
            maxLength={254}
            aria-invalid={Boolean(actionError)}
            aria-describedby={actionError ? "receipt-error" : undefined}
          />
        </div>
        {actionError ? (
          <div id="receipt-error" role="alert" className="alert">
            {actionError}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "resend"}
        onClose={closeDialog}
        title="Link copied. Send it again?"
        width={480}
        footer={
          <>
            <CopyMorph value={link} label="Copy again" copiedLabel="Copied" icon="link" size="lg" />
            <a href={whatsappUrl(shareText)} target="_blank" rel="noopener noreferrer" className="btn btn-primary" onClick={closeDialog}>
              Share on WhatsApp
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </>
        }
      >
        <span style={{ fontSize: 15, color: "var(--slate)" }}>
          {status === "UNDERPAID"
            ? `The same link now asks for the remaining ${money(request.amountRemaining, code)}, with the same memo. Paste it to your customer, or send it on WhatsApp.`
            : `The link asks for ${money(request.amount, code)} in ${code}, with memo ${request.memo}. Paste it to your customer, or send it on WhatsApp.`}
        </span>
        <code className={styles.hash} style={{ flex: "none" }}>
          {link}
        </code>
      </Dialog>

      <RefundDialog
        amount={refund ? (refund.kind === "payment" ? money(refund.payment.amount, refund.payment.asset.code) : money(refund.line.amount, refund.line.asset.code)) : null}
        onClose={() => setRefund(null)}
        onConfirm={recordRefund}
      />
    </>
  );
}
