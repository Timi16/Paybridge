"use client";

import { useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { initials } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Merchant } from "@/lib/types";
import styles from "../onboarding.module.css";
import { BRAND_COLOURS, CheckIcon, markBusinessStepSeen, useShake } from "./shared";

/** "" when empty, a full http(s) address when valid, null when it cannot be one. */
function normaliseWebsite(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".") || withScheme.length > 200) return null;
    return withScheme;
  } catch {
    return null;
  }
}

function hostOf(website: string | null): string {
  if (!website) return "";
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function StepBusiness({ merchant, className, onDone }: { merchant: Merchant; className: string; onDone: () => void }) {
  const { mutate } = useMe();
  const { shake, shakeClass } = useShake();
  const [name, setName] = useState(merchant.businessName);
  const [site, setSite] = useState(merchant.website ?? "");
  const [colour, setColour] = useState(merchant.brandColor.toUpperCase());
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteApiError, setSiteApiError] = useState<string | null>(null);

  const website = normaliseWebsite(site);
  const nameBad = tried && name.trim().length < 2;
  const siteError = tried && website === null ? "That does not look like a web address. Try https://yourstore.com, or leave it empty." : siteApiError;
  // A colour set elsewhere (Settings) stays on offer, so this step never replaces it silently.
  const colours = BRAND_COLOURS.some((c) => c.hex === colour) ? BRAND_COLOURS : [...BRAND_COLOURS, { hex: colour, name: "Your current colour" }];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (busy) return;
    if (name.trim().length < 2 || website === null) {
      shake();
      return;
    }
    setBusy(true);
    setError(null);
    setSiteApiError(null);
    try {
      const res = await api.post<{ merchant: Merchant }>("/auth/settings", { businessName: name.trim(), website: website || null, brandColor: colour });
      await mutate(res, { revalidate: false });
      markBusinessStepSeen(merchant.id);
      onDone();
    } catch (err) {
      const siteMessage = err instanceof ApiError && err.code === "VALIDATION_FAILED" ? err.field("website") : undefined;
      if (siteMessage) setSiteApiError(`Website: ${siteMessage}`);
      else setError(errorMessage(err));
      shake();
      setBusy(false);
    }
  };

  const shownName = name.trim() || "Your business";

  return (
    <form onSubmit={save} noValidate className={className}>
      <div className={styles.head}>
        <h1 className="h1">What customers will see</h1>
        <span className="sub">Shown on every checkout page and receipt.</span>
      </div>
      <div className={styles.box}>
        <div className="field">
          <label htmlFor="ob-biz" className="label">
            Business name
          </label>
          <div className={shakeClass(nameBad)}>
            <input
              id="ob-biz"
              type="text"
              className={`input${nameBad ? " invalid" : ""}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lumi Store"
              maxLength={100}
              autoComplete="organization"
              aria-invalid={nameBad || undefined}
            />
          </div>
          {nameBad ? (
            <span role="alert" className="field-error">
              Tell us the business name customers will see on checkout.
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="ob-site" className="label">
            Website <span className={styles.optional}>(optional)</span>
          </label>
          <div className={shakeClass(!!siteError)}>
            <input
              id="ob-site"
              type="url"
              inputMode="url"
              className={`input${siteError ? " invalid" : ""}`}
              value={site}
              onChange={(e) => {
                setSite(e.target.value);
                setSiteApiError(null);
              }}
              placeholder="https://yourstore.com"
              maxLength={200}
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!siteError || undefined}
              aria-describedby="ob-site-hint"
            />
          </div>
          {siteError ? (
            <span role="alert" className="field-error">
              {siteError}
            </span>
          ) : null}
          <span id="ob-site-hint" className="hint">
            The pay page links back to it after a payment.
          </span>
        </div>
        <div className="field" style={{ gap: 10 }}>
          <span className="label" id="ob-colour-label">
            Brand colour on checkout
          </span>
          <div className={styles.swatches} role="group" aria-labelledby="ob-colour-label">
            {colours.map((c) => (
              <button key={c.hex} type="button" className={styles.swatch} aria-label={c.name} aria-pressed={colour === c.hex} title={c.name} onClick={() => setColour(c.hex)} style={{ background: c.hex }}>
                {colour === c.hex ? <CheckIcon size={14} /> : null}
              </button>
            ))}
          </div>
          {/* A small picture of the pay page header, built from what is typed above. */}
          <div className={styles.preview} aria-label="How the top of your pay page will look">
            <span className={styles.previewLogo} style={{ backgroundColor: colour }} aria-hidden="true">
              {initials(shownName)}
            </span>
            <span className={styles.previewText}>
              <span style={{ fontWeight: 700 }}>{shownName}</span>
              <span className="hint">{hostOf(website) || "Pay page preview"}</span>
            </span>
            <span className={styles.previewPay} style={{ backgroundColor: colour }} aria-hidden="true">
              Pay
            </span>
          </div>
        </div>
        {error ? (
          <div role="alert" className="alert">
            {error}
          </div>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy} style={{ fontSize: 15 }}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </form>
  );
}
