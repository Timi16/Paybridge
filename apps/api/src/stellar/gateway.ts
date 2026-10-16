import type { Trustline } from "@paybridge/shared";

export type AccountState =
  | { exists: false }
  | {
      exists: true;
      /** Current sequence number, as a decimal string (int64). */
      sequence: string;
      /** XLM balance and selling liabilities, decimal strings. */
      nativeBalance: string;
      nativeSellingLiabilities: string;
      subentries: number;
      sponsoring: number;
      sponsored: number;
      trustlines: Trustline[];
    };

export interface LedgerInfo {
  sequence: number;
  closedAt: Date;
}

export interface FoundTransaction {
  successful: boolean;
  ledger: number;
  closedAt: Date;
  /** Base64 TransactionResult XDR. */
  resultXdr: string;
}

export type SubmitResult =
  /** Applied in a ledger and successful. */
  | { kind: "success"; ledger: number; closedAt: Date }
  /**
   * Refused. txCode "tx_failed" means the transaction made it into a ledger and every
   * operation was rolled back; any other code means it was rejected before reaching a ledger.
   * opCodes is per operation, in order ("op_success", "op_no_trust", …), when Stellar gave them.
   */
  | { kind: "failed"; txCode: string; opCodes: string[] }
  /** Timeout, 5xx or a network error: the transaction may or may not land. */
  | { kind: "unknown" };

/**
 * Everything PayBridge needs from Stellar. Implemented over Horizon; tests use a fake.
 * Reads throw AppError HORIZON_UNAVAILABLE when Stellar cannot be reached.
 */
export interface StellarGateway {
  loadAccount(address: string): Promise<AccountState>;
  latestLedger(): Promise<LedgerInfo>;
  /** null when Stellar has no transaction with this hash (yet). */
  getTransaction(hash: string): Promise<FoundTransaction | null>;
  submit(signedXdr: string): Promise<SubmitResult>;
}

/** Loads many accounts, a few at a time, each address once. */
export async function loadAccounts(
  gateway: StellarGateway,
  addresses: string[],
  concurrency = 8,
): Promise<Map<string, AccountState>> {
  const unique = [...new Set(addresses)];
  const out = new Map<string, AccountState>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < unique.length) {
      const address = unique[next++] as string;
      out.set(address, await gateway.loadAccount(address));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}
