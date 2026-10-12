"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatAmount, isPositive, shortAddress } from "@/lib/format";
import { usePollWhenOffline } from "@/lib/live";
import { useMe, useWallets } from "@/lib/session";
import type { PaymentRequest, RequestDetail, Wallet } from "@/lib/types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { CheckBurst } from "./motion/CheckBurst";
import type { NewRequestPrefill } from "./NewRequest";
import { RequestPill } from "./StatusPill";

export interface NewRequestDialogProps {
  open: boolean;
  prefill: NewRequestPrefill;
  onClose: () => void;
}

type AssetCode = "USDC" | "XLM";
type FieldKey = "amount" | "asset" | "wallet" | "address" | "label" | "description" | "customerEmail" | "form";
type Errors = Partial<Record<FieldKey, string>>;

const AMOUNT_RE = /^\d{1,12}(\.\d{1,7})?$/;
const OTHER = "other";

/** A 56-character value starting with S is a Stellar secret key. It must never leave this page. */
const looksLikeSecret = (value: string) => value.length === 56 && value.startsWith("S");

const startsWith = (prefix: string) => (key: unknown) => typeof key === "string" && key.startsWith(prefix);

const walletName = (w: Pick<Wallet, "label" | "address">) => (w.label ? `${w.label} · ${shortAddress(w.address)}` : shortAddress(w.address));

function addressProblem(a: string, existing: Wallet[]): string {
  if (!a) return "Paste the public address that should receive the payment.";
  if (a[0] !== "G") return "A Stellar public address starts with G.";
  if (a.length !== 56) return `That has ${a.length} characters. A public address has exactly 56.`;
  if (!/^G[A-Z2-7]{55}$/.test(a)) return "Only capital letters A–Z and digits 2–7 are allowed.";
  if (existing.some((w) => w.address === a)) return "You've already added this wallet. Pick it from the list.";
  return "";
}

/** Why the chosen wallet may not be able to receive this asset. A warning only: the server decides. */
function capabilityProblem(wallet: Wallet | undefined, asset: AssetCode): string | null {
  if (!wallet) return null;
  const inactive = "This wallet isn't active on Stellar Testnet yet. Fund it with test XLM before sharing the link, or the payment can't land.";
  if (!wallet.accountExists && wallet.checkedAt) return inactive;
  const check = wallet.canReceive[asset];
  if (!check || check.canReceive) return null;
  if (check.reason === "ACCOUNT_NOT_FOUND") return inactive;
  if (check.reason === "NO_TRUSTLINE") {
    return `This wallet has no ${asset} trustline, so it can't receive ${asset} yet. Add the trustline in the wallet, or pick another asset or wallet.`;
  }
  if (check.reason === "TRUSTLINE_LIMIT_TOO_LOW") {
    return `This wallet's ${asset} trustline limit is too low for more ${asset}. Raise the limit in the wallet, or pick another wallet.`;
  }
  return `This wallet can't receive ${asset} right now.`;
}

/** "15 minutes", "2 hours", "1 h 30 min", "3 days": how long the link stays open, from the request itself. */
function openFor(createdAt: string, expiresAt: string): string {
  const minutes = Math.max(1, Math.round((new Date(expiresAt).getTime() - new Date(createdAt).getTime()) / 60_000));
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes < 60) return s(minutes, "minute");
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? s(h, "hour") : `${h} h ${m} min`;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.round((minutes % (24 * 60)) / 60);
  return hours === 0 ? s(days, "day") : `${s(days, "day")} ${hours} h`;
}

