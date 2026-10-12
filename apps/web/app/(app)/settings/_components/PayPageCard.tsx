"use client";

import useSWR from "swr";
import { Icon } from "@/components/Icon";
import { useNewRequest } from "@/components/NewRequest";
import { formatAmount, initials } from "@/lib/format";
import { usePollWhenOffline } from "@/lib/live";
import type { Merchant, Page, PaymentRequest } from "@/lib/types";
import { Section, SwitchRow } from "./Section";
import styles from "./settings.module.css";
import { useSaveSetting } from "./useSaveSetting";

export type AcceptedAssets = Merchant["acceptedAssets"];

export interface PayPageValue {
  /** "#RRGGBB", upper case. */
  color: string;
  expiry: number;
  assets: AcceptedAssets;
}

const COLORS: { hex: string; name: string }[] = [
  { hex: "#1E4FD6", name: "Bridge blue" },
  { hex: "#0F766E", name: "Teal" },
  { hex: "#0F172A", name: "Ink" },
  { hex: "#B45309", name: "Amber" },
  { hex: "#7C3AED", name: "Violet" },
];

const EXPIRY_OPTIONS = [15, 30, 60, 1440];

function expiryLabel(minutes: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes % 1440 === 0 && minutes > 1440) return plural(minutes / 1440, "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");
  return plural(minutes, "minute");
}

const ASSET_OPTIONS: { value: AcceptedAssets; label: string }[] = [
  { value: "BOTH", label: "USDC and XLM" },
  { value: "USDC", label: "USDC only" },
  { value: "XLM", label: "XLM only" },
];

/** White or ink, whichever reads on the chosen colour. */
function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const brightness = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return brightness > 160 ? "#0F172A" : "#FFFFFF";
}

interface Props {
  merchant: Merchant;
  value: PayPageValue;
  /** The business name as typed, saved or not, so the preview follows it. */
  businessName: string;
  onChange: (patch: Partial<PayPageValue>) => void;
}

export function PayPageCard({ merchant, value, businessName, onChange }: Props) {
  const { save, error } = useSaveSetting(merchant);
  const newRequest = useNewRequest();
  // The newest request still waiting for payment: the real page the preview link opens.
  const { data: openData } = useSWR<Page<PaymentRequest>>("/v1/payment-requests?status=PENDING&limit=1", { refreshInterval: usePollWhenOffline() });
  const open = openData?.data[0];

  const swatches = COLORS.some((c) => c.hex === value.color) ? COLORS : [...COLORS, { hex: value.color, name: `Custom ${value.color}` }];
  const colorName = swatches.find((c) => c.hex === value.color)?.name ?? value.color;
  const expiryOptions = EXPIRY_OPTIONS.includes(value.expiry) ? EXPIRY_OPTIONS : [...EXPIRY_OPTIONS, value.expiry].sort((a, b) => a - b);
  const name = businessName.trim() || merchant.businessName;
  const ink = textOn(value.color);

  return (
    <Section title="Pay page" sub="What the customer sees when they open a link.">
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span id="brand-colour" style={{ fontSize: 14, fontWeight: 700 }}>
          Brand colour
        </span>
        <div role="group" aria-labelledby="brand-colour" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {swatches.map((c) => (
            <button key={c.hex} type="button" className={styles.swatch} aria-label={c.name} aria-pressed={value.color === c.hex} onClick={() => onChange({ color: c.hex })} style={{ background: c.hex }} />
          ))}
          <span aria-live="polite" style={{ fontSize: 13, color: "var(--slate)", marginLeft: 6 }}>
            {colorName}
          </span>
        </div>
      </div>

      <div className={styles.two}>
        <div className="field">
          <label htmlFor="expiry" className="label">
            Link expires after
          </label>
          <select id="expiry" className="select" value={String(value.expiry)} onChange={(e) => onChange({ expiry: Number.parseInt(e.target.value, 10) })} style={{ padding: "0 10px" }}>
            {expiryOptions.map((m) => (
              <option key={m} value={String(m)}>
                {expiryLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assets" className="label">
            Assets you accept
          </label>
          <select id="assets" className="select" value={value.assets} onChange={(e) => onChange({ assets: e.target.value as AcceptedAssets })} style={{ padding: "0 10px" }}>
            {ASSET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <SwitchRow
          label="Count payments within 0.5% as paid"
          description="Forgives tiny shortfalls from wallet rounding. Applies to requests created from now on."
          checked={merchant.toleranceBps > 0}
          onChange={(on) => void save({ toleranceBps: on ? 50 : 0 }, on ? "New requests forgive a shortfall of up to 0.5%" : "New requests need the exact amount")}
        />
        <SwitchRow
          label="Match payments with no memo by exact amount"
          description="Saves you matching by hand, but it trusts the amount alone: an unrelated payment of the same amount would be applied too."
          checked={merchant.autoMatchByAmount}
          onChange={(on) => void save({ autoMatchByAmount: on }, on ? "Payments with no memo are matched by exact amount" : "Payments with no memo wait for you to match them")}
        />
      </div>

      <div className={styles.preview} aria-label="Preview of the pay page header">
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--slate)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Preview</span>
        <div className={styles.previewCard}>
          <div className={styles.previewBar} style={{ backgroundColor: value.color }} />
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div aria-hidden="true" className={styles.previewAvatar} style={{ backgroundColor: value.color, color: ink }}>
                {initials(name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span key={name} className={styles.previewName} style={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>
                  {name}
                </span>
                <span style={{ fontSize: 13, color: "var(--slate)", overflowWrap: "anywhere" }}>{open?.description || "What the payment is for shows here"}</span>
              </div>
            </div>
            <div className={styles.previewPay} style={{ backgroundColor: value.color, color: ink }}>
              {open ? (
                <span className="tnum">
                  Pay {formatAmount(open.amount)} {open.asset.code}
                </span>
              ) : (
                "Pay"
              )}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: "var(--slate)" }}>
          {open ? "Showing your newest open request. " : ""}Colour and name change here as you pick; customers see them once you save.
        </span>
      </div>

      {open ? (
        <a href={open.checkoutUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: "0 18px", fontSize: 15, alignSelf: "flex-start" }}>
          <Icon name="qr" size={16} />
          Preview the pay page<span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", fontSize: 13, color: "var(--slate)" }}>
          <span>The real page opens from an open request, and you have none right now.</span>
          <button type="button" className="btn-link" onClick={() => newRequest()} style={{ fontSize: 13 }}>
            Create a request
          </button>
        </div>
      )}
    </Section>
  );
}
