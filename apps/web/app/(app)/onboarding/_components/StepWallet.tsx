"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { api, ApiError, errorMessage } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { connectFreighter, FreighterError } from "@/lib/freighter";
import { useMe } from "@/lib/session";
import type { Merchant, Wallet } from "@/lib/types";
import styles from "../onboarding.module.css";
import { useShake } from "./shared";

type Asset = "USDC" | "XLM";

const FRIENDBOT_URL = "https://lab.stellar.org/account/fund";

const ASSETS: { code: Asset; sub: string }[] = [
  { code: "USDC", sub: "Stablecoin · needs a trustline" },
  { code: "XLM", sub: "Native · always works" },
];

/** A 56-character value starting with S is a Stellar secret key. It must never leave this page. */
const looksLikeSecret = (value: string) => value.length === 56 && value.startsWith("S");

function addressProblem(a: string, existing: Wallet[]): string {
  if (!a) return "Paste the public address of the wallet you want paid.";
  if (a[0] !== "G") return "A Stellar address starts with G.";
  if (a.length !== 56) return `That has ${a.length} characters. An address has 56.`;
  if (!/^G[A-Z2-7]{55}$/.test(a)) return "Only capital letters A–Z and digits 2–7.";
  if (existing.some((w) => w.address === a)) return "You've already added this wallet.";
  return "";
}

interface Line {
  ok: boolean;
  text: string;
}

/** What the last check of this wallet on Testnet found. Nothing here is assumed. */
function checkLines(wallet: Wallet): Line[] {
  const lines: Line[] = [{ ok: true, text: "Valid Stellar address" }];
  if (!wallet.accountExists) {
    lines.push({ ok: false, text: "Account not found on Testnet yet" });
    return lines;
  }
  lines.push({ ok: true, text: "Account found on Testnet" });
  const usdc = wallet.canReceive.USDC;
  if (usdc?.canReceive) lines.push({ ok: true, text: "USDC trustline found" });
  else lines.push({ ok: false, text: usdc?.reason === "TRUSTLINE_LIMIT_TOO_LOW" ? "USDC trustline is full or its limit is too low" : "No USDC trustline yet" });
  if (wallet.canReceive.XLM?.canReceive) lines.push({ ok: true, text: "Ready to receive XLM" });
  return lines;
}

interface Props {
  merchant: Merchant;
  wallets: Wallet[];
  className: string;
  onBack: () => void;
  onDone: () => void;
}