/* Local motion for this dialog (the shared kit has no "leave" or "sweep"). Off under reduced motion. */
const CSS = `
@keyframes nrd-leave { to { opacity: 0; transform: translateX(-28px); } }
@keyframes nrd-tick { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
@keyframes nrd-sweep { from { transform: translateX(-120%) skewX(-20deg); } to { transform: translateX(420%) skewX(-20deg); } }
@keyframes nrd-qr { from { opacity: 0; transform: scale(0.6) rotate(-6deg); } to { opacity: 1; transform: none; } }
@keyframes nrd-morph { from { opacity: 0; transform: scale(0.4) rotate(-30deg); } to { opacity: 1; transform: none; } }
@keyframes nrd-draw { to { stroke-dashoffset: 0; } }
.nrd-leaving { animation: nrd-leave 0.22s ease-in forwards !important; pointer-events: none; }
.nrd-tick { animation: nrd-tick 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: calc(0.35s + var(--i, 0) * 90ms); }
.nrd-link { position: relative; flex: 1; min-width: 0; overflow: hidden; border-radius: 10px; }
.nrd-link::after { content: ""; position: absolute; inset: 0 auto 0 0; width: 30%; pointer-events: none; opacity: 0;
  background: linear-gradient(90deg, transparent, rgba(30, 79, 214, 0.22), transparent); }
.nrd-link.nrd-swept::after { opacity: 1; animation: nrd-sweep 1.1s ease-out 1s both; }
.nrd-qr { animation: nrd-qr 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s both; }
.nrd-morph { display: inline-flex; animation: nrd-morph 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.nrd-morph path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: nrd-draw 0.3s ease-out 0.1s forwards; }
.nrd-copied { border-color: var(--good) !important; color: var(--good) !important; }
@media (prefers-reduced-motion: reduce) {
  .nrd-leaving, .nrd-tick, .nrd-qr, .nrd-morph, .nrd-morph path, .nrd-link.nrd-swept::after { animation: none !important; }
  .nrd-link.nrd-swept::after { opacity: 0; }
  .nrd-morph path { stroke-dashoffset: 0; }
}
`;

/** Copy button whose icon morphs into a drawn check for two seconds. */
function CopyMorph({ value, label, ariaLabel, small }: { value: string; label?: string; ariaLabel: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
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
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`btn btn-secondary${small ? " btn-sm" : ""}${copied ? " nrd-copied" : ""}`}
      aria-label={copied ? "Copied" : ariaLabel}
      style={small ? { height: 30, padding: "0 8px" } : { fontSize: 15, flexShrink: 0 }}
    >
      {copied ? (
        <span key="done" className="nrd-morph">
          <Icon name="check" size={small ? 14 : 16} strokeWidth={3} />
        </span>
      ) : (
        <Icon name="copy" size={small ? 14 : 16} />
      )}
      {label ? <span aria-live="polite">{copied ? "Copied" : label}</span> : null}
    </button>
  );
}

