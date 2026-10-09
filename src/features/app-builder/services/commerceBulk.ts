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

import type { CommerceGet } from './erpFillReaders';
import type { CommerceBulkAccepted, CommerceBulkStatus } from '@/types/commerceWire';
import type { CommerceBulkOutcome } from '@/types/erpAssign';

/** A signed Commerce call that answers the parsed body, or throws in Commerce's words. */
export type CommerceSend = (
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    route?: { bulk?: boolean },
) => Promise<unknown>;

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
    method: 'POST' | 'PUT',
    path: string,
    bodies: readonly unknown[],
): Promise<string> {
    const accepted = (await send(method, path, bodies, { bulk: true })) as CommerceBulkAccepted | null;
    if (!accepted?.bulk_uuid) throw new Error('Commerce did not accept the bulk write (no bulk id came back).');
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

/** One status read, as counts. */
function outcomeOf(uuid: string, status: CommerceBulkStatus, expected: number): CommerceBulkOutcome {
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
