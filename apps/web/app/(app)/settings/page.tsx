"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { Reveal } from "@/components/motion/Reveal";
import { useToast } from "@/components/Toast";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/session";
import type { Merchant } from "@/lib/types";
import { BusinessCard, type BusinessErrors, type BusinessValue } from "./_components/BusinessCard";
import { CloseAccountCard } from "./_components/CloseAccountCard";
import { NetworkCard } from "./_components/NetworkCard";
import { NotificationsCard } from "./_components/NotificationsCard";
import { PayPageCard, type PayPageValue } from "./_components/PayPageCard";
import { SecurityCard } from "./_components/SecurityCard";
import styles from "./_components/settings.module.css";
import { WalletsCard } from "./_components/WalletsCard";

/** The fields the header's Save button saves together. */
type Draft = BusinessValue & PayPageValue;

function normaliseWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

function websiteProblem(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) throw new Error("not a web address");
    return null;
  } catch {
    return "Use a full web address, like https://yourshop.com.";
  }
}

export default function SettingsPage() {
  // The app layout only renders pages once the merchant is loaded.
  const { merchant } = useMe();
  if (!merchant) return null;
  return <Settings merchant={merchant} />;
}

function Settings({ merchant }: { merchant: Merchant }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();

  const saved: Draft = {
    name: merchant.businessName,
    website: merchant.website ?? "",
    support: merchant.supportContact ?? "",
    color: merchant.brandColor.toUpperCase(),
    expiry: merchant.defaultExpiryMinutes,
    assets: merchant.acceptedAssets,
  };
  // Only what was edited; everything else follows what is saved.
  const [draft, setDraft] = useState<Partial<Draft>>({});
  const [errors, setErrors] = useState<BusinessErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const value: Draft = { ...saved, ...draft };
  const changed = {
    name: value.name.trim() !== saved.name,
    website: normaliseWebsite(value.website) !== saved.website,
    support: value.support.trim() !== saved.support,
    color: value.color !== saved.color,
    expiry: value.expiry !== saved.expiry,
    assets: value.assets !== saved.assets,
  };
  const dirty = Object.values(changed).some(Boolean);

  // The sidebar's Testnet tag links to /settings#network; the section only exists once this renders.
  useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, []);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key as keyof BusinessErrors];
      return next;
    });
  };

  const discard = () => {
    setDraft({});
    setErrors({});
    setError(null);
  };

  const save = async () => {
    if (busy || !dirty) return;
    const name = value.name.trim();
    const website = normaliseWebsite(value.website);
    const support = value.support.trim();

    const problems: BusinessErrors = {};
    if (!name) problems.name = "Your business needs a name.";
    const site = changed.website ? websiteProblem(website) : null;
    if (site) problems.website = site;
    if (changed.support && support && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support)) problems.support = "Enter an email address, like help@yourshop.com.";
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById(problems.name ? "biz" : problems.website ? "site" : "support")?.focus();
      return;
    }

    const patch: Partial<Merchant> = {};
    if (changed.name) patch.businessName = name;
    if (changed.website) patch.website = website || null;
    if (changed.support) patch.supportContact = support || null;
    if (changed.color) patch.brandColor = value.color;
    if (changed.expiry) patch.defaultExpiryMinutes = value.expiry;
    if (changed.assets) patch.acceptedAssets = value.assets;

    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ merchant: Merchant }>("/auth/settings", patch);
      await mutate("/auth/me", res, { revalidate: false });
      setDraft({});
      toast("Saved");
    } catch (err) {
      const fields: BusinessErrors = {};
      if (err instanceof ApiError) {
        const n = err.field("businessName");
        const w = err.field("website");
        const s = err.field("supportContact");
        if (n) fields.name = n;
        if (w) fields.website = w;
        if (s) fields.support = s;
      }
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 className="h1">Settings</h1>
          <span className="sub">Business, receiving wallets, pay page, network.</span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {dirty && !busy ? (
            <button type="button" className={`btn-link ${styles.discard}`} onClick={discard} style={{ fontSize: 14, color: "var(--slate)" }}>
              Discard
            </button>
          ) : null}
          <span className={`${styles.saveWrap}${dirty && !busy ? ` ${styles.saveDirty}` : ""}`}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || busy} aria-busy={busy} style={{ fontSize: 15 }}>
              {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </span>
        </div>
      </div>

      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.grid}>
        <div className={`${styles.column} stagger`}>
          <div>
            <WalletsCard merchant={merchant} />
          </div>
          <div>
            <Reveal>
              <BusinessCard value={value} errors={errors} onChange={edit} onSubmit={save} />
            </Reveal>
          </div>
          <div>
            <Reveal>
              <NotificationsCard merchant={merchant} />
            </Reveal>
          </div>
        </div>
        <div className={`${styles.column} stagger`}>
          <div>
            <PayPageCard merchant={merchant} value={value} businessName={value.name} onChange={edit} />
          </div>
          <div>
            <Reveal>
              <NetworkCard />
            </Reveal>
          </div>
          <div>
            <Reveal>
              <SecurityCard email={merchant.email} />
            </Reveal>
          </div>
          <div>
            <Reveal from="scale">
              <CloseAccountCard businessName={merchant.businessName} />
            </Reveal>
          </div>
        </div>
      </div>
    </>
  );
}
