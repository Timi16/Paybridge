"use client";

import { Section } from "./Section";
import styles from "./settings.module.css";

export interface BusinessValue {
  name: string;
  website: string;
  support: string;
}

export type BusinessErrors = Partial<Record<keyof BusinessValue, string>>;

interface Props {
  value: BusinessValue;
  errors: BusinessErrors;
  onChange: (patch: Partial<BusinessValue>) => void;
  /** Enter in a field saves, like the header button. */
  onSubmit: () => void;
}

/** Business name, website and support email. Saved by the header's Save button. */
export function BusinessCard({ value, errors, onChange, onSubmit }: Props) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSubmit();
  };
  const error = (field: keyof BusinessValue) =>
    errors[field] ? (
      <span id={`${field}-error`} className="field-error" role="alert" style={{ fontWeight: 600 }}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <Section title="Business" sub="Shown on the pay page and receipts.">
      <div className={styles.two}>
        <div className="field">
          <label htmlFor="biz" className="label">
            Business name
          </label>
          <input
            id="biz"
            className={`input${errors.name ? " invalid" : ""}`}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            onKeyDown={onKeyDown}
            maxLength={100}
            autoComplete="organization"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {error("name")}
        </div>
        <div className="field">
          <label htmlFor="site" className="label">
            Website
          </label>
          <input
            id="site"
            className={`input${errors.website ? " invalid" : ""}`}
            value={value.website}
            onChange={(e) => onChange({ website: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder="https://"
            inputMode="url"
            autoComplete="url"
            maxLength={200}
            aria-invalid={errors.website ? true : undefined}
            aria-describedby={errors.website ? "website-error" : undefined}
          />
          {error("website")}
        </div>
      </div>
      <div className="field">
        <label htmlFor="support" className="label">
          Support email
        </label>
        <input
          id="support"
          className={`input${errors.support ? " invalid" : ""}`}
          value={value.support}
          onChange={(e) => onChange({ support: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder="help@…"
          inputMode="email"
          autoComplete="email"
          maxLength={100}
          aria-invalid={errors.support ? true : undefined}
          aria-describedby={errors.support ? "support-error" : "support-hint"}
        />
        {error("support")}
        <span id="support-hint" className="hint">
          Customers see it on the pay page. Leave it empty to show none.
        </span>
      </div>
    </Section>
  );
}
