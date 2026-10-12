"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { Dialog } from "@/components/Dialog";
import { api, errorMessage } from "@/lib/api";
import { Section } from "./Section";
import styles from "./settings.module.css";

const WORD = "CLOSE";

export function CloseAccountCard({ businessName }: { businessName: string }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = text.trim().toUpperCase();
  const ok = typed === WORD;
  // How many letters are right so far; the tiles light up one by one.
  let matched = 0;
  while (matched < WORD.length && typed[matched] === WORD[matched]) matched++;
  if (typed.length > WORD.length) matched = 0;

  const ask = () => {
    setText("");
    setError(null);
    setOpen(true);
  };

  const close = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/close", { confirm: WORD });
      // Drop every cached response: nothing of this account may stay in the browser.
      await mutate(() => true, undefined, { revalidate: false });
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Section danger gap={12} title="Close this account" sub="Open requests expire. Your wallets and their funds are untouched, they were never ours.">
      <button type="button" className="btn btn-secondary" onClick={ask} style={{ padding: "0 18px", fontSize: 15, color: "var(--error)", alignSelf: "flex-start" }}>
        Close account…
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Close ${businessName} on PayBridge?`} width={480}>
        <form onSubmit={close} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 14, color: "var(--slate)", lineHeight: 1.5 }}>
            Open requests expire immediately and you&apos;ll be signed out. Your wallets and their funds are untouched. Type <strong style={{ color: "var(--ink)" }}>CLOSE</strong> to
            confirm.
          </span>
          <div className={styles.letters} aria-hidden="true">
            {WORD.split("").map((letter, i) => (
              <span key={letter} className={`mono ${styles.letter}${i < matched ? ` ${styles.letterOn}` : ""}`}>
                {letter}
              </span>
            ))}
          </div>
          <input
            className="input mono"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder="CLOSE"
            aria-label="Type CLOSE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            style={{ textTransform: "uppercase" }}
          />
          {error ? (
            <div role="alert" className="alert">
              {error}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy} aria-busy={busy} style={{ padding: "0 18px", fontSize: 15 }}>
              Keep account
            </button>
            <button type="submit" className={`btn ${styles.closeBtn}${ok ? ` ${styles.closeBtnOn}` : ""}`} disabled={!ok || busy} aria-busy={busy} style={{ fontSize: 15 }}>
              {busy ? "Closing…" : "Close account"}
            </button>
          </div>
        </form>
      </Dialog>
    </Section>
  );
}
