"use client";

import { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { api, ApiError, errorMessage } from "./api";
import { shortAddress } from "./format";
import { connectFreighter, FREIGHTER_MESSAGES, FreighterError, signTransactionWithFreighter } from "./freighter";
import type { Batch, Run, SignableBatch } from "./types";

export type PayPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "preparing" }
  | { kind: "signing"; batch: SignableBatch }
  | { kind: "submitting"; batch: SignableBatch }
  /** Stellar hasn't answered yet; the worker will settle it. */
  | { kind: "confirming"; batch: Batch }
  | { kind: "done" }
  | { kind: "error"; message: string };

function message(err: unknown): string {
  if (err instanceof FreighterError) return err.message || FREIGHTER_MESSAGES[err.code];
  if (err instanceof ApiError || err instanceof Error) return errorMessage(err);
  return "Something went wrong. Nothing more was sent. Try again.";
}

/**
 * Pays a run: starts it if it's a draft, then for each batch asks Freighter to sign with the
 * funding wallet and hands the signed transaction to PayBridge, until nothing is left to sign.
 * Every step is safe to repeat: PayBridge returns the same open batch until it is settled.
 */
export function usePayRun(run: Run) {
  const { mutate } = useSWRConfig();
  const [phase, setPhase] = useState<PayPhase>({ kind: "idle" });
  const running = useRef(false);
  const key = `/v1/payroll-runs/${run.id}`;

  const refresh = useCallback(
    async (next?: Run) => {
      if (next) await mutate(key, { run: next }, { revalidate: false });
      else await mutate(key);
      void mutate("/v1/summary");
    },
    [key, mutate],
  );

  const pay = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      // Make sure Freighter is ready (and on the right account) before anything changes.
      const active = await connectFreighter();
      if (active !== run.wallet.address) {
        throw new FreighterError(
          "WRONG_ACCOUNT",
          `Freighter is on ${shortAddress(active)}. Switch it to the funding wallet ${shortAddress(run.wallet.address)}, then try again.`,
        );
      }
      if (run.status === "DRAFT") {
        setPhase({ kind: "starting" });
        await refresh((await api.post<{ run: Run }>(`/v1/payroll-runs/${run.id}/start`)).run);
      }
      for (let i = 0; i < 50; i++) {
        setPhase({ kind: "preparing" });
        const next = await api.post<{ batch: SignableBatch | null; run: Run }>(`/v1/payroll-runs/${run.id}/batches/next`);
        await refresh(next.run);
        if (!next.batch) {
          const open = next.run.batches.find((b) => b.status === "SUBMITTED");
          setPhase(open ? { kind: "confirming", batch: open } : { kind: "done" });
          return;
        }
        const batch = next.batch;
        setPhase({ kind: "signing", batch });
        const signedXdr = await signTransactionWithFreighter(batch.xdr, run.wallet.address);
        setPhase({ kind: "submitting", batch });
        const res = await api.post<{ batch: Batch; run: Run }>(`/v1/payroll-runs/${run.id}/batches/${batch.id}/submit`, { signedXdr });
        await refresh(res.run);
        if (res.batch.status === "SUBMITTED") {
          setPhase({ kind: "confirming", batch: res.batch });
          return;
        }
      }
      setPhase({ kind: "done" });
    } catch (err) {
      setPhase({ kind: "error", message: message(err) });
      void refresh();
    } finally {
      running.current = false;
    }
  }, [refresh, run.id, run.status, run.wallet.address]);

  const busy = phase.kind === "starting" || phase.kind === "preparing" || phase.kind === "signing" || phase.kind === "submitting";
  return { phase, pay, busy, reset: () => setPhase({ kind: "idle" }) };
}
