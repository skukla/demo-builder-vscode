/**
 * credentialCoverage — "does this workspace already hold every API we need?"
 *
 * The one question that lets a deploy skip the subscribe entirely. It lives apart
 * from `apiSubscriber` because it answers a DIFFERENT kind of question: the
 * subscriber changes Adobe, this only looks, and looking has its own rules about
 * how long it may take and what a non-answer means.
 *
 * **It is bounded, because its only job is to save time.** On Bodea, 2026-09-19,
 * Adobe answered it in about a second on one deploy — the whole subscribe step
 * took 11.7s — and returned 504 ("upstream request timeout") on the other three
 * after ~60s each. Those three paid a minute to learn nothing and then subscribed
 * anyway. Past `TIMEOUTS.CREDENTIAL_PROBE` the answer is worth less than the wait.
 *
 * Any doubt answers NO — no lister, no credentials, a failed call, a slow call —
 * and the caller takes the full path, which is always correct and only slower.
 *
 * @module features/app-builder/services/credentialCoverage
 */

import { extractErrorMessage } from '@/core/errors';
import { withTimeout } from '@/core/utils/promiseUtils';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * What a long operation says about ITSELF while it runs, beside any per-item ticks.
 *
 * The step is one short line for the screen — the subscribe is the step of a deploy
 * most likely to sit still for a minute, and a stage name alone reads as frozen
 * (owner, 2026-09-19). The log is where the branch decision goes: which path a
 * deploy took, and why, is otherwise unknowable afterwards.
 */
export interface SubscribeObservers {
    onStep?: (step: string) => void;
    log?: (message: string) => void;
}

/**
 * The observers, plus whether to skip the coverage read. An ADD skips it: its
 * workspace is new or shared with a partner that never needed its APIs, so the
 * answer is always "something is missing", and the read spent 10s saying so on
 * each half of the first live ERP add (2026-09-21).
 */
export interface SubscribeOptions extends SubscribeObservers {
    skipCoverageCheck?: boolean;
    /**
     * Called with the Commerce product profile the subscribe chose from Adobe's
     * catalog, so the caller can keep it on the project for the days the catalog
     * does not list it (see `RememberedProfile`).
     */
    onProfileResolved?: (profile: { tenant: string; id: string; productId: string }) => void | Promise<void>;
}

/** The reads this question needs — the subset of `ApiSubscriberClient` it uses. */
export interface CredentialReader {
    listCredentialIds?(target: { orgId: string; projectId: string; workspaceId: string }): Promise<string[]>;
    getSubscribedServiceCodes(orgId: string, idIntegration: string): Promise<string[]>;
}

export interface CoverageQuestion {
    required: string[];
    target: { orgId: string; projectId: string; workspaceId: string };
    client: CredentialReader;
    /**
     * Codes this reconcile takes away. A removal always answers NO: only the full
     * path reaches the PUT that drops a code.
     */
    removing: ReadonlySet<string>;
    observe?: SubscribeObservers;
}

/**
 * Whether the workspace's existing credentials, between them, already carry every
 * required API.
 *
 * @returns true only when the read finished in time and nothing was missing
 */
export async function credentialsAlreadyCover({
    required,
    target,
    client,
    removing,
    observe,
}: CoverageQuestion): Promise<boolean> {
    const { listCredentialIds } = client;
    if (!listCredentialIds || removing.size > 0) return false;
    const startedAt = Date.now();
    const read = async (): Promise<boolean> => {
        const ids = await listCredentialIds(target);
        if (ids.length === 0) return false;
        const lists = await Promise.all(ids.map((id) => client.getSubscribedServiceCodes(target.orgId, id)));
        const have = new Set(lists.flat());
        return required.every((code) => have.has(code));
    };
    try {
        const covered = await withTimeout(read(), {
            timeoutMs: TIMEOUTS.CREDENTIAL_PROBE,
            timeoutMessage: "the read of the workspace's credentials",
        });
        observe?.log?.(
            `[APIs] credentials read in ${formatDuration(Date.now() - startedAt)}: ` +
                `${covered ? 'everything needed is there — skipping the subscribe' : 'something is missing — subscribing'}`,
        );
        return covered;
    } catch (error) {
        // Recorded as a decision, not a failure: the subscribe still runs, and
        // this line is the only record of which path a deploy took.
        observe?.log?.(
            `[APIs] credentials read gave up after ${formatDuration(Date.now() - startedAt)} ` +
                `(${extractErrorMessage(error)}) — subscribing without it`,
        );
        return false;
    }
}
