"use client";

import { useEffect, useState } from "react";
import { HORIZON_URL } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import { fromStroops } from "./shared";

/**
 * The fee a transaction really paid, read from Horizon (`fee_charged`, in stroops of XLM).
 * Null until known, and it stays null if Horizon can't say, so the row is simply not shown.
 */
export function useNetworkFee(txHash: string | null): string | null {
  const [fee, setFee] = useState<{ hash: string; text: string } | null>(null);
  useEffect(() => {
    if (!txHash) return;
    let cancelled = false;
    fetch(`${HORIZON_URL}/transactions/${txHash}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ fee_charged?: string | number }>) : null))
      .then((tx) => {
        const charged = tx?.fee_charged === undefined ? "" : String(tx.fee_charged);
        if (!cancelled && /^\d{1,15}$/.test(charged)) setFee({ hash: txHash, text: `${formatAmount(fromStroops(BigInt(charged)), 5)} XLM` });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [txHash]);
  return fee && fee.hash === txHash ? fee.text : null;
}
