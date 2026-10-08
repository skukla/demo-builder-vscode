/**
 * The SDK-first read path every Adobe entity listing shares.
 *
 * Each listing (organizations, projects, workspaces) goes SDK-first, bounded by
 * a deadline — a stalled Adobe endpoint must not make the "fast path" slower
 * than the CLI — and falls back to the CLI when the SDK cannot answer. This file
 * holds the SDK half of that rule, and the org-id resolution the project and
 * workspace reads share. The listings themselves live in `adobeOrgReads.ts`,
 * `adobeProjectReads.ts` and `adobeWorkspaceReads.ts`.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23);
 * the listings split out by entity on 2026-10-08 (EDS-8).
 *
 * @module features/authentication/services/adobeEntityReads
 */

import type { AdobeSDKClient } from './adobeSDKClient';
import type { AdobeOrg, SDKResponse } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import { tryWithTimeout } from '@/core/utils/promiseUtils';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** Where the TOKEN org is read from: the SDK-only org list. */
export type TokenOrgSource = () => Promise<AdobeOrg[] | undefined>;

/**
 * Runs one SDK listing call under the deadline and says whether the SDK answered.
 */
export class SdkEntityFetch {
    private debugLogger = getLogger();

    constructor(private sdkClient: AdobeSDKClient) {}

    /**
     * Ensure SDK is initialized (lazy init pattern)
     */
    async ensureSDKReady(): Promise<void> {
        if (!this.sdkClient.isInitialized()) {
            await this.sdkClient.ensureInitialized();
        }
    }

    /**
     * Try SDK fetch with automatic fallback.
     *
     * @returns the mapped results, or `undefined` when the SDK could not answer
     *   (not initialized, failed, timed out, or returned an invalid shape). An
     *   EMPTY ARRAY is a real answer — "the API says there are none" — and the
     *   two must stay distinguishable: conflating them is what made a token that
     *   reaches zero orgs read as "SDK unavailable" on the dashboard (2026-08-13).
     */
    async trySDKFetch<TRaw, TMapped>(
        sdkCall: () => Promise<SDKResponse<TRaw[]>>,
        mapper: (raw: TRaw[]) => TMapped[],
        entityName: string,
        startTime: number,
    ): Promise<TMapped[] | undefined> {
        if (!this.sdkClient.isInitialized()) return undefined;

        // Bound the SDK attempt. SDK-first is justified only by "faster than the CLI, or
        // fail fast": without a deadline a stalled Adobe endpoint (observed: the org-list
        // gateway timing out ~60s) makes the "fast path" far slower than the ~3s CLI
        // fallback. Cap the call and fall back instead of riding the remote ceiling.
        const outcome = await tryWithTimeout(sdkCall(), {
            timeoutMs: TIMEOUTS.SDK_ENTITY_FETCH,
            timeoutMessage: `SDK ${entityName} fetch`,
        });

        if (outcome.timedOut) {
            this.debugLogger.warn(
                `[Entity Fetcher] SDK ${entityName} fetch exceeded ` +
                    `${formatDuration(TIMEOUTS.SDK_ENTITY_FETCH)}, falling back to CLI`,
            );
            return undefined;
        }

        if (outcome.error || !outcome.result) {
            // The REASON rides in the warning, not in a trace line.
            //
            // `trace` is priority 4 and the default `demoBuilder.logLevel` is
            // `debug` (3), so it never emits on a default install. A user's log on
            // 2026-08-17 contained zero trace lines while showing "SDK initialized
            // successfully" followed 120ms later by "SDK unavailable" — every org
            // read for the whole session, with the cause written where nobody could
            // read it. That silence is what made the failure look like an auth
            // problem and cost three pointless sign-ins.
            const reason =
                outcome.error instanceof Error
                    ? `${outcome.error.name}: ${outcome.error.message}`
                    : String(outcome.error ?? 'no result returned');
            this.debugLogger.warn(
                `[Entity Fetcher] SDK unavailable, using slower CLI fallback for ${entityName} — ${reason}`,
            );
            return undefined;
        }

        const sdkResult = outcome.result;
        if (!sdkResult.body || !Array.isArray(sdkResult.body)) {
            this.debugLogger.warn(
                `[Entity Fetcher] SDK returned an invalid ${entityName} response, falling back to CLI`,
            );
            return undefined;
        }

        const mapped = mapper(sdkResult.body);
        this.debugLogger.debug(
            `[Entity Fetcher] Retrieved ${mapped.length} ${entityName} via SDK in ${formatDuration(Date.now() - startTime)}`,
        );
        return mapped;
    }
}

/**
 * Resolve the org id an SDK entity fetch should target.
 *
 * Prefers the caller-supplied id (the threaded selection, then the
 * cached/ambient org). When neither is present, falls back to the TOKEN org
 * (`getOrganizationsSdkOnly()[0]` — the canonical "token org is truth"
 * convention, same source `detectProjectOrgMismatch` uses) via the SDK, NOT
 * the CLI. That keeps an un-threaded, un-cached fetch on the SDK path instead
 * of dropping to the CLI fallback, which targets the STALE `aio console` org
 * and 403s -> ORG_MISMATCH (a slow, noisy failure).
 *
 * `getOrganizationsSdkOnly` is self-guarding: it returns undefined (→ this
 * returns undefined) when the SDK isn't initialized, so the caller then keeps
 * its existing return-[] → CLI path. Deliberately SDK-only to avoid a
 * circular CLI dependency.
 *
 * @param preferredOrgId - the threaded or cached org id, when there is one
 * @param tokenOrgSource - the SDK-only org list (`AdobeOrgReads.getOrganizationsSdkOnly`)
 * @returns the org id to fetch for, or undefined when none can be resolved
 */
export async function resolveEffectiveOrgId(
    preferredOrgId: string | undefined,
    tokenOrgSource: TokenOrgSource,
): Promise<string | undefined> {
    if (preferredOrgId && preferredOrgId.length > 0) return preferredOrgId;
    return (await tokenOrgSource())?.[0]?.id;
}
