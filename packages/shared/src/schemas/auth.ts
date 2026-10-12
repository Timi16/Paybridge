import { z } from "zod";
import { ASSET_CODES } from "./common";

const Email = z.string().trim().toLowerCase().email().max(254);
// Upper bound keeps argon2 from being used as a CPU-exhaustion vector.
const NewPassword = z.string().min(10, "Password must be at least 10 characters").max(200);

export const SignupBody = z
  .object({
    email: Email,
    password: NewPassword,
    businessName: z.string().trim().min(1).max(100),
  })
  .strict();
export type SignupBody = z.infer<typeof SignupBody>;

export const LoginBody = z
  .object({
    email: Email,
    password: z.string().min(1).max(200),
    /** false = stay signed in only until the browser closes (and at most a day). Default true: 14 days. */
    remember: z.boolean().optional(),
  })
  .strict();

/** The six-digit code emailed at sign-up. Spaces are forgiven. */
export const VerifyEmailBody = z
  .object({ code: z.string().transform((v) => v.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code")) })
  .strict();
export type VerifyEmailBody = z.infer<typeof VerifyEmailBody>;

export const ForgotPasswordBody = z.object({ email: Email }).strict();
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>;

export const ResetPasswordBody = z
  .object({ token: z.string().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/, "Invalid reset link"), newPassword: NewPassword })
  .strict();
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;
export type LoginBody = z.infer<typeof LoginBody>;

export const ChangePasswordBody = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: NewPassword })
  .strict();
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;

/** Any subset of the merchant's settings; at least one field. */
export const UpdateSettingsBody = z
  .object({
    businessName: z.string().trim().min(1).max(100),
    /** Support email, shown on the pay page. null clears it. */
    supportContact: z.string().trim().min(1).max(100).nullable(),
    /** Where "Back to <business>" on the pay page goes. null clears it. */
    website: z.string().trim().url().max(200).regex(/^https?:\/\//i, "Use an http(s) address").nullable(),
    /** Accent colour on the pay page. */
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex colour like #1E4FD6"),
    defaultAsset: z.enum(ASSET_CODES),
    acceptedAssets: z.enum(["BOTH", "USDC", "XLM"]),
    /** 50 = a shortfall of up to 0.5% still counts as paid; 0 = exact amounts only. */
    toleranceBps: z.union([z.literal(0), z.literal(50)]),
    notifyPaid: z.boolean(),
    notifyProblems: z.boolean(),
    /** Wallet pre-selected for new requests in the dashboard. null clears it. */
    defaultWalletId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).nullable(),
    /** Expiry pre-selected for new requests in the dashboard. */
    defaultExpiryMinutes: z.number().int().min(5).max(43_200),
    autoMatchByAmount: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Send at least one setting to change");
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;

export const MerchantSchema = z.object({
  id: z.string(),
  email: z.string(),
  /** False until the code emailed at sign-up has been entered. The dashboard is locked until then. */
  emailVerified: z.boolean(),
  businessName: z.string(),
  supportContact: z.string().nullable(),
  website: z.string().nullable(),
  brandColor: z.string(),
  defaultAsset: z.string(),
  acceptedAssets: z.enum(["BOTH", "USDC", "XLM"]),
  toleranceBps: z.number(),
  notifyPaid: z.boolean(),
  notifyProblems: z.boolean(),
  defaultWalletId: z.string().nullable(),
  defaultExpiryMinutes: z.number(),
  /** When true, a memo-less payment that exactly settles the only open request it could belong to is matched automatically. */
  autoMatchByAmount: z.boolean(),
  createdAt: z.string(),
});
export type Merchant = z.infer<typeof MerchantSchema>;
export const MerchantResponse = z.object({ merchant: MerchantSchema });

/** Closing the account: the merchant types CLOSE. Open requests are closed; wallets and funds are untouched. */
export const CloseAccountBody = z.object({ confirm: z.literal("CLOSE", { errorMap: () => ({ message: "Type CLOSE to confirm" }) }) }).strict();

/** One place the merchant is signed in. */
export const SessionSchema = z.object({
  id: z.string(),
  /** True for the session making this request. */
  current: z.boolean(),
  createdAt: z.string(),
  /** Last request seen from this session (updated at most every few minutes). */
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type Session = z.infer<typeof SessionSchema>;
export const SessionListResponse = z.object({ data: z.array(SessionSchema) });
export const SessionIdParamsSchema = z.object({ id: z.string().regex(/^[0-9a-f]{64}$/, "Invalid session id") }).strict();
