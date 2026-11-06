/**
 * Commerce's asynchronous bulk API, sent and followed to its end (AB-74).
 *
 * One call carries an ARRAY of request bodies; Commerce queues one operation per body and
 * answers a `bulk_uuid`. `GET bulk/{uuid}/status` then lists each operation with a status:
 * 1 complete, 2 failed (can be retried as is), 3 failed (needs a change), 4 open, 5 rejected
 * (developer.adobe.com/commerce/webapi/rest/use-rest/operation-status-endpoints/). The route
 * order is ACCS's, `V1/async/bulk/<path>` (`restPrefix` in commerceRestClient.ts; measured on
 * the sandbox 2026-09-30, when 43 `products/bySku` PUTs in one call completed in 15 s).
 *
 * Pure over a send and a get it is handed, so it is tested without Commerce.
 *
 * @module features/app-builder/services/commerceBulk
 */

import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type {
    CommerceBulkAccepted,
    CommerceBulkStatus,
    CommerceGet,
    CommerceSend,
} from '@/types/commerceWire';
import type { CommerceBulkOutcome } from '@/types/erpAssign';

const COMPLETE = 1;
const OPEN = 4;

/**
 * Send one bulk call.
 *
 * @param send - the signed Commerce call
 * @param method - the verb of the synchronous route the bodies are for
 * @param path - that route under V1, its `{sku}` replaced by `bySku`, e.g. `products/bySku`
 * @param bodies - one request body per operation
 * @returns the bulk's uuid; throws when Commerce did not accept the call
 */
export async function startBulk(
    send: CommerceSend,
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    bodies: readonly unknown[],
): Promise<string> {
    const accepted = (await send(method, path, bodies, {
        bulk: true,
    })) as CommerceBulkAccepted | null;
    if (!accepted?.bulk_uuid)
        throw new Error('Commerce did not accept the bulk write (no bulk id came back).');
    return accepted.bulk_uuid;
}

/** How the follow waits: injected so a test does not wait. */
export interface BulkFollowDeps {
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    intervalMs: number;
    /** How long the follow waits for open operations before it says so and stops. */
    deadlineMs: number;
    onProgress?: (done: number, total: number) => void;
}

/**
 * How a product write is followed: every few seconds, for at most ten minutes, each read said
 * as "N of M products saved". Shared by Assign products, its undo, and removal's undo.
 */
export function productBulkFollow(onProgress: (step: string) => void): BulkFollowDeps {
    return {
        sleep,
        now: () => Date.now(),
        intervalMs: TIMEOUTS.COMMERCE_BULK_POLL_INTERVAL,
        deadlineMs: TIMEOUTS.COMMERCE_BULK_MAX,
        onProgress: (done, total) => onProgress(`${done} of ${total} products saved`),
    };
}

/** One status read, as counts. */
function outcomeOf(
    uuid: string,
    status: CommerceBulkStatus,
    expected: number,
): CommerceBulkOutcome {
    const operations = status.operations_list ?? [];
    const total = Math.max(expected, Number(status.operation_count ?? operations.length));
    const failed = operations
        .filter((op) => op.status !== COMPLETE && op.status !== OPEN)
        .map((op) => ({ index: op.id, message: op.result_message || `status ${op.status}` }));
    const complete = operations.filter((op) => op.status === COMPLETE).length;
    // An operation not listed yet is still queued.
    const open = total - complete - failed.length;
    return { uuid, total, complete, failed, open, timedOut: false };
}

/** How one request in a bulk ended: made, refused for good, worth sending again, or not run yet. */
export type BulkRowState = 'done' | 'refused' | 'retry' | 'open';

/** One request's end, by its index in the call, with Commerce's words. */
export interface BulkRow {
    index: number;
    state: BulkRowState;
    message: string;
}

const STATE_OF: Record<number, BulkRowState> = {
    1: 'done',
    2: 'retry',
    3: 'refused',
    4: 'open',
    5: 'refused',
};

/** What a request's state says when Commerce gave no words of its own. */
const UNSAID: Record<BulkRowState, string> = {
    done: 'made',
    retry: 'failed, worth trying again',
    refused: 'refused',
    open: 'still queued',
};

/**
 * Each request's end, by its index in the call. An operation's `id` is that index: a live status
 * from the Justrite ACCS store (2026-10-09) numbers a three-product call 0, 1, 2
 * (tests/fixtures/commerce-rest/bulk-status-products.json). A request not listed yet is open.
 *
 * @param get - the signed Commerce GET
 * @param uuid - the bulk's uuid
 * @param count - how many requests the call carried
 */
export async function readBulkRows(
    get: CommerceGet,
    uuid: string,
    count: number,
): Promise<BulkRow[]> {
    const status = ((await get(`bulk/${uuid}/status`)) ?? {}) as CommerceBulkStatus;
    const rows: BulkRow[] = Array.from({ length: count }, (_, index) => ({
        index,
        state: 'open',
        message: UNSAID.open,
    }));
    for (const op of status.operations_list ?? []) {
        if (!Number.isInteger(op.id) || op.id < 0 || op.id >= count) continue;
        rows[op.id] = {
            index: op.id,
            state: STATE_OF[op.status] ?? 'refused',
            message: op.result_message || UNSAID[STATE_OF[op.status] ?? 'refused'],
        };
    }
    return rows;
}

/**
 * Follow a bulk until no operation is open, or the deadline passes.
 *
 * @param get - the signed Commerce GET
 * @param uuid - the bulk's uuid
 * @param expected - how many operations were sent
 * @returns how it ended; `timedOut` when operations were still open at the deadline
 */
export async function followBulk(
    get: CommerceGet,
    uuid: string,
    expected: number,
    deps: BulkFollowDeps,
): Promise<CommerceBulkOutcome> {
    const started = deps.now();
    for (;;) {
        const status = (await get(`bulk/${uuid}/status`)) as CommerceBulkStatus;
        const outcome = outcomeOf(uuid, status ?? {}, expected);
        deps.onProgress?.(outcome.complete + outcome.failed.length, outcome.total);
        if (outcome.open <= 0) return outcome;
        if (deps.now() - started >= deps.deadlineMs) return { ...outcome, timedOut: true };
        await deps.sleep(deps.intervalMs);
    }
}