function DetailRow({ label, i, children }: { label: string; i: number; children: React.ReactNode }) {
  return (
    <div className="nrd-tick" style={{ "--i": i, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 24 } as React.CSSProperties}>
      <span style={{ color: "var(--slate)" }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>{children}</span>
    </div>
  );
}

interface Created {
  request: PaymentRequest;
  link: string;
  walletText: string;
}

function Done({ created, businessName, onClose }: { created: Created; businessName: string; onClose: () => void }) {
  const poll = usePollWhenOffline();
  // Keeps the status pill live: it flips to Paid here too if the customer is quick.
  const { data } = useSWR<RequestDetail>(`/v1/payment-requests/${created.request.id}`, { refreshInterval: poll });
  const request = data?.request ?? created.request;
  const { link } = created;
  const amountText = `${formatAmount(request.amount)} ${request.asset.code}`;
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((mod) => {
        // CommonJS package: depending on the bundler the functions sit on the namespace or on `default`.
        const lib = mod.default ?? mod;
        return lib.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0F172A", light: "#FFFFFF" } });
      })
      .then((svg) => {
        if (live) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => undefined); // the link and buttons still work without the QR
    return () => {
      live = false;
    };
  }, [link]);

  const message = `${businessName} is requesting ${amountText}${request.description ? ` for ${request.description}` : ""}. Pay here: ${link}`;

  return (
    <>
      <div className="anim-slide-up" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CheckBurst size={40} />
        <span className="sub" style={{ fontSize: 13 }}>
          Send the link to your customer. PayBridge is now watching Stellar Testnet for the payment.
        </span>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--row)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
        <DetailRow label="Amount" i={0}>
          <span className="mono" style={{ fontWeight: 600 }}>
            {amountText}
          </span>
        </DetailRow>
        <DetailRow label="To wallet" i={1}>
          <span className="mono" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {created.walletText}
          </span>
        </DetailRow>
        <DetailRow label="Memo" i={2}>
          <span className="mono" style={{ fontWeight: 600 }}>
            {request.memo}
          </span>
          <CopyMorph value={request.memo} ariaLabel="Copy the memo" small />
        </DetailRow>
        <DetailRow label="Status" i={3}>
          <RequestPill request={request} />
        </DetailRow>
      </div>

      <div className="field nrd-tick" style={{ "--i": 4 } as React.CSSProperties}>
        <span className="label">Payment link</span>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="nrd-link nrd-swept">
            <input className="input mono" style={{ fontSize: 13 }} value={link} readOnly aria-label="Payment link" onFocus={(e) => e.currentTarget.select()} />
          </div>
          <CopyMorph value={link} label="Copy" ariaLabel="Copy the payment link" />
        </div>
      </div>

      <div className="nrd-tick" style={{ "--i": 5, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" } as React.CSSProperties}>
        <div style={{ width: 96, height: 96, flexShrink: 0, border: "1px solid var(--border)", borderRadius: 12, padding: 7, background: "#FFFFFF" }}>
          {qr ? (
            <img className="nrd-qr" src={qr} width={80} height={80} alt="QR code of the payment link" style={{ display: "block" }} />
          ) : (
            <span className="skeleton" style={{ display: "block", width: 80, height: 80 }} />
          )}
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <a className="btn btn-primary btn-block" href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15 }}>
            <Icon name="external" size={15} strokeWidth={2.4} />
            Open the pay page
          </a>
          <a className="btn btn-secondary btn-block" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15 }}>
            Share on WhatsApp
          </a>
        </div>
      </div>

      <span className="nrd-tick" style={{ "--i": 6, fontSize: 13, color: "var(--slate)", textAlign: "center" } as React.CSSProperties}>
        The link stays open for {openFor(request.createdAt, request.expiresAt)}. It flips to Paid by itself once the payment is verified.
      </span>
      <div className="nrd-tick" style={{ "--i": 7, display: "flex", justifyContent: "center" } as React.CSSProperties}>
        <Link href={`/requests/${request.id}`} onClick={onClose} style={{ fontSize: 14, fontWeight: 700 }}>
          View request
        </Link>
      </div>
    </>
  );
}

