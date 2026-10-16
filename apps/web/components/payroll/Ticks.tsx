import type { ItemStatus } from "@/lib/types";

const CLASS: Record<ItemStatus, string> = { PENDING: "", SENDING: "sending", PAID: "paid", FAILED: "failed", CANCELLED: "cancelled" };

/**
 * One tick per person, in run order: paid, sending (striped), not sent, cancelled, still to pay.
 * Above 120 people the ticks would be hairlines, so the same story is told as a joined bar.
 * The counts are always written out next to it; this is the picture, not the only record.
 */
export function Ticks({ statuses, label }: { statuses: ItemStatus[]; label: string }) {
  if (statuses.length === 0) return null;
  if (statuses.length > 120) {
    const order: ItemStatus[] = ["PAID", "SENDING", "FAILED", "CANCELLED", "PENDING"];
    return (
      <div className="ticks bar" role="img" aria-label={label}>
        {order.map((s) => {
          const n = statuses.filter((x) => x === s).length;
          return n ? <i key={s} className={CLASS[s]} style={{ flex: n }} /> : null;
        })}
      </div>
    );
  }
  return (
    <div className="ticks" role="img" aria-label={label}>
      {statuses.map((s, i) => (
        <i key={i} className={CLASS[s]} style={{ animationDelay: `${Math.min(i, 40) * 12}ms` }} />
      ))}
    </div>
  );
}

/** "6 paid · 1 sending · 1 not sent · 2 to pay", skipping zeros. */
export function countsText(c: { paid: number; sending: number; failed: number; pending: number; cancelled: number }): string {
  const parts = [
    c.paid ? `${c.paid} paid` : "",
    c.sending ? `${c.sending} sending` : "",
    c.failed ? `${c.failed} not sent` : "",
    c.pending ? `${c.pending} to pay` : "",
    c.cancelled ? `${c.cancelled} cancelled` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nobody yet";
}
