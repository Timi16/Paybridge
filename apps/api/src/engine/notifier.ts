import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { paidEmail, problemEmail, receiptEmail, type ProblemKind } from "../lib/emails";
import type { Mailer } from "../lib/mailer";
import { RESET_EVENT_PREFIX } from "./networkReset";

export const NOTIFY_INTERVAL_MS = 10_000;
/** Payments older than this are never emailed about (e.g. after a long outage). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface NotifierDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  webOrigin: string;
  logger: Logger;
}

/**
 * Emails merchants (and, for paid requests with a customer email, the customer) about
 * payments the worker has recorded. Each payment is claimed before sending, so an email goes
 * out at most once even if the worker restarts; a failed send is logged, not retried.
 */
export async function notifyPayments(deps: NotifierDeps, limit = 25): Promise<number> {
  const { prisma, mailer, webOrigin, logger } = deps;
  const rows = await prisma.chainPayment.findMany({
    where: { notifiedAt: null, createdAt: { gt: new Date(Date.now() - MAX_AGE_MS) }, NOT: { eventId: { startsWith: RESET_EVENT_PREFIX } } },
    include: { wallet: { include: { merchant: true } }, request: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  const send = async (mail: Parameters<Mailer["send"]>[0]) => {
    try {
      await mailer.send(mail);
      sent++;
    } catch (err) {
      logger.error({ err }, "notification email failed to send");
    }
  };

  for (const p of rows) {
    const claimed = await prisma.chainPayment.updateMany({ where: { eventId: p.eventId, notifiedAt: null }, data: { notifiedAt: new Date() } });
    if (claimed.count === 0) continue;
    const merchant = p.wallet.merchant;
    if (merchant.closedAt) continue;
    // The request, only when it belongs to the merchant who received the money.
    const req = p.request && p.request.merchantId === merchant.id ? p.request : null;
    const payment = { amountStroops: p.amountStroops, assetCode: p.assetCode, txHash: p.txHash, fromAddress: p.fromAddress };

    if (p.outcome === "COUNTED" && req) {
      if (req.status === "PAID" || req.status === "OVERPAID") {
        // Several payments can complete one request; "paid" goes out once per request.
        const first = await prisma.paymentRequest.updateMany({ where: { id: req.id, paidNotifiedAt: null }, data: { paidNotifiedAt: new Date() } });
        if (first.count === 0) continue;
        if (merchant.notifyPaid) await send(paidEmail(merchant.email, merchant.businessName, req, webOrigin));
        if (req.customerEmail) await send(receiptEmail(req.customerEmail, merchant.businessName, req, webOrigin));
      } else if (req.status === "UNDERPAID" && merchant.notifyProblems) {
        await send(problemEmail(merchant.email, merchant.businessName, "UNDERPAID", payment, req.id, webOrigin));
      }
      continue;
    }
    if (!merchant.notifyProblems) continue;
    const kind: ProblemKind | null =
      p.outcome === "NO_MEMO" || p.outcome === "UNKNOWN_MEMO" || p.outcome === "MEMO_TYPE_MISMATCH"
        ? "UNMATCHED"
        : p.outcome === "WRONG_ASSET" || p.outcome === "WRONG_ISSUER" || p.outcome === "LATE" || p.outcome === "DUPLICATE" || p.outcome === "AFTER_CANCEL" || p.outcome === "WRONG_WALLET"
          ? p.outcome
          : null;
    if (kind) await send(problemEmail(merchant.email, merchant.businessName, kind, payment, req?.id ?? null, webOrigin));
  }
  return sent;
}
