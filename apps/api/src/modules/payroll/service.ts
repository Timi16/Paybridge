import type { ReceiveProblem, RunCheck } from "@paybridge/shared";
import { MAX_BATCH_OPS } from "@paybridge/shared";
import type { PayrollBatch, PayrollItem, PayrollRun, RunStatus } from "@prisma/client";
import { env } from "../../config/env";
import type { Tx } from "../../db/prisma";
import type { AppDeps } from "../../deps";
import { formatStroops, parseAmount } from "../../lib/amount";
import { usdc } from "../../lib/asset";
import { encodeCursor } from "../../lib/cursor";
import { AppError, notFound } from "../../lib/errors";
import { fundingCheck, fundingError, receiveProblem } from "../../stellar/checks";
import { loadAccounts, type AccountState } from "../../stellar/gateway";
import { decodeResultXdr } from "../../stellar/results";
import { batchMemo, buildBatchTransaction, checkSignedBatch } from "./batches";
import * as repo from "./repo";
import { serializeBatch, serializeRun, serializeRunSummary } from "./serialize";
import { isOpen, settleBatch, type BatchOutcome } from "./settle";
import { assignToBatch, finishIfDone, lockRun, recordEvent, transitionBatch, transitionItems, transitionRun, type Actor } from "./transitions";

/** Most lines on one run. */
export const MAX_RUN_LINES = 1000;

const locked = (message = "This run can only be changed while it is a draft") => new AppError("RUN_LOCKED", message);
const changedMeanwhile = () => locked("The run changed while PayBridge was checking it. Try again.");

