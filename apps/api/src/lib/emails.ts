import type { Mail } from "./mailer";
import { formatStroops } from "./amount";

/** Plain-text emails. Amounts are shown trimmed ("80.00"), never rounded. */
function money(stroops: bigint, code: string): string {
  const [whole = "0", frac = ""] = formatStroops(stroops).split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${trimmed} ${code}`;
}

interface RequestFacts {
  id: string;
  publicId: string;
  memo: string;
  description: string | null;
  assetCode: string;
  amountStroops: bigint;
  receivedStroops: bigint;
  paidTxHash: string | null;
  walletAddress: string;
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const forLine = (r: RequestFacts) => (r.description ? `For: ${r.description}` : `Memo: ${r.memo}`);
const explorer = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

/** To the merchant: a request was verified as paid. */
export function paidEmail(to: string, businessName: string, r: RequestFacts, webOrigin: string): Mail {
  return {
    to,
    subject: `Paid: ${money(r.receivedStroops, r.assetCode)}${r.description ? ` · ${r.description}` : ""}`,
    text: [
      `Hi ${businessName},`,
      "",
      `${money(r.receivedStroops, r.assetCode)} reached your wallet ${short(r.walletAddress)} and was verified on Stellar Testnet.`,
      forLine(r),
      ...(r.paidTxHash ? [`Transaction: ${explorer(r.paidTxHash)}`] : []),
      "",
      `Open the request: ${webOrigin}/requests/${r.id}`,
      "",
      "PayBridge never holds your funds. Testnet: no real money moved.",
    ].join("\n"),
  };
}

/** To the customer: a receipt for a paid request. */
export function receiptEmail(to: string, businessName: string, r: RequestFacts, webOrigin: string): Mail {
  return {
    to,
    subject: `Receipt from ${businessName}: ${money(r.receivedStroops, r.assetCode)}`,
    text: [
      `Your payment to ${businessName} was received and verified on Stellar Testnet.`,
      "",
      `Amount: ${money(r.receivedStroops, r.assetCode)}`,
      forLine(r),
      `Paid to: ${r.walletAddress}`,
      `Memo: ${r.memo}`,
      ...(r.paidTxHash ? [`Transaction: ${explorer(r.paidTxHash)}`] : []),
      "",
      `Receipt page: ${webOrigin}/pay/${r.publicId}`,
      "",
      "Sent by PayBridge on behalf of the business. Testnet: no real money moved.",
    ].join("\n"),
  };
}

export type ProblemKind =
  | "UNDERPAID"
  | "WRONG_ASSET"
  | "WRONG_ISSUER"
  | "LATE"
  | "DUPLICATE"
  | "AFTER_CANCEL"
  | "WRONG_WALLET"
  | "UNMATCHED";

const PROBLEM_TEXT: Record<ProblemKind, (amount: string) => { subject: string; line: string }> = {
  UNDERPAID: (a) => ({ subject: `Underpaid: ${a} arrived`, line: `${a} arrived, which is less than the request asked for. It stays open for the rest until it expires, or you can accept it as paid.` }),
  WRONG_ASSET: (a) => ({ subject: `Wrong asset: ${a} arrived`, line: `${a} arrived with this request's memo, but the request asked for a different asset. It is not counted. The funds are in your wallet; refund them from there if you want.` }),
  WRONG_ISSUER: (a) => ({ subject: `Look-alike asset: ${a} arrived`, line: `${a} arrived with this request's memo, but from a different issuer than the asset you accept. It is not counted.` }),
  LATE: (a) => ({ subject: `Late payment: ${a} arrived`, line: `${a} arrived after the link expired. Accept it as paid, or refund it from your wallet.` }),
  DUPLICATE: (a) => ({ subject: `Paid twice: ${a} arrived`, line: `${a} arrived for a request that was already paid. Refund it from your wallet.` }),
  AFTER_CANCEL: (a) => ({ subject: `Payment after cancel: ${a} arrived`, line: `${a} arrived for a request you cancelled. Accept it as paid, or refund it from your wallet.` }),
  WRONG_WALLET: (a) => ({ subject: `Unexpected payment: ${a} arrived`, line: `${a} arrived at this wallet with a memo that belongs to a request on another wallet. It could not be matched.` }),
  UNMATCHED: (a) => ({ subject: `Unmatched payment: ${a} arrived`, line: `${a} arrived without a memo that matches any request. Assign it to a request, or refund it from your wallet.` }),
};

/** To the merchant: a payment needs a look. `requestId` is null when it matched none of their requests. */
export function problemEmail(
  to: string,
  businessName: string,
  kind: ProblemKind,
  payment: { amountStroops: bigint; assetCode: string; txHash: string; fromAddress: string },
  requestId: string | null,
  webOrigin: string,
): Mail {
  const text = PROBLEM_TEXT[kind](money(payment.amountStroops, payment.assetCode));
  return {
    to,
    subject: text.subject,
    text: [
      `Hi ${businessName},`,
      "",
      text.line,
      `From: ${payment.fromAddress}`,
      `Transaction: ${explorer(payment.txHash)}`,
      "",
      requestId ? `Open the request: ${webOrigin}/requests/${requestId}` : `Review it: ${webOrigin}/unmatched`,
      "",
      "PayBridge never holds your funds. Testnet: no real money moved.",
    ].join("\n"),
  };
}