export function NewRequestDialog({ open, prefill, onClose }: NewRequestDialogProps) {
  const { merchant } = useMe();
  const { data: walletData, error: walletsError } = useWallets();
  const { mutate } = useSWRConfig();
  const uid = useId();

  const assets: AssetCode[] = !merchant || merchant.acceptedAssets === "BOTH" ? ["USDC", "XLM"] : [merchant.acceptedAssets];

  const [amount, setAmount] = useState(prefill.amount ?? "");
  const [assetChoice, setAssetChoice] = useState<AssetCode | null>(prefill.asset ?? null);
  const [walletChoice, setWalletChoice] = useState<string | null>(null);
  const [addr, setAddr] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const [description, setDescription] = useState(prefill.description ?? "");
  const [email, setEmail] = useState(prefill.customerEmail ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  /** A wallet created from "Paste another address…" during this dialog, until the list refreshes. */
  const [added, setAdded] = useState<Wallet | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [phase, setPhase] = useState<"form" | "leaving" | "done">("form");
  /** One key per distinct body, so a retry of the same request can never create a second one. */
  const idem = useRef<{ sig: string; key: string } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const loaded = walletData?.data;
  const wallets: Wallet[] = added && !(loaded ?? []).some((w) => w.id === added.id) ? [...(loaded ?? []), added] : (loaded ?? []);
  const walletsReady = Boolean(loaded) || Boolean(walletsError);

  const preferred: AssetCode = assetChoice ?? (merchant?.defaultAsset === "XLM" ? "XLM" : "USDC");
  const asset: AssetCode = assets.includes(preferred) ? preferred : (assets[0] ?? "USDC");
  const choice =
    walletChoice && (walletChoice === OTHER || wallets.some((w) => w.id === walletChoice))
      ? walletChoice
      : (wallets.find((w) => w.id === merchant?.defaultWalletId)?.id ?? wallets[0]?.id ?? OTHER);
  const other = choice === OTHER;
  const chosen = other ? undefined : wallets.find((w) => w.id === choice);

  const a = addr.trim();
  const isSecret = looksLikeSecret(a);
  const capability = capabilityProblem(chosen, asset);

  const clear = (...keys: FieldKey[]) =>
    setErrors((e) => {
      if (!keys.some((k) => e[k]) && !e.form) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      delete next.form;
      return next;
    });

  const validate = (): Errors => {
    const found: Errors = {};
    const amt = amount.trim();
    if (!AMOUNT_RE.test(amt)) found.amount = amt ? "Use digits only, like 25 or 25.50 (up to 7 decimals)." : "Enter an amount above zero.";
    else if (!isPositive(amt)) found.amount = "Enter an amount above zero.";
    if (other) {
      const problem = addressProblem(a, wallets);
      if (problem) found.address = problem;
    }
    if (description.trim().length > 200) found.description = "Keep it to 200 characters.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.customerEmail = "That doesn't look like an email address.";
    return found;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A secret key is never sent anywhere.
    if (busy || isSecret || !merchant || !walletsReady || phase !== "form") return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      let wallet = chosen;
      if (other) {
        try {
          const label = walletLabel.trim();
          const res = await api.post<{ wallet: Wallet }>("/v1/wallets", { address: a, ...(label ? { label } : {}) });
          wallet = res.wallet;
          setAdded(res.wallet);
          setWalletChoice(res.wallet.id);
          setAddr("");
          setWalletLabel("");
          void mutate(startsWith("/v1/wallets"));
        } catch (err) {
          if (err instanceof ApiError && err.code === "SECRET_KEY_REJECTED") {
            setAddr("");
            setErrors({ address: "That was a secret key, so we cleared it. Paste the public address (starts with G) instead." });
          } else if (err instanceof ApiError && err.code === "WALLET_TAKEN") {
            setErrors({ address: "This wallet is already registered with PayBridge. Use a different address." });
          } else if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
            const labelMsg = err.field("label");
            if (labelMsg && !err.field("address")) setErrors({ label: labelMsg });
            else setErrors({ address: "That isn't a valid Stellar public address. Check it and paste it again." });
          } else {
            setErrors({ form: errorMessage(err) });
          }
          return;
        }
      }
      if (!wallet) {
        setErrors({ wallet: "Choose the wallet that should receive the payment." });
        return;
      }

      const desc = description.trim();
      const mail = email.trim();
      const body = { walletId: wallet.id, amount: amount.trim(), asset, ...(desc ? { description: desc } : {}), ...(mail ? { customerEmail: mail } : {}) };
      const sig = JSON.stringify(body);
      if (idem.current?.sig !== sig) idem.current = { sig, key: crypto.randomUUID() };

      const res = await api.post<{ request: PaymentRequest; checkoutUrl: string }>("/v1/payment-requests", body, { headers: { "Idempotency-Key": idem.current.key } });
      void mutate(startsWith("/v1/payment-requests"));
      void mutate(startsWith("/v1/summary"));
      setCreated({ request: res.request, link: res.checkoutUrl || res.request.checkoutUrl, walletText: walletName(wallet) });
      // The form slides away, then the result arrives.
      setPhase("leaving");
      leaveTimer.current = setTimeout(() => setPhase("done"), 220);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setErrors({ form: errorMessage(err) });
      } else if (err.code === "ACCOUNT_NOT_FOUND" || err.code === "NOT_FOUND") {
        setErrors({ wallet: err.code === "NOT_FOUND" ? "We couldn't find that wallet on your account. Pick another one." : err.message });
      } else if (err.code === "NO_TRUSTLINE") {
        setErrors({ asset: err.message });
      } else if (err.code === "TRUSTLINE_LIMIT_TOO_LOW") {
        setErrors({ amount: err.message });
      } else if (err.code === "VALIDATION_FAILED") {
        const mapped: Errors = {};
        const pairs: [string, FieldKey][] = [
          ["amount", "amount"],
          ["asset", "asset"],
          ["walletId", "wallet"],
          ["description", "description"],
          ["customerEmail", "customerEmail"],
        ];
        for (const [path, key] of pairs) {
          const msg = err.field(path);
          if (msg) mapped[key] = msg;
        }
        setErrors(Object.keys(mapped).length > 0 ? mapped : { form: errorMessage(err) });
      } else {
        setErrors({ form: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  const id = (name: string) => `${uid}-${name}`;
  const fieldError = (key: FieldKey) =>
    errors[key] ? (
      <span id={id(`${key}-err`)} role="alert" className="field-error" style={{ fontWeight: 600 }}>
        {errors[key]}
      </span>
    ) : null;

  const done = phase === "done" ? created : null;

  return (
    <Dialog open={open} onClose={onClose} title={done ? "Request created" : "New payment request"} width={480}>
      <style>{CSS}</style>
      {done ? (
        <Done created={done} businessName={merchant?.businessName ?? "A PayBridge merchant"} onClose={onClose} />
      ) : (
        <form onSubmit={submit} noValidate className={`stagger${phase === "leaving" ? " nrd-leaving" : ""}`} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 13, color: "var(--slate)" }}>The customer gets a link. PayBridge watches Stellar Testnet for a payment that matches it.</span>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 124px", gap: 10 }}>
              <div className="field">
                <label htmlFor={id("amount")} className="label">
                  Amount
                </label>
                <input
                  id={id("amount")}
                  className={`input mono${errors.amount ? " invalid" : ""}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    clear("amount");
                  }}
                  aria-invalid={Boolean(errors.amount)}
                  aria-describedby={errors.amount ? id("amount-err") : undefined}
                />
              </div>
              <div className="field">
                <label htmlFor={id("asset")} className="label">
                  Asset
                </label>
                <select
                  id={id("asset")}
                  className={`select${errors.asset ? " invalid" : ""}`}
                  style={{ padding: "0 10px" }}
                  value={asset}
                  onChange={(e) => {
                    setAssetChoice(e.target.value === "XLM" ? "XLM" : "USDC");
                    clear("asset", "amount");
                  }}
                  aria-invalid={Boolean(errors.asset)}
                  aria-describedby={errors.asset ? id("asset-err") : undefined}
                >
                  {assets.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {fieldError("amount")}
            {fieldError("asset")}
          </div>

          <div className="field">
            <label htmlFor={id("wallet")} className="label">
              Receiving wallet
            </label>
            {!walletsReady ? (
              <span className="skeleton" style={{ height: 46, borderRadius: 10 }}>
                Loading wallets
              </span>
            ) : wallets.length > 0 ? (
              <select
                id={id("wallet")}
                className={`select mono${errors.wallet ? " invalid" : ""}`}
                style={{ padding: "0 10px", fontSize: 14 }}
                value={choice}
                onChange={(e) => {
                  setWalletChoice(e.target.value);
                  clear("wallet", "address", "label", "asset", "amount");
                }}
                aria-invalid={Boolean(errors.wallet)}
                aria-describedby={errors.wallet ? id("wallet-err") : undefined}
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {walletName(w)}
                  </option>
                ))}
                <option value={OTHER}>Paste another address…</option>
              </select>
            ) : null}
            {walletsError && !loaded ? <span className="hint">We couldn&apos;t load your saved wallets. You can still paste an address.</span> : null}
            {fieldError("wallet")}
            {walletsReady && other ? (
              <div className="anim-slide-up" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  id={wallets.length > 0 ? undefined : id("wallet")}
                  className={`input mono${isSecret || errors.address ? " invalid" : ""}`}
                  style={{ fontSize: 14 }}
                  value={addr}
                  onChange={(e) => {
                    setAddr(e.target.value);
                    clear("address");
                  }}
                  placeholder="G…"
                  aria-label="Receiving wallet address"
                  aria-invalid={isSecret || Boolean(errors.address)}
                  aria-describedby={errors.address ? id("address-err") : id("address-hint")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {isSecret ? (
                  <div role="alert" style={{ background: "var(--alert-bg)", border: "1.5px solid var(--error-border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontWeight: 800, color: "var(--alert-fg)" }}>Stop. That&apos;s a secret key.</span>
                    <span style={{ fontSize: 14, color: "var(--alert-fg)" }}>
                      Secret keys start with S and give full control of a wallet. PayBridge never asks for one, and it has not been sent anywhere. Clear it
                      and paste the public address (starts with G).
                    </span>
                    <button type="button" className="btn" onClick={() => setAddr("")} style={{ alignSelf: "flex-start", height: 42, background: "var(--error)", color: "#FFFFFF", fontSize: 15 }}>
                      Clear it
                    </button>
                  </div>
                ) : null}
                {fieldError("address")}
                <span id={id("address-hint")} className="hint">
                  Public address: starts with G and has 56 characters. {a && !isSecret ? <span style={{ fontWeight: 700 }}>{a.length} / 56. </span> : null}It is saved to
                  your wallets.
                </span>
                <input
                  className={`input${errors.label ? " invalid" : ""}`}
                  value={walletLabel}
                  onChange={(e) => {
                    setWalletLabel(e.target.value);
                    clear("label");
                  }}
                  placeholder="Label, e.g. Shop float (optional)"
                  aria-label="Label for this wallet (optional)"
                  aria-invalid={Boolean(errors.label)}
                  maxLength={64}
                />
                {fieldError("label")}
              </div>
            ) : null}
            {capability ? (
              <div className="notice" role="status" style={{ fontSize: 13 }}>
                {capability}
              </div>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor={id("description")} className="label">
              What is it for <span style={{ fontWeight: 500, color: "var(--slate)" }}>(optional)</span>
            </label>
            <input
              id={id("description")}
              className={`input${errors.description ? " invalid" : ""}`}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clear("description");
              }}
              placeholder="Order number, invoice, a note the customer will see"
              maxLength={200}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? id("description-err") : undefined}
            />
            {fieldError("description")}
          </div>

          <div className="field">
            <label htmlFor={id("email")} className="label">
              Customer email <span style={{ fontWeight: 500, color: "var(--slate)" }}>(optional, for the receipt)</span>
            </label>
            <input
              id={id("email")}
              type="email"
              className={`input${errors.customerEmail ? " invalid" : ""}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear("customerEmail");
              }}
              placeholder="customer@example.com"
              autoComplete="off"
              maxLength={254}
              aria-invalid={Boolean(errors.customerEmail)}
              aria-describedby={errors.customerEmail ? id("customerEmail-err") : undefined}
            />
            {fieldError("customerEmail")}
          </div>

          {errors.form ? (
            <div role="alert" className="alert">
              {errors.form}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy} style={{ fontSize: 15 }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || isSecret || !walletsReady} aria-busy={busy} style={{ fontSize: 15 }}>
              {busy ? "Creating…" : "Create request"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
