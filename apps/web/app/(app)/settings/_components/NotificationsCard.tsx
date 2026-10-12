"use client";

import type { Merchant } from "@/lib/types";
import { Section, SwitchRow } from "./Section";
import { useSaveSetting } from "./useSaveSetting";

/** Two email switches. Each saves the moment it is flipped. */
export function NotificationsCard({ merchant }: { merchant: Merchant }) {
  const { save, error } = useSaveSetting(merchant);
  return (
    <Section title="Notifications" sub={<>Email to {merchant.email}.</>}>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <SwitchRow
          label="Every payment"
          description="One email the moment a request is verified as Paid."
          checked={merchant.notifyPaid}
          onChange={(on) => void save({ notifyPaid: on }, on ? "You'll get an email for every payment" : "Payment emails are off")}
        />
        <SwitchRow
          label="Problems"
          description="Underpaid, wrong asset, paid late, paid twice, or a payment we couldn't match to a request."
          checked={merchant.notifyProblems}
          onChange={(on) => void save({ notifyProblems: on }, on ? "You'll get an email when something needs a look" : "Problem emails are off")}
        />
      </div>
    </Section>
  );
}
