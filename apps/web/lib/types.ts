// The API's shapes, straight from the shared package, plus list envelopes.
export type {
  ApiKey,
  Batch,
  BatchStatus,
  ChallengeResponse,
  Company,
  Employee,
  FailureCode,
  FundingProblem,
  Group,
  ItemStatus,
  ReceiveProblem,
  RecipientCheck,
  Run,
  RunCheck,
  RunEvent,
  RunItem,
  RunStatus,
  RunSummary,
  Session,
  SignableBatch,
  Summary,
  Trustline,
  Wallet,
} from "@paybridge/shared";

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface EmployeePage extends Page<import("@paybridge/shared").Employee> {
  total: number;
}
