"use client";

import { useLayoutEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useVerifyWallet, VerifyProgress, walletName } from "@/components/wallets/useVerifyWallet";
import { api, ApiError, errorMessage } from "@/lib/api";
import { shortAddress, timeAgo } from "@/lib/format";
import { connectFreighter, FreighterError } from "@/lib/freighter";
import { useNow, usePollWhenOffline } from "@/lib/live";
import type { Merchant, Wallet } from "@/lib/types";
import { Section } from "./Section";
import styles from "./settings.module.css";
import { useSaveSetting } from "./useSaveSetting";

const WALLETS = "/v1/wallets";
const LEAVE_MS = 340;

/** A 56-character value starting with S is a Stellar secret key. It must never leave this page. */
const looksLikeSecret = (value: string) => value.length === 56 && value.startsWith("S");

function addressProblem(a: string, existing: Wallet[]): string {
  if (!a) return "Paste the public address.";
  if (a[0] !== "G") return "A Stellar public address starts with G.";
  if (a.length !== 56) return `That has ${a.length} characters. A public address has exactly 56.`;
  if (!/^G[A-Z2-7]{55}$/.test(a)) return "Only capital letters A–Z and digits 2–7 are allowed.";
  if (existing.some((w) => w.address === a)) return "That wallet is already in the list.";
  return "";
}

const canReceiveUsdc = (w: Wallet) => w.canReceive["USDC"]?.canReceive === true;

function addedMessage(w: Wallet): string {
  if (!w.accountExists) return "Wallet added · not found on Testnet yet";
  return canReceiveUsdc(w) ? "Wallet added · found on Testnet with a USDC trustline" : "Wallet added · on Testnet, no USDC trustline yet";
}

function Fact({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={styles.check} style={{ color: ok ? "var(--good)" : "var(--warn)", fontWeight: 600 }}>
      <Icon name={ok ? "check" : "alert"} size={12} strokeWidth={2.6} />
      {children}
    </span>
  );
}

function CopyAddress({ wallet }: { wallet: Wallet }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
    } catch {
      toast("Couldn't copy. Select the address and copy it yourself.");
      return;
    }
    setCopied(true);
    toast(`${walletName(wallet)} address copied`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className={styles.iconBtn} onClick={copy} aria-label={`Copy the address of ${walletName(wallet)}`}>
      {copied ? (
        <span key="done" className={styles.copied} style={{ display: "inline-flex" }}>
          <Icon name="check" size={16} strokeWidth={2.6} />
        </span>
      ) : (
        <Icon name="copy" size={15} />
      )}
    </button>
  );
}

