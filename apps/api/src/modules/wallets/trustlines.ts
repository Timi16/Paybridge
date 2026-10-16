import { TrustlineSchema, type Trustline } from "@paybridge/shared";
import { z } from "zod";

/** Trustlines cached as JSON on a wallet row. Anything unreadable counts as none. */
export function parseTrustlines(json: unknown): Trustline[] {
  const parsed = z.array(TrustlineSchema).safeParse(json);
  return parsed.success ? parsed.data : [];
}