export function StepWallet({ merchant, wallets, className, onBack, onDone }: Props) {
  const { mutate } = useSWRConfig();
  const { mutate: mutateMe } = useMe();
  const toast = useToast();
  const { shake, shakeClass } = useShake();

  const [selectedId, setSelectedId] = useState<string | null>(() => wallets.find((w) => w.id === merchant.defaultWalletId)?.id ?? wallets[0]?.id ?? null);
  const [adding, setAdding] = useState(wallets.length === 0);
  const [asset, setAsset] = useState<Asset>(merchant.defaultAsset === "XLM" ? "XLM" : "USDC");
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("Main");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [apiAddrError, setApiAddrError] = useState<string | null>(null);
  const [freighterError, setFreighterError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showForm = adding || wallets.length === 0;
  const selected = wallets.find((w) => w.id === selectedId) ?? wallets[0] ?? null;

  const a = addr.trim();
  const isSecret = looksLikeSecret(a);
  const addrErr = isSecret ? "" : addressProblem(a, wallets);
  const shownAddrErr = isSecret ? "" : tried && addrErr ? addrErr : (apiAddrError ?? "");
  const labelBad = tried && !label.trim();

  const saveDefaults = async (walletId: string) => {
    if (merchant.defaultWalletId === walletId && merchant.defaultAsset === asset) return;
    const res = await api.post<{ merchant: Merchant }>("/auth/settings", { defaultWalletId: walletId, defaultAsset: asset });
    await mutateMe(res, { revalidate: false });
  };

  const fillFromFreighter = async () => {
    if (connecting) return;
    setConnecting(true);
    setFreighterError(null);
    try {
      const address = await connectFreighter();
      setAddr(address);
      setApiAddrError(null);
      setTried(false);
      toast("Freighter connected · Testnet");
    } catch (err) {
      setFreighterError(err instanceof FreighterError ? err.message : "Freighter couldn't complete that. Try again.");
    } finally {
      setConnecting(false);
    }
  };

  /** Adds the pasted address. The API looks it up on Testnet and answers with what it found. */
  const verifyNew = async () => {
    // A secret key is never sent anywhere.
    if (isSecret) return;
    setTried(true);
    if (addrErr || !label.trim()) {
      shake();
      return;
    }
    setBusy(true);
    setError(null);
    setApiAddrError(null);
    let wallet: Wallet;
    try {
      const res = await api.post<{ wallet: Wallet }>("/v1/wallets", { address: a, label: label.trim() });
      wallet = res.wallet;
    } catch (err) {
      if (err instanceof ApiError && err.code === "SECRET_KEY_REJECTED") {
        setAddr("");
        setApiAddrError("That was a secret key, so we cleared it. Paste the public address (starts with G) instead.");
      } else if (err instanceof ApiError && err.code === "WALLET_TAKEN") {
        setApiAddrError("This wallet is already registered with PayBridge. Use a different address.");
      } else if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const labelMsg = err.field("label");
        if (labelMsg && !err.field("address")) setError(`Label: ${labelMsg}`);
        else setApiAddrError("That isn't a valid Stellar public address. Check it and paste it again.");
      } else {
        setError(errorMessage(err));
      }
      shake();
      setBusy(false);
      return;
    }
    // The wallet exists from here on: show it as chosen even if saving the default fails.
    await mutate("/v1/wallets", (current: { data: Wallet[] } | undefined) => ({ data: [...(current?.data ?? []).filter((w) => w.id !== wallet.id), wallet] }), { revalidate: true });
    setSelectedId(wallet.id);
    setAdding(false);
    setAddr("");
    setLabel("");
    setTried(false);
    toast("Wallet checked on Testnet");
    try {
      await saveDefaults(wallet.id);
    } catch (err) {
      setError(`The wallet was added, but we couldn't save it as your default. ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await saveDefaults(selected.id);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const checkAgain = async () => {
    if (!selected || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await api.post<{ wallet: Wallet }>(`/v1/wallets/${selected.id}/refresh`);
      await mutate("/v1/wallets", (current: { data: Wallet[] } | undefined) => ({ data: (current?.data ?? []).map((w) => (w.id === res.wallet.id ? res.wallet : w)) }), { revalidate: false });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void (showForm ? verifyNew() : next());
  };

  const usdcBlocked = !!selected && selected.accountExists && !selected.canReceive.USDC?.canReceive;

  return (
    <form onSubmit={submit} noValidate className={className}>
      <div className={styles.head}>
        <h1 className="h1">Where should money go?</h1>
        <span className="sub">Your default receiving wallet. Every request can use a different one, and you can add more in Settings.</span>
      </div>
      <div className={styles.box}>
        {showForm ? (
          <div key="form" className={styles.swap}>
            <div className="field">
              <label htmlFor="ob-wallet" className="label">
                Receiving wallet (public address)
              </label>
              <div className={shakeClass(isSecret || !!shownAddrErr)}>
                <input
                  id="ob-wallet"
                  className={`input mono${isSecret || shownAddrErr ? " invalid" : ""}`}
                  style={{ fontSize: 14 }}
                  value={addr}
                  onChange={(e) => {
                    setAddr(e.target.value);
                    setApiAddrError(null);
                    setFreighterError(null);
                  }}
                  placeholder="G…"
                  aria-invalid={isSecret || !!shownAddrErr || undefined}
                  aria-describedby="ob-wallet-hint"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              {isSecret ? (
                <div role="alert" className={styles.secret}>
                  <span style={{ fontWeight: 800 }}>Stop. That&apos;s a secret key.</span>
                  <span style={{ fontSize: 14 }}>
                    Secret keys start with S and give full control of a wallet. PayBridge never asks for one. Clear it now, and if you&apos;ve shared it anywhere, move your funds to a new wallet.
                  </span>
                  <button type="button" className="btn" onClick={() => setAddr("")} style={{ alignSelf: "flex-start", height: 42, background: "var(--error)", color: "#FFFFFF", fontSize: 15 }}>
                    Clear it
                  </button>
                </div>
              ) : null}
              {shownAddrErr ? (
                <span role="alert" className="field-error" style={{ fontWeight: 600 }}>
                  {shownAddrErr}
                </span>
              ) : null}
              <span id="ob-wallet-hint" className="hint">
                Starts with G and has 56 characters. {a && !isSecret ? <span style={{ fontWeight: 700 }}>{a.length} / 56</span> : null}
              </span>
            </div>
            <div className={styles.toolRow}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={fillFromFreighter} disabled={connecting || busy} aria-busy={connecting}>
                <Icon name="wallets" size={15} />
                {connecting ? "Waiting for Freighter…" : "Connect Freighter"}
              </button>
              {wallets.length > 0 ? (
                <button
                  type="button"
                  className="btn-link"
                  style={{ fontSize: 13 }}
                  onClick={() => {
                    setAdding(false);
                    setTried(false);
                    setError(null);
                  }}
                >
                  Keep my current wallet
                </button>
              ) : null}
            </div>
            {freighterError ? (
              <span role="alert" className="field-error" style={{ fontWeight: 600 }}>
                {freighterError}
              </span>
            ) : null}
            <div className="field">
              <label htmlFor="ob-label" className="label">
                Label
              </label>
              <div className={shakeClass(labelBad)}>
                <input id="ob-label" className={`input${labelBad ? " invalid" : ""}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main" maxLength={64} aria-invalid={labelBad || undefined} />
              </div>
              {labelBad ? (
                <span role="alert" className="field-error" style={{ fontWeight: 600 }}>
                  Give it a name you&apos;ll recognise.
                </span>
              ) : (
                <span className="hint">Only you see this. It helps when you have more than one wallet.</span>
              )}
            </div>
          </div>
        ) : selected ? (
          <div key="chosen" className={styles.swap}>
            <div className="field" style={{ gap: 8 }}>
              <span className="label" id="ob-chosen-label">
                {wallets.length > 1 ? "Choose your default receiving wallet" : "Your receiving wallet"}
              </span>
              <div role="radiogroup" aria-labelledby="ob-chosen-label" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {wallets.map((w) => (
                  <button key={w.id} type="button" role="radio" aria-checked={w.id === selected.id} className={styles.chosen} onClick={() => setSelectedId(w.id)}>
                    <span className={styles.chosenIcon} aria-hidden="true">
                      <Icon name="wallets" />
                    </span>
                    <span className={styles.chosenText}>
                      <span style={{ fontWeight: 700 }}>{w.label || "Wallet"}</span>
                      <span className="mono" style={{ fontSize: 13, color: "var(--slate)" }} title={w.address}>
                        {shortAddress(w.address, 6, 6)}
                      </span>
                    </span>
                    <span className={styles.radio} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            {/* Keyed by the last check, so the lines tick in again when the facts change. */}
            <ul key={`${selected.id}:${selected.checkedAt ?? ""}`} className={styles.lines} aria-label="What we found on Testnet">
              {checkLines(selected).map((line, i) => (
                <li key={line.text} className={`${styles.line} ${line.ok ? styles.lineGood : styles.lineWarn}`} style={{ "--i": i } as React.CSSProperties}>
                  <Icon name={line.ok ? "check" : "alert"} size={15} strokeWidth={line.ok ? 2.8 : 2.2} />
                  {line.text}
                </li>
              ))}
            </ul>
            {!selected.accountExists ? (
              <div className="notice" role="status">
                This account does not exist on Testnet yet, so it cannot receive a payment. Fund it with{" "}
                <a href={FRIENDBOT_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                  Friendbot
                </a>{" "}
                (free test XLM), then press Check again. You can also continue now and fund it before your first request.
              </div>
            ) : usdcBlocked ? (
              <div className="notice" role="status">
                This wallet cannot receive USDC yet: {selected.canReceive.USDC?.reason === "TRUSTLINE_LIMIT_TOO_LOW" ? "its USDC trustline has no room left" : "it has no USDC trustline"}. XLM still works. Add
                or raise the trustline in your wallet app and press Check again, or settle in XLM for now.
                {asset === "USDC" ? (
                  <>
                    {" "}
                    <button type="button" className="btn-link" onClick={() => setAsset("XLM")}>
                      Settle in XLM instead
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className={styles.toolRow}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={checkAgain} disabled={checking || busy}>
                <Icon name="refresh" size={15} style={checking ? { animation: "spin 0.8s linear infinite" } : undefined} />
                {checking ? "Checking…" : "Check again"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setAdding(true);
                  setLabel("");
                  setError(null);
                }}
                disabled={busy}
              >
                <Icon name="plus" size={15} />
                Add another wallet
              </button>
            </div>
          </div>
        ) : null}

        <div className="field" style={{ gap: 8 }}>
          <span className="label" id="ob-asset-label">
            Settle in
          </span>
          <div className={styles.assets} role="group" aria-labelledby="ob-asset-label">
            {ASSETS.map((option) => (
              <button key={option.code} type="button" className={styles.asset} aria-pressed={asset === option.code} onClick={() => setAsset(option.code)}>
                <span style={{ fontWeight: 800 }}>{option.code}</span>
                <span className={styles.assetSub}>{option.sub}</span>
              </button>
            ))}
          </div>
        </div>
        {showForm ? (
          <div className={styles.trust}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l10 18H2zM12 10v4M12 17.5v.01" />
            </svg>
            <span>USDC needs a trustline on your wallet. If it is missing, PayBridge tells you before your first request, and XLM still works.</span>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="alert">
            {error}
          </div>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy} style={{ fontSize: 15 }}>
          Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || (showForm && isSecret)} aria-busy={busy} style={{ fontSize: 15 }}>
          {showForm ? (busy ? "Verifying…" : "Verify and continue") : busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </form>
  );
}
