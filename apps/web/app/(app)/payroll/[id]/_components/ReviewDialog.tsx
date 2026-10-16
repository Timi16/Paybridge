"use client";

import useSWR from "swr";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { errorMessage } from "@/lib/api";
import { formatAmount, shortAddress } from "@/lib/format";
import { FUNDING_PROBLEM, REASON_FIX, REASON_SHORT } from "@/lib/payroll";
import type { Run, RunCheck } from "@/lib/types";

/**
 * The last look before signing: Stellar is asked, fresh, who can receive and whether the funding
 * wallet covers it. People who can't receive are shown by name and left out; nothing is sent to them.
 */
export function ReviewDialog({ run, open, onClose, onPay }: { run: Run; open: boolean; onClose: () => void; onPay: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<{ check: RunCheck }>(open ? `/v1/payroll-runs/${run.id}/check` : null, { revalidateOnFocus: false });
  const check = data?.check;
  const byId = new Map(run.items.map((i) => [i.id, i]));
  const excluded = check?.lines.filter((l) => !l.ok) ?? [];
  const batches = check ? Math.max(1, Math.ceil(check.payableCount / 100)) : 1;
  const canPay = check && check.payableCount > 0 && check.funding.enough;

  return (
    <Dialog open={open} onClose={onClose} title="Review and pay" width={600}>
      {isLoading || (!check && !error) ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }} className="muted">
          <span className="spinner" aria-hidden="true" /> Checking every wallet on Stellar Testnet…
        </div>
      ) : error ? (
        <>
          <div role="alert" className="alert">
            {errorMessage(error)}
          </div>
          <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => void mutate()}>
            Check again
          </button>
        </>
      ) : check ? (
        <>
          <div className="sheet stub" style={{ padding: "22px 24px", boxShadow: "none" }}>
            <dl className="ledger">
              <dt>People to pay</dt>
              <dd>{check.payableCount}</dd>
              <dt>Pay from</dt>
              <dd>{shortAddress(check.funding.address)}</dd>
              <dt>USDC in the funding wallet</dt>
              <dd>{check.funding.usdcAvailable !== null ? formatAmount(check.funding.usdcAvailable) : "—"}</dd>
              <dt>Network fees, at most</dt>
              <dd>{formatAmount(check.funding.feeXlm, 2)} XLM</dd>
              <dt>Signatures in Freighter</dt>
              <dd>
                {batches} {batches === 1 ? "(one transaction)" : `(${batches} transactions of up to 100)`}
              </dd>
            </dl>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, gap: 12, flexWrap: "wrap" }}>
              <span className="eyebrow">Total to send</span>
              <span className="money total-rule" style={{ fontSize: 40 }}>
                {formatAmount(check.payableTotal)}
                <span className="unit">USDC</span>
              </span>
            </div>
          </div>

          {excluded.length > 0 ? (
            <div className="alert">
              <b>
                {excluded.length} {excluded.length === 1 ? "person" : "people"} can&apos;t receive USDC right now and won&apos;t be paid in this run.
              </b>{" "}
              Nothing is sent to them. Fix their wallets and retry later; the others are paid now.
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {excluded.slice(0, 8).map((l) => {
                  const item = byId.get(l.itemId);
                  return (
                    <li key={l.itemId} title={l.reason ? REASON_FIX[l.reason] : undefined}>
                      {item?.name ?? "Someone"}: {l.reason ? REASON_SHORT[l.reason] : "can't receive"}
                    </li>
                  );
                })}
                {excluded.length > 8 ? <li>and {excluded.length - 8} more</li> : null}
              </ul>
            </div>
          ) : (
            <div className="success">Everyone on this run can receive USDC.</div>
          )}

          {!check.funding.enough && check.funding.problem ? (
            <div role="alert" className="alert">
              <b>{FUNDING_PROBLEM[check.funding.problem]}</b>
              {check.funding.shortBy ? <> It&apos;s {formatAmount(check.funding.shortBy)} USDC short.</> : null} Top it up, then check again.
            </div>
          ) : null}

          <p className="muted" style={{ fontSize: 13 }}>
            <Icon name="shield" size={14} style={{ verticalAlign: "-2px" }} /> Freighter will show you the transaction. PayBridge never sees your secret key, and a
            transaction you don&apos;t sign within 5 minutes can never go through.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" onClick={() => void mutate()}>
              Check again
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={!canPay}
              onClick={() => {
                onClose();
                onPay();
              }}
            >
              <Icon name="freighter" size={18} /> Sign in Freighter and pay
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
