import { z } from "zod";
import { parseAmount } from "../amount";

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "SECRET_KEY_REJECTED",
  "ACCOUNT_NOT_FOUND",
  "INSUFFICIENT_FUNDS",
  "TX_MISMATCH",
  "INVALID_SIGNATURE",
  "CHALLENGE_EXPIRED",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "INVALID_CODE",
  "EMAIL_NOT_VERIFIED",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "RUN_LOCKED",
  "NOTHING_TO_PAY",
  "WALLET_IN_USE",
  "WALLET_TAKEN",
  "NAME_TAKEN",
  "EMAIL_TAKEN",
  "LIMIT_REACHED",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL",
  "HORIZON_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Why a wallet cannot receive USDC right now. */
export const RECEIVE_PROBLEMS = [
  "ACCOUNT_NOT_FOUND",
  "NO_TRUSTLINE",
  "NOT_AUTHORIZED",
  "TRUSTLINE_LIMIT_TOO_LOW",
] as const;
export type ReceiveProblem = (typeof RECEIVE_PROBLEMS)[number];

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(z.unknown()),
    requestId: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Decimal string, up to 12 integer digits and 7 decimals, > 0, fits in int64 stroops. */
export const AmountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,7})?$/, "Amount must be a decimal string with at most 7 decimals")
  .refine((v) => {
    const s = parseAmount(v);
    return s !== null && s > 0n;
  }, "Amount must be greater than 0 and at most 922337203685.4775807");

export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

export const IdParamsSchema = z.object({ id: IdSchema }).strict();

export const PaginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
};

export const IsoDate = z.string().datetime();