function payDateValue(v: string | null | undefined): Date | null | undefined {
  return v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`);
}

/** Lines that were checked must be exactly the lines found again under the lock. */
function sameLines(checked: PayrollItem[], now: PayrollItem[]): boolean {
  if (checked.length !== now.length) return false;
  const byId = new Map(now.map((i) => [i.id, i]));
  return checked.every((c) => {
    const n = byId.get(c.id);
    return n !== undefined && n.amountStroops === c.amountStroops && n.walletAddress === c.walletAddress;
  });
}

export function createPayrollService(deps: AppDeps) {
  const { prisma, stellar } = deps;

  async function inRunLock<T>(companyId: string, runId: string, fn: (tx: Tx, run: PayrollRun) => Promise<T>): Promise<T> {
    return prisma.$transaction(
      async (tx) => {
        const run = await lockRun(tx, companyId, runId);
        if (!run) throw notFound("Payroll run");
        return fn(tx, run);
      },
      { timeout: 30_000 },
    );
  }

  async function getRun(companyId: string, id: string) {
    const run = await repo.findRunFull(prisma, companyId, id);
    if (!run) throw notFound("Payroll run");
    return serializeRun(run);
  }

  /** Active employees picked directly or through their groups, in name order, each once. */
  async function pickEmployees(companyId: string, groupIds: string[] = [], employeeIds: string[] = []) {
    if (groupIds.length > 0) {
      const found = await prisma.group.count({ where: { companyId, id: { in: groupIds } } });
      if (found !== new Set(groupIds).size) throw notFound("Group");
    }
    if (employeeIds.length > 0) {
      const found = await prisma.employee.count({ where: { companyId, id: { in: employeeIds }, archivedAt: null } });
      if (found !== new Set(employeeIds).size) {
        throw new AppError("VALIDATION_FAILED", "Some of the people picked were not found or are archived", {
          details: [{ path: "employeeIds", message: "Unknown or archived person" }],
        });
      }
    }
    return prisma.employee.findMany({
      where: { companyId, archivedAt: null, OR: [{ id: { in: employeeIds } }, { groupId: { in: groupIds } }] },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async function addLines(tx: Tx, run: PayrollRun, employees: Awaited<ReturnType<typeof pickEmployees>>): Promise<number> {
    const existing = await tx.payrollItem.findMany({ where: { runId: run.id }, select: { employeeId: true, position: true } });
    const onRun = new Set(existing.map((e) => e.employeeId));
    const fresh = employees.filter((e) => !onRun.has(e.id));
    if (existing.length + fresh.length > MAX_RUN_LINES) {
      throw new AppError("LIMIT_REACHED", `A run can have at most ${MAX_RUN_LINES} people`);
    }
    let position = existing.reduce((max, e) => Math.max(max, e.position), 0);
    if (fresh.length > 0) {
      await tx.payrollItem.createMany({
        data: fresh.map((e) => ({
          runId: run.id,
          companyId: run.companyId,
          employeeId: e.id,
          position: ++position,
          name: e.name,
          walletAddress: e.walletAddress,
          amountStroops: e.defaultAmountStroops,
        })),
      });
    }
    return fresh.length;
  }

  async function activeWallet(companyId: string, walletId: string) {
    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, companyId, deletedAt: null } });
    if (!wallet) throw notFound("Wallet");
    return wallet;
  }

  /** Keeps People's "ready" column in step with what a payroll check just saw. Best effort. */
  async function rememberChecks(companyId: string, results: Map<string, ReceiveProblem | null>): Promise<void> {
    const checkedAt = new Date();
    await Promise.all(
      [...results].map(([walletAddress, problem]) =>
        prisma.employee.updateMany({ where: { companyId, walletAddress, archivedAt: null }, data: { checkReason: problem, checkedAt } }),
      ),
    ).catch((err: unknown) => deps.logger.warn({ err }, "could not store recipient checks"));
  }

  function problemsFor(items: PayrollItem[], accounts: Map<string, AccountState>): Map<string, ReceiveProblem | null> {
    const asset = usdc();
    const byItem = new Map<string, ReceiveProblem | null>();
    for (const item of items) {
      const account = accounts.get(item.walletAddress) ?? { exists: false as const };
      byItem.set(item.id, receiveProblem(account, asset, item.amountStroops));
    }
    return byItem;
  }

  function byAddress(items: PayrollItem[], problems: Map<string, ReceiveProblem | null>): Map<string, ReceiveProblem | null> {
    return new Map(items.map((i) => [i.walletAddress, problems.get(i.id) ?? null]));
  }

  async function markExcluded(tx: Tx, run: PayrollRun, items: PayrollItem[], problems: Map<string, ReceiveProblem | null>, actor: Actor) {
    for (const item of items) {
      const problem = problems.get(item.id);
      if (!problem) continue;
      await transitionItems(tx, run.id, [item.id], "PENDING", "FAILED", { failureCode: problem, failureDetail: null });
      await recordEvent(tx, run.id, actor, { type: "excluded", itemId: item.id, message: `${item.name} not sent: ${problem}` });
    }
  }

  /** Asks Stellar what became of an open batch and settles it if the answer is final. */
  async function resolveBatch(batch: PayrollBatch, actor: Actor): Promise<boolean> {
    const ledger = await stellar.latestLedger(); // read first: anything landed by now is findable below
    const found = await stellar.getTransaction(batch.txHash);
    let outcome: BatchOutcome | null = null;
    if (found) {
      outcome = found.successful
        ? { kind: "success", ledger: found.ledger, closedAt: found.closedAt }
        : { kind: "failed", ...decodeResultXdr(found.resultXdr) };
    } else if (ledger.closedAt.getTime() > batch.maxTime.getTime()) {
      outcome = { kind: "expired" };
    }
    if (!outcome) return false;
    const settled = outcome;
    return inRunLock(batch.companyId, batch.runId, (tx) => settleBatch(tx, batch.id, settled, actor));
  }

  /**
   * A submission Stellar refused before it reached a ledger. Settled only when the envelope can
   * provably never land; otherwise it stays SUBMITTED and the confirmer expires it by ledger time.
   */
  async function handleRejection(batch: PayrollBatch, source: string, txCode: string, actor: Actor): Promise<void> {
    if (await resolveBatch(batch, actor)) return;
    let final = false;
    if (txCode === "tx_bad_seq") {
      const account = await stellar.loadAccount(source);
      // Sequence numbers only grow: once the account is at or past this one, it can never be used.
      final = account.exists && BigInt(account.sequence) >= BigInt(batch.sequence);
    }
    if (final) {
      await inRunLock(batch.companyId, batch.runId, (tx) => settleBatch(tx, batch.id, { kind: "failed", txCode, opCodes: [] }, actor));
    } else {
      await prisma.payrollBatch.updateMany({ where: { id: batch.id, status: "SUBMITTED" }, data: { resultCode: txCode } });
    }
  }

  return {
    getRun,
    resolveBatch,

    async list(companyId: string, q: { status?: RunStatus; cursor?: string; limit: number }) {
      const rows = await repo.listRuns(prisma, companyId, q);
      const page = rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return {
        data: page.map((r) => serializeRunSummary(r, r.items)),
        nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null,
      };
    },

    async create(
      companyId: string,
      input: { name: string; walletId: string; payDate?: string | null; groupIds?: string[]; employeeIds?: string[] },
      via: "dashboard" | "api",
    ) {
      const wallet = await activeWallet(companyId, input.walletId);
      const employees = await pickEmployees(companyId, input.groupIds, input.employeeIds);
      const asset = usdc();
      const id = await prisma.$transaction(async (tx) => {
        const company = await tx.company.update({ where: { id: companyId }, data: { runCounter: { increment: 1 } } });
        const run = await tx.payrollRun.create({
          data: {
            companyId,
            number: company.runCounter,
            name: input.name,
            payDate: payDateValue(input.payDate) ?? null,
            walletId: wallet.id,
            walletAddress: wallet.address,
            assetCode: asset.code,
            assetIssuer: asset.issuer,
            createdVia: via,
          },
        });
        const added = await addLines(tx, run, employees);
        await recordEvent(tx, run.id, via === "api" ? "api" : "company", {
          type: "created",
          message: `Draft created with ${added} ${added === 1 ? "person" : "people"}`,
        });
        return run.id;
      });
      return getRun(companyId, id);
    },

    async update(companyId: string, id: string, input: { name?: string; payDate?: string | null; walletId?: string }) {
      const wallet = input.walletId ? await activeWallet(companyId, input.walletId) : null;
      await inRunLock(companyId, id, async (tx, run) => {
        if (run.status !== "DRAFT") throw locked();
        await tx.payrollRun.update({
          where: { id: run.id },
          data: {
            name: input.name,
            payDate: payDateValue(input.payDate),
            ...(wallet ? { walletId: wallet.id, walletAddress: wallet.address } : {}),
          },
        });
      });
      return getRun(companyId, id);
    },

    async addItems(companyId: string, id: string, input: { groupIds?: string[]; employeeIds?: string[] }) {
      const employees = await pickEmployees(companyId, input.groupIds, input.employeeIds);
      await inRunLock(companyId, id, async (tx, run) => {
        if (run.status !== "DRAFT") throw locked();
        await addLines(tx, run, employees);
        await tx.payrollRun.update({ where: { id: run.id }, data: { updatedAt: new Date() } });
      });
      return getRun(companyId, id);
    },

    async updateItem(companyId: string, id: string, itemId: string, amount: string) {
      const amountStroops = parseAmount(amount);
      if (amountStroops === null || amountStroops <= 0n) throw new AppError("VALIDATION_FAILED", "Amount must be greater than 0");
      await inRunLock(companyId, id, async (tx, run) => {
        if (run.status !== "DRAFT") throw locked();
        const updated = await tx.payrollItem.updateMany({ where: { id: itemId, runId: run.id }, data: { amountStroops } });
        if (updated.count === 0) throw notFound("Line");
        await tx.payrollRun.update({ where: { id: run.id }, data: { updatedAt: new Date() } });
      });
      return getRun(companyId, id);
    },

    async removeItem(companyId: string, id: string, itemId: string) {
      await inRunLock(companyId, id, async (tx, run) => {
        if (run.status !== "DRAFT") throw locked();
        const deleted = await tx.payrollItem.deleteMany({ where: { id: itemId, runId: run.id } });
        if (deleted.count === 0) throw notFound("Line");
        await tx.payrollRun.update({ where: { id: run.id }, data: { updatedAt: new Date() } });
      });
      return getRun(companyId, id);
    },

    async remove(companyId: string, id: string): Promise<void> {
      await inRunLock(companyId, id, async (tx, run) => {
        if (run.status !== "DRAFT") throw locked("Only a draft can be deleted. Cancel it instead.");
        await tx.payrollRun.delete({ where: { id: run.id } });
      });
    },

    /** Read-only pre-flight: who can receive, and can the funding wallet cover the rest. */
    async check(companyId: string, id: string): Promise<RunCheck> {
      const run = await repo.findRun(prisma, companyId, id);
      if (!run) throw notFound("Payroll run");
      const items = await prisma.payrollItem.findMany({
        where: { runId: run.id, status: { in: ["PENDING", "FAILED"] } },
        orderBy: { position: "asc" },
      });
      const accounts = await loadAccounts(stellar, [run.walletAddress, ...items.map((i) => i.walletAddress)]);
      const problems = problemsFor(items, accounts);
      await rememberChecks(companyId, byAddress(items, problems));
      const payable = items.filter((i) => !problems.get(i.id));
      const payableTotal = payable.reduce((sum, i) => sum + i.amountStroops, 0n);
      const funding = fundingCheck(accounts.get(run.walletAddress) ?? { exists: false }, usdc(), payableTotal, payable.length);
      return {
        lines: items.map((i) => ({ itemId: i.id, ok: !problems.get(i.id), reason: problems.get(i.id) ?? null })),
        payableCount: payable.length,
        payableTotal: formatStroops(payableTotal),
        excludedCount: items.length - payable.length,
        funding: {
          address: run.walletAddress,
          usdcAvailable: funding.usdcAvailable === null ? null : formatStroops(funding.usdcAvailable),
          xlmAvailable: funding.xlmAvailable === null ? null : formatStroops(funding.xlmAvailable),
          feeXlm: formatStroops(funding.feeStroops),
          enough: funding.problem === null,
          problem: funding.problem,
          shortBy: funding.shortBy === null ? null : formatStroops(funding.shortBy),
        },
        checkedAt: new Date().toISOString(),
      };
    },

    /**
     * DRAFT → PAYING. Every recipient and the funding wallet are loaded fresh. People who can't
     * receive are marked FAILED (never sent); if the wallet can't cover the rest nothing changes.
     */
    async start(companyId: string, id: string, actor: Actor) {
      const run = await repo.findRun(prisma, companyId, id);
      if (!run) throw notFound("Payroll run");
      if (run.status !== "DRAFT") throw locked("This run has already been started");
      await activeWallet(companyId, run.walletId).catch(() => {
        throw new AppError("VALIDATION_FAILED", "This run's funding wallet was removed. Pick another one.", {
          details: [{ path: "walletId", message: "Funding wallet removed" }],
        });
      });
      const items = await repo.itemsByStatus(prisma, companyId, run.id, "PENDING");
      if (items.length === 0) throw new AppError("NOTHING_TO_PAY", "Add people to this run first");
      const accounts = await loadAccounts(stellar, [run.walletAddress, ...items.map((i) => i.walletAddress)]);
      const problems = problemsFor(items, accounts);
      await rememberChecks(companyId, byAddress(items, problems));
      const payable = items.filter((i) => !problems.get(i.id));
      if (payable.length === 0) {
        throw new AppError("NOTHING_TO_PAY", "Nobody on this run can receive USDC right now", {
          details: items.map((i) => ({ itemId: i.id, reason: problems.get(i.id) })),
        });
      }
      const total = payable.reduce((sum, i) => sum + i.amountStroops, 0n);
      const funding = fundingCheck(accounts.get(run.walletAddress) ?? { exists: false }, usdc(), total, payable.length);
      if (funding.problem) throw fundingError(funding, run.assetCode);

      await inRunLock(companyId, id, async (tx, current) => {
        if (current.status !== "DRAFT" || current.walletAddress !== run.walletAddress) throw changedMeanwhile();
        const now = await tx.payrollItem.findMany({ where: { runId: run.id, status: "PENDING" } });
        if (!sameLines(items, now)) throw changedMeanwhile();
        await markExcluded(tx, current, items, problems, actor);
        const excluded = items.length - payable.length;
        await transitionRun(tx, current, "PAYING", actor, {
          data: { startedAt: new Date() },
          event: {
            type: "started",
            message: `Started: ${payable.length} to pay, ${formatStroops(total)} ${run.assetCode}${excluded ? `; ${excluded} can't receive and won't be sent` : ""}`,
          },
        });
      });
      return getRun(companyId, id);
    },

    /**
     * The batch to sign next. While a batch is open (waiting for a signature or for Stellar) it is
     * returned again, never replaced: two envelopes that could both land would pay people twice.
     */
    async nextBatch(companyId: string, id: string, actor: Actor) {
      for (let round = 0; round < 12; round++) {
        const run = await repo.findRun(prisma, companyId, id);
        if (!run) throw notFound("Payroll run");
        if (run.status === "DRAFT") throw locked("Start the run before signing");
        if (run.status !== "PAYING") return { batch: null, run: await getRun(companyId, id) };

        const open = await repo.openBatch(prisma, companyId, run.id);
        if (open) {
          if (open.status === "AWAITING_SIGNATURE" && open.maxTime.getTime() > Date.now()) {
            return { batch: { ...serializeBatch(open), xdr: open.envelopeXdr, networkPassphrase: env.NETWORK_PASSPHRASE }, run: await getRun(companyId, id) };
          }
          // Past its window by our clock, or with Stellar: settle it if the ledger agrees, else wait.
          if (await resolveBatch(open, actor)) continue;
          return { batch: null, run: await getRun(companyId, id) };
        }

        const lines = await repo.itemsByStatus(prisma, companyId, run.id, "PENDING", MAX_BATCH_OPS);
        if (lines.length === 0) {
          await inRunLock(companyId, id, (tx) => finishIfDone(tx, run.id, actor));
          return { batch: null, run: await getRun(companyId, id) };
        }
        const accounts = await loadAccounts(stellar, [run.walletAddress, ...lines.map((i) => i.walletAddress)]);
        const problems = problemsFor(lines, accounts);
        await rememberChecks(companyId, byAddress(lines, problems));
        const payable = lines.filter((i) => !problems.get(i.id));
        const funder = accounts.get(run.walletAddress) ?? { exists: false as const };

        const built = await inRunLock(companyId, id, async (tx, current) => {
          if (current.status !== "PAYING") throw changedMeanwhile();
          if (await repo.openBatch(tx, companyId, run.id)) throw changedMeanwhile();
          const now = await tx.payrollItem.findMany({ where: { runId: run.id, id: { in: lines.map((l) => l.id) }, status: "PENDING" } });
          if (!sameLines(lines, now)) throw changedMeanwhile();
          await markExcluded(tx, current, lines, problems, actor);
          if (payable.length === 0) {
            await finishIfDone(tx, run.id, actor);
            return null;
          }
          const total = payable.reduce((sum, i) => sum + i.amountStroops, 0n);
          const funding = fundingCheck(funder, usdc(), total, payable.length);
          if (funding.problem) throw fundingError(funding, current.assetCode);
          if (!funder.exists) throw fundingError(funding, current.assetCode);
          // Timebounds are whole seconds. Each new envelope ends strictly after the last one, so
          // a rebuilt batch can never be byte-identical to (and collide with) an expired one.
          const last = await tx.payrollBatch.findFirst({ where: { runId: run.id }, orderBy: { number: "desc" } });
          let maxSeconds = Math.floor(Date.now() / 1000) + deps.batchWindowSeconds;
          if (last) maxSeconds = Math.max(maxSeconds, Math.floor(last.maxTime.getTime() / 1000) + 1);
          const maxTime = new Date(maxSeconds * 1000);
          const envelope = buildBatchTransaction({
            source: current.walletAddress,
            accountSequence: funder.sequence,
            asset: { code: current.assetCode, issuer: current.assetIssuer },
            lines: payable.map((i) => ({ destination: i.walletAddress, amountStroops: i.amountStroops })),
            memo: batchMemo(current.number),
            maxTime,
          });
          const number = (await tx.payrollBatch.count({ where: { runId: run.id } })) + 1;
          const batch = await tx.payrollBatch.create({
            data: {
              runId: run.id,
              companyId,
              number,
              txHash: envelope.hash,
              envelopeXdr: envelope.xdr,
              sequence: envelope.sequence,
              maxTime,
              opCount: payable.length,
              totalStroops: total,
            },
          });
          await assignToBatch(tx, run.id, batch.id, payable.map((i) => i.id));
          await recordEvent(tx, run.id, actor, {
            type: "batch_built",
            batchId: batch.id,
            message: `Batch ${number} ready to sign: ${payable.length} payments, ${formatStroops(total)} ${current.assetCode}`,
          });
          return batch;
        });
        if (built) {
          return { batch: { ...serializeBatch(built), xdr: built.envelopeXdr, networkPassphrase: env.NETWORK_PASSPHRASE }, run: await getRun(companyId, id) };
        }
      }
      return { batch: null, run: await getRun(companyId, id) };
    },

    /** Takes the signed batch, proves it is ours, submits it and records what Stellar says. */
    async submit(companyId: string, id: string, batchId: string, signedXdr: string, actor: Actor) {
      const { batch, source, fresh } = await inRunLock(companyId, id, async (tx, run) => {
        const batch = await repo.findBatch(tx, companyId, run.id, batchId);
        if (!batch) throw notFound("Batch");
        checkSignedBatch(signedXdr, { hash: batch.txHash, source: run.walletAddress });
        if (batch.status !== "AWAITING_SIGNATURE") {
          // Already submitted (a retry, a double click, or the confirmer got there): never send twice.
          return { batch, source: run.walletAddress, fresh: false };
        }
        await transitionBatch(tx, batch, "SUBMITTED", { signedXdr, submittedAt: new Date() });
        await recordEvent(tx, run.id, actor, { type: "submitted", batchId: batch.id, message: `Batch ${batch.number} signed and sent to Stellar` });
        return { batch, source: run.walletAddress, fresh: true };
      });

      if (fresh) {
        const result = await stellar.submit(signedXdr);
        if (result.kind === "success") {
          await inRunLock(companyId, id, (tx) => settleBatch(tx, batch.id, { kind: "success", ledger: result.ledger, closedAt: result.closedAt }, actor));
        } else if (result.kind === "failed" && result.txCode === "tx_failed") {
          await inRunLock(companyId, id, (tx) => settleBatch(tx, batch.id, result, actor));
        } else if (result.kind === "failed") {
          await handleRejection({ ...batch, status: "SUBMITTED" }, source, result.txCode, actor).catch((err: unknown) =>
            deps.logger.warn({ err, batchId: batch.id }, "could not resolve a rejected batch yet"),
          );
        }
        // unknown: stays SUBMITTED; the worker's confirmer settles it from the ledger.
      }
      const after = await prisma.payrollBatch.findUniqueOrThrow({ where: { id: batch.id } });
      return { batch: serializeBatch(after), run: await getRun(companyId, id), settled: !isOpen(after) };
    },

    /** FAILED lines that now pass a fresh check go back to PENDING; the rest keep failing, with the new reason. */
    async retry(companyId: string, id: string, itemIds: string[] | undefined, actor: Actor) {
      const run = await repo.findRun(prisma, companyId, id);
      if (!run) throw notFound("Payroll run");
      if (!["PAYING", "PARTIAL", "FAILED"].includes(run.status)) throw locked("Only a run that has been started can be retried");
      const failed = await prisma.payrollItem.findMany({
        where: { runId: run.id, status: "FAILED", ...(itemIds ? { id: { in: itemIds } } : {}) },
        orderBy: { position: "asc" },
      });
      if (failed.length === 0) throw new AppError("NOTHING_TO_PAY", "There are no failed payments to retry");
      const accounts = await loadAccounts(stellar, failed.map((i) => i.walletAddress));
      const problems = problemsFor(failed, accounts);
      await rememberChecks(companyId, byAddress(failed, problems));

      await inRunLock(companyId, id, async (tx, current) => {
        const now = await tx.payrollItem.findMany({ where: { runId: run.id, id: { in: failed.map((f) => f.id) }, status: "FAILED" } });
        if (!sameLines(failed, now)) throw changedMeanwhile();
        const ready = failed.filter((i) => !problems.get(i.id));
        for (const item of failed) {
          const problem = problems.get(item.id);
          if (problem) await tx.payrollItem.updateMany({ where: { id: item.id, status: "FAILED" }, data: { failureCode: problem, failureDetail: null } });
        }
        await transitionItems(tx, run.id, ready.map((i) => i.id), "FAILED", "PENDING", {
          failureCode: null,
          failureDetail: null,
          batchId: null,
          opIndex: null,
        });
        const message = `Retry: ${ready.length} ready to send${failed.length > ready.length ? `, ${failed.length - ready.length} still can't receive` : ""}`;
        if (ready.length > 0 && (current.status === "PARTIAL" || current.status === "FAILED")) {
          await transitionRun(tx, current, "PAYING", actor, { data: { finishedAt: null }, event: { type: "retried", message } });
        } else {
          await recordEvent(tx, run.id, actor, { type: "retried", message });
        }
      });
      return getRun(companyId, id);
    },

    async cancel(companyId: string, id: string, actor: Actor) {
      await inRunLock(companyId, id, async (tx, run) => {
        if (run.status === "DRAFT") {
          const pending = await tx.payrollItem.findMany({ where: { runId: run.id, status: "PENDING" }, select: { id: true } });
          await transitionItems(tx, run.id, pending.map((p) => p.id), "PENDING", "CANCELLED");
          await transitionRun(tx, run, "CANCELLED", actor, { data: { finishedAt: new Date() }, event: { type: "cancelled", message: "Draft cancelled" } });
          return;
        }
        if (run.status !== "PAYING") throw locked("This run is already finished");
        if (await repo.openBatch(tx, companyId, run.id)) {
          throw locked("A batch is waiting for a signature or for Stellar. Wait for it to finish or expire, then cancel.");
        }
        const pending = await tx.payrollItem.findMany({ where: { runId: run.id, status: "PENDING" }, select: { id: true } });
        await transitionItems(tx, run.id, pending.map((p) => p.id), "PENDING", "CANCELLED");
        await recordEvent(tx, run.id, actor, { type: "cancelled", message: `Cancelled ${pending.length} payment(s) not yet sent` });
        await finishIfDone(tx, run.id, actor);
      });
      return getRun(companyId, id);
    },
  };
}

export type PayrollService = ReturnType<typeof createPayrollService>;