export function WalletsCard({ merchant }: { merchant: Merchant }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const now = useNow();
  const { data, error, mutate: reload } = useSWR<{ data: Wallet[] }>(WALLETS, { refreshInterval: usePollWhenOffline() });
  const wallets = data?.data;
  const settings = useSaveSetting(merchant);
  const proof = useVerifyWallet();

  const [freshId, setFreshId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [target, setTarget] = useState<Wallet | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // A default that points at a wallet since removed counts as no default.
  const defaultId = merchant.defaultWalletId && wallets?.some((w) => w.id === merchant.defaultWalletId) ? merchant.defaultWalletId : null;

  // The DEFAULT badge slides from the wallet that had it to the one that has it now.
  const badgeRef = useRef<HTMLSpanElement>(null);
  const lastBadge = useRef<{ id: string; x: number; y: number } | null>(null);
  const count = wallets?.length ?? 0;
  useLayoutEffect(() => {
    const badge = badgeRef.current;
    if (!badge || !defaultId) {
      lastBadge.current = null;
      return;
    }
    // Offsets ignore transforms, so a row that is still animating in does not skew them.
    const pos = { id: defaultId, x: badge.offsetLeft, y: badge.offsetTop };
    const prev = lastBadge.current;
    lastBadge.current = pos;
    if (!prev || prev.id === pos.id || typeof badge.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    badge.animate(
      [
        { transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px) scale(1)`, offset: 0 },
        { transform: `translate(${(prev.x - pos.x) / 2}px, ${(prev.y - pos.y) / 2}px) scale(1.15)`, offset: 0.5 },
        { transform: "none", offset: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" },
    );
  }, [defaultId, count]);

  const makeDefault = (w: Wallet) => {
    setRowError(null);
    void settings.save({ defaultWalletId: w.id }, `${walletName(w)} is now the default for new requests`);
  };

  const recheck = async (w: Wallet) => {
    if (checkingId) return;
    setCheckingId(w.id);
    setRowError(null);
    try {
      const res = await api.post<{ wallet: Wallet }>(`${WALLETS}/${w.id}/refresh`);
      await mutate(WALLETS);
      toast(
        !res.wallet.accountExists
          ? `${walletName(w)} was not found on Testnet`
          : canReceiveUsdc(res.wallet)
            ? `${walletName(w)} checked · ready for USDC`
            : `${walletName(w)} checked · no USDC trustline`,
      );
    } catch (err) {
      setRowError({ id: w.id, message: errorMessage(err) });
    } finally {
      setCheckingId(null);
    }
  };

  const prove = async (w: Wallet) => {
    setRowError(null);
    const verified = await proof.verify(w);
    if (verified) toast(`${walletName(w)} · ownership proven`);
  };

  const closeRemove = () => {
    setTarget(null);
    setRemoveError(null);
  };

  const remove = async () => {
    if (!target || removing) return;
    const gone = target;
    setRemoving(true);
    setRemoveError(null);
    try {
      await api.delete(`${WALLETS}/${gone.id}`);
      setTarget(null);
      // Let the row slide away before the list drops it.
      setLeavingId(gone.id);
      await new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
      await Promise.all([mutate(WALLETS), mutate("/auth/me")]);
      setLeavingId(null);
      toast(`${walletName(gone)} removed`);
    } catch (err) {
      setRemoveError(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  const proofBusyId = proof.state.phase ? proof.state.walletId : null;

  return (
    <Section title="Receiving wallets" sub="Where payments land. PayBridge only ever reads these accounts; it never holds funds.">
      {settings.error ? (
        <div role="alert" className="alert">
          {settings.error}
        </div>
      ) : null}

      {wallets ? (
        wallets.length === 0 ? (
          <div className="empty" style={{ padding: "20px 0" }}>
            <strong>No receiving wallets yet</strong>
            <span>Add the public address of the wallet you want paid into.</span>
          </div>
        ) : (
          <ul className={styles.walletList}>
            {wallets.map((w, i) => {
              const name = walletName(w);
              const isDefault = w.id === defaultId;
              const rowClass = [styles.walletRow, w.id === freshId ? styles.walletFresh : "", w.id === leavingId ? styles.walletLeaving : ""].filter(Boolean).join(" ");
              const proving = proofBusyId === w.id;
              const message = rowError?.id === w.id ? rowError.message : proof.state.walletId === w.id ? proof.state.error : null;
              return (
                <li key={w.id} className={rowClass} style={{ "--i": i } as React.CSSProperties}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className={styles.walletIcon}>
                      <Icon name="wallets" />
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                        {isDefault ? (
                          <span ref={badgeRef} className={styles.badge}>
                            DEFAULT
                          </span>
                        ) : null}
                      </span>
                      <span className="mono" style={{ fontSize: 12, color: "var(--slate)" }} title={w.address}>
                        {shortAddress(w.address)}
                      </span>
                    </div>
                    {isDefault ? null : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => makeDefault(w)} style={{ height: 38, padding: "0 14px", borderColor: "var(--border)" }} aria-label={`Make ${name} the default`}>
                        Make default
                      </button>
                    )}
                    <CopyAddress wallet={w} />
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", paddingLeft: 48, fontSize: 12, color: "var(--slate)" }}>
                    {w.checkedAt ? (
                      <>
                        <Fact ok={w.accountExists}>{w.accountExists ? "On Testnet" : "Not found on Testnet"}</Fact>
                        {w.accountExists ? <Fact ok={canReceiveUsdc(w)}>{canReceiveUsdc(w) ? "USDC trustline found" : "No USDC trustline"}</Fact> : null}
                        <span className={styles.check}>Checked {timeAgo(w.checkedAt, now)}</span>
                      </>
                    ) : (
                      <span className={styles.check}>Not checked yet</span>
                    )}
                    {w.verified ? (
                      <span className={styles.check} style={{ color: "var(--brand-dark)", fontWeight: 600 }}>
                        <Icon name="shield" size={12} strokeWidth={2.4} />
                        Ownership proven
                      </span>
                    ) : null}
                  </div>

                  <div className={styles.rowActions}>
                    <button type="button" className={`btn-link${checkingId === w.id ? ` ${styles.spinning}` : ""}`} onClick={() => recheck(w)} disabled={checkingId !== null} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Icon name="refresh" size={13} />
                      {checkingId === w.id ? "Checking…" : "Re-check"}
                    </button>
                    {w.verified ? null : (
                      <button type="button" className="btn-link" onClick={() => prove(w)} disabled={proof.busy}>
                        Prove ownership with Freighter
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setRemoveError(null);
                        setTarget(w);
                      }}
                      style={{ color: "var(--error)" }}
                      aria-label={`Remove ${name}`}
                    >
                      Remove
                    </button>
                  </div>

                  {proving && proof.state.phase ? (
                    <div style={{ paddingLeft: 48 }}>
                      <VerifyProgress phase={proof.state.phase} />
                    </div>
                  ) : null}
                  {message ? (
                    <span role="alert" className="field-error" style={{ paddingLeft: 48, fontWeight: 600 }}>
                      {message}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : error ? (
        <div className="empty" role="alert" style={{ padding: "20px 0" }}>
          <strong>We couldn&apos;t load your wallets</strong>
          <span>{errorMessage(error)}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()} style={{ marginTop: 8 }}>
            Try again
          </button>
        </div>
      ) : (
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column" }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="skeleton" style={{ width: 120, height: 14 }} />
                <span className="skeleton" style={{ width: 240, maxWidth: "100%", height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <AddWallet
        existing={wallets ?? []}
        onAdded={(w) => {
          setFreshId(w.id);
          toast(addedMessage(w));
        }}
      />

      <span style={{ fontSize: 13, color: "var(--slate)" }}>
        We check that the account exists on Testnet and has a USDC trustline before it can receive a request. Public addresses only, never a secret key.
      </span>

      <Dialog
        open={target !== null}
        onClose={closeRemove}
        title={`Remove ${target ? walletName(target) : "this wallet"}?`}
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeRemove} disabled={removing} aria-busy={removing} style={{ fontSize: 15 }}>
              Keep wallet
            </button>
            <button type="button" className="btn" onClick={remove} disabled={removing} aria-busy={removing} style={{ fontSize: 15, background: "var(--error)", color: "#FFFFFF" }}>
              {removing ? "Removing…" : "Remove wallet"}
            </button>
          </>
        }
      >
        <span style={{ fontSize: 15, color: "var(--slate)", lineHeight: 1.5 }}>
          New requests can no longer use it. Open requests on it keep working until they close. The wallet itself and its funds are untouched.
          {target && target.id === defaultId ? " It is your default, so new requests will have no wallet picked for you." : ""}
        </span>
        {target ? (
          <span className="mono" style={{ fontSize: 12, color: "var(--slate)", overflowWrap: "anywhere" }}>
            {target.address}
          </span>
        ) : null}
        {removeError ? (
          <div role="alert" className="alert">
            {removeError}
          </div>
        ) : null}
      </Dialog>
    </Section>
  );
}

/** The add row: a name, a public address (typed, pasted or filled from Freighter), and the checks the API answers with. */
function AddWallet({ existing, onAdded }: { existing: Wallet[]; onAdded: (wallet: Wallet) => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [label, setLabel] = useState("");
  const [addr, setAddr] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  /** What the API or Freighter said, shown until the fields are edited. */
  const [serverError, setServerError] = useState<string | null>(null);

  const a = addr.trim();
  const isSecret = looksLikeSecret(a);
  const labelMissing = !label.trim();
  const addrErr = isSecret ? "" : addressProblem(a, existing);
  const localError = labelMissing ? "Give the wallet a name you will recognise when creating a request." : addrErr;
  const shownError = isSecret ? "" : tried && localError ? localError : (serverError ?? "");
  const addrInvalid = isSecret || (tried && !labelMissing && !!addrErr);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A secret key is never sent anywhere.
    if (isSecret || busy) return;
    setServerError(null);
    if (localError) {
      setTried(true);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ wallet: Wallet }>(WALLETS, { address: a, label: label.trim() });
      setAddr("");
      setLabel("");
      setTried(false);
      await Promise.all([mutate(WALLETS), mutate("/auth/me")]);
      onAdded(res.wallet);
    } catch (err) {
      setTried(false);
      if (err instanceof ApiError && err.code === "SECRET_KEY_REJECTED") {
        setAddr("");
        setServerError("That was a secret key, so we cleared it. Paste the public address (starts with G) instead.");
      } else if (err instanceof ApiError && err.code === "WALLET_TAKEN") {
        setServerError("This wallet is already registered with PayBridge. Use a different address.");
      } else if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const labelMsg = err.field("label");
        setServerError(labelMsg && !err.field("address") ? `Name: ${labelMsg}` : "That isn't a valid Stellar public address. Check it and paste it again.");
      } else {
        setServerError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const fillFromFreighter = async () => {
    if (connecting) return;
    setConnecting(true);
    setServerError(null);
    try {
      const address = await connectFreighter();
      setAddr(address);
      setLabel((current) => current || "Freighter");
      setTried(false);
      toast("Freighter connected · Testnet");
    } catch (err) {
      setServerError(err instanceof FreighterError ? err.message : errorMessage(err));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className={styles.addRow}>
        <input
          className={`input${tried && labelMissing ? " invalid" : ""}`}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setTried(false);
            setServerError(null);
          }}
          placeholder="Name, e.g. Shop float"
          aria-label="Wallet name"
          aria-invalid={tried && labelMissing ? true : undefined}
          maxLength={64}
          style={{ flex: "1 1 150px", width: "auto", minWidth: 0 }}
        />
        <input
          className={`input mono${addrInvalid ? " invalid" : ""}`}
          value={addr}
          onChange={(e) => {
            setAddr(e.target.value);
            setTried(false);
            setServerError(null);
          }}
          placeholder="G… public address"
          aria-label="Wallet address"
          aria-invalid={addrInvalid ? true : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{ flex: "3 1 200px", width: "auto", minWidth: 0, fontSize: 13 }}
        />
        <button type="submit" className="btn btn-secondary" disabled={busy || isSecret} aria-busy={busy} style={{ padding: "0 18px", fontSize: 15 }}>
          {busy ? "Checking…" : "Add wallet"}
        </button>
      </div>

      {isSecret ? (
        <div role="alert" className="anim-pop" style={{ background: "var(--alert-bg)", border: "1.5px solid var(--error-border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontWeight: 800, color: "var(--alert-fg)" }}>Stop. That&apos;s a secret key.</span>
          <span style={{ fontSize: 14, color: "var(--alert-fg)" }}>
            Secret keys start with S and give full control of a wallet. PayBridge never asks for one, and this one has not been sent anywhere. Clear it now, and if you&apos;ve
            shared it anywhere, move your funds to a new wallet.
          </span>
          <button type="button" className="btn" onClick={() => setAddr("")} style={{ alignSelf: "flex-start", height: 42, background: "var(--error)", color: "#FFFFFF", fontSize: 15 }}>
            Clear it
          </button>
        </div>
      ) : null}
      {shownError ? (
        <span role="alert" className="field-error" style={{ fontWeight: 600 }}>
          {shownError}
        </span>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fillFromFreighter} disabled={connecting} aria-busy={connecting} style={{ height: 38, padding: "0 14px", borderColor: "var(--border)" }}>
          <Icon name="wallets" size={14} />
          {connecting ? "Waiting for Freighter…" : "Connect Freighter"}
        </button>
      </div>
    </form>
  );
}
