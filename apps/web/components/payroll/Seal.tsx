import type { RunStatus } from "@/lib/types";

/** The rubber stamp on a finished run: PAID in green, PARTLY PAID in red. Decorative; the status pill says it too. */
export function Seal({ status, date }: { status: RunStatus; date: string | null }) {
  if (status !== "PAID" && status !== "PARTIAL") return null;
  const day = date ? new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() : "";
  return (
    <span aria-hidden="true" className={`seal ${status === "PAID" ? "seal-paid" : "seal-partial"}`}>
      {status === "PAID" ? "Paid" : "Partly paid"}
      {day ? <small>{day}</small> : null}
    </span>
  );
}
