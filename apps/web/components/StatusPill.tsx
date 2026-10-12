import { displayStatus, PAYMENT_OUTCOME, REQUEST_STATUS, type IconName, type PillTone } from "@/lib/status";
import type { PaymentOutcome, PaymentRequest, RequestStatus } from "@/lib/types";
import { Icon } from "./Icon";

export function Pill({ tone, icon, children }: { tone: PillTone; icon?: IconName; children: React.ReactNode }) {
  return (
    <span className={`pill pill-${tone}`}>
      {icon ? <Icon name={icon} size={12} strokeWidth={2.5} /> : null}
      {children}
    </span>
  );
}

/** The PayBridge view of a request: status plus the derived "wrong asset" and "refunded" states. */
export function RequestPill({ request }: { request: Pick<PaymentRequest, "status" | "refundDue" | "refundedAt" | "asset"> }) {
  const spec = displayStatus(request);
  return (
    // Keyed by state so the pill flips when the status changes live.
    <Pill key={spec.key} tone={spec.tone} icon={spec.icon}>
      {spec.label}
    </Pill>
  );
}

export function RequestStatusPill({ status }: { status: RequestStatus }) {
  const spec = REQUEST_STATUS[status];
  return (
    <Pill tone={spec.tone} icon={spec.icon}>
      {spec.label}
    </Pill>
  );
}

export function OutcomePill({ outcome }: { outcome: PaymentOutcome }) {
  const spec = PAYMENT_OUTCOME[outcome];
  return (
    <Pill tone={spec.tone} icon={spec.icon}>
      {spec.label}
    </Pill>
  );
}
