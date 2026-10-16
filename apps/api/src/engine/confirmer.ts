import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { PayrollService } from "../modules/payroll/service";

export const CONFIRM_INTERVAL_MS = 5000;

/**
 * Settles every open batch Stellar has a final answer for: found on the ledger (submitted by
 * PayBridge or anywhere else) → confirmed or failed; past its window by ledger close time and
 * not on the ledger → expired. A signed batch with no answer yet is sent again while its window
 * is open (it can only land once); anything else is left for the next tick.
 */
export async function confirmOpenBatches(deps: { prisma: PrismaClient; payroll: PayrollService; logger: Logger }): Promise<number> {
  const open = await deps.prisma.payrollBatch.findMany({
    where: { status: { in: ["AWAITING_SIGNATURE", "SUBMITTED"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let settled = 0;
  for (const batch of open) {
    try {
      if (await deps.payroll.confirm(batch)) settled++;
    } catch (err) {
      deps.logger.warn({ err, batchId: batch.id }, "could not resolve batch yet");
    }
  }
  return settled;
}
