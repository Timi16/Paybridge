"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { ItemStatusPill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { api, errorMessage } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { formatAmount, formatDateTime, shortAddress, shortHash } from "@/lib/format";
import { REASON_FIX, REASON_SHORT } from "@/lib/payroll";
import type { ItemStatus, Run, RunItem } from "@/lib/types";

type Filter = "all" | ItemStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PAID", label: "Paid" },
  { id: "FAILED", label: "Not sent" },
  { id: "SENDING", label: "Sending" },
  { id: "PENDING", label: "To pay" },
  { id: "CANCELLED", label: "Cancelled" },
];

const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;

/** A draft line's amount, saved when the field loses focus (or on Enter). */
function AmountCell({ run, item }: { run: Run; item: RunItem }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const initial = formatAmount(item.amount, 2).replace(/,/g, "");
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const v = value.trim().replace(/,/g, "");
    if (v === initial) return setError(null);
    if (!AMOUNT.test(v) || !/[1-9]/.test(v)) return setError("Enter an amount above 0, up to 7 decimals.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ run: Run }>(`/v1/payroll-runs/${run.id}/items/${item.id}`, { amount: v });
      await mutate(`/v1/payroll-runs/${run.id}`, res, { revalidate: false });
      toast(`${item.name}: ${formatAmount(v)} USDC`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <input
        className={`input amount${error ? " invalid" : ""}`}
        style={{ width: 150, height: 38 }}
        value={value}
        inputMode="decimal"
        aria-label={`Amount for ${item.name}, USDC`}
        aria-invalid={Boolean(error)}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {error ? <span className="field-error" style={{ fontSize: 12, maxWidth: 180, textAlign: "right" }}>{error}</span> : null}
    </div>
  );
}

function Outcome({ item }: { item: RunItem }) {
  if (item.status === "PAID" && item.txHash) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        <a href={explorerTx(item.txHash)} target="_blank" rel="noreferrer" className="hash" title={item.txHash}>
          {shortHash(item.txHash)} <Icon name="external" size={12} />
        </a>
        <CopyButton value={item.txHash} className="btn-link" label="Copy" ariaLabel={`Copy the transaction hash for ${item.name}`} style={{ fontSize: 12 }} />
      </span>
    );
  }
  if (item.status === "FAILED" && item.failureCode) {
    return (
      <span className="why" title={REASON_FIX[item.failureCode]}>
        {REASON_SHORT[item.failureCode]} · nothing sent
      </span>
    );
  }
  return null;
}

export function Lines({ run }: { run: Run }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const draft = run.status === "DRAFT";
  const count = (f: Filter) => (f === "all" ? run.items.length : run.items.filter((i) => i.status === f).length);
  const shown = filter === "all" ? run.items : run.items.filter((i) => i.status === filter);

  const remove = async (item: RunItem) => {
    try {
      const res = await api.delete<{ run: Run }>(`/v1/payroll-runs/${run.id}/items/${item.id}`);
      await mutate(`/v1/payroll-runs/${run.id}`, res, { revalidate: false });
      toast(`${item.name} removed from this run`);
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  return (
    <>
      {!draft && run.items.length > 0 ? (
        <div style={{ padding: "0 28px 14px" }}>
          <div className="seg" role="group" aria-label="Filter payments by status">
            {FILTERS.filter((f) => f.id === "all" || count(f.id) > 0).map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
                <span className="count">{count(f.id)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {run.items.length === 0 ? (
        <div className="empty">
          <strong>Nobody on this run yet</strong>
          <span>Add people or whole groups.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table stack">
            <thead>
              <tr>
                <th className="hide-sm">#</th>
                <th>Person</th>
                <th className="num">Amount (USDC)</th>
                <th>{draft ? "" : "Status"}</th>
                {!draft ? <th className="hide-sm">Paid at</th> : null}
                {draft ? (
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td className="idx hide-sm">{String(item.position).padStart(2, "0")}</td>
                  <td>
                    <span className="who">
                      <b>{item.name}</b>
                      <span title={item.walletAddress}>{shortAddress(item.walletAddress, 5, 5)}</span>
                    </span>
                  </td>
                  <td className="num">{draft ? <AmountCell run={run} item={item} /> : formatAmount(item.amount)}</td>
                  <td className="full">
                    {draft ? null : (
                      <>
                        <ItemStatusPill status={item.status} />
                        {item.batchNumber && item.status === "SENDING" ? <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>batch {item.batchNumber}</span> : null}
                        <div>
                          <Outcome item={item} />
                        </div>
                      </>
                    )}
                  </td>
                  {!draft ? (
                    <td className="hide-sm muted" style={{ fontSize: 13 }}>
                      {item.paidAt ? (
                        <>
                          {formatDateTime(item.paidAt)}
                          <div className="faint mono" style={{ fontSize: 11 }}>
                            ledger {item.ledger}
                            {item.batchNumber ? ` · batch ${item.batchNumber}` : ""}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                  {draft ? (
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="icon-btn" aria-label={`Remove ${item.name} from this run`} onClick={() => void remove(item)}>
                        <Icon name="x" size={16} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
