/**
 * Read the store scope a storefront is ACTUALLY serving.
 *
 * `config.json` on the CDN is the Configure screen's output: a save marks the
 * project `stale`, and Republish regenerates and publishes this file. So the
 * project manifest and this file are EXPECTED to differ between a save and a
 * republish — that window is normal and already tracked by
 * `edsStorefrontStatusSummary`.
 *
 * What that status cannot tell you is whether the publish actually took.
 * `detectStorefrontChanges` compares the recorded published state against new
 * settings — bookkeeping against intent. It never reads the CDN, so a failed or
 * partial publish leaves the status reading `published` while the storefront
 * serves something else. This module measures the real thing.
 *
 * @module features/eds/services/storefront/servedStorefrontConfig
 */

import { aemLiveBaseUrl } from './storefrontProbe';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** The Commerce store scope, as either config expresses it. */
export interface StoreScope {
    websiteCode?: string;
    storeCode?: string;
    storeViewCode?: string;
}

/** What the live storefront is serving. */
export interface ServedStorefrontConfig {
    commerceEndpoint?: string;
    scope: StoreScope;
}

/** What a storefront `config.json` says, wherever it was read from (the CDN or a repository). */
export interface StorefrontConfigJson extends ServedStorefrontConfig {
    /** The `config.public.default` boolean flags, e.g. `commerce-b2b-enabled` (ADR-009). */
    flags: Record<string, boolean>;
}

/**
 * Read the store scope, endpoint and flags out of a parsed `config.json`.
 * `undefined` when the file has no `public.default` block — the one shape
 * that means "this is not a storefront config".
 *
 * @param json - The parsed file
 */
export function parseStorefrontConfigJson(json: unknown): StorefrontConfigJson | undefined {
    const defaults = (json as { public?: { default?: Record<string, unknown> } } | null)?.public
        ?.default;
    if (!defaults || typeof defaults !== 'object') return undefined;

    const headers = defaults.headers as { cs?: Record<string, unknown> } | undefined;
    const cs = headers?.cs;
    const endpoint = defaults['commerce-endpoint'];
    const flags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(defaults)) {
        if (typeof value === 'boolean') flags[key] = value;
    }

    return {
        commerceEndpoint: typeof endpoint === 'string' ? endpoint : undefined,
        scope: {
            websiteCode: header(cs, 'Magento-Website-Code'),
            storeCode: header(cs, 'Magento-Store-Code'),
            storeViewCode: header(cs, 'Magento-Store-View-Code'),
        },
        flags,
    };
}

/** Read a header value, tolerating a missing or malformed headers block. */
function header(cs: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = cs?.[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Fetch and parse the storefront's served `config.json`.
 *
 * Best-effort by design: every failure returns undefined so the caller falls
 * back to the manifest. An unreachable CDN is not a reason to have no answer at
 * all.
 *
 * @param owner - GitHub owner
 * @param repo - GitHub repository name
 * @param logger - for the skip reason
 * @returns The served endpoint and scope, or undefined when it cannot be read
 */
export async function fetchServedStorefrontConfig(
    owner: string,
    repo: string,
    logger: Logger,
): Promise<ServedStorefrontConfig | undefined> {
    const url = `${aemLiveBaseUrl(owner, repo)}/config.json`;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        if (!response.ok) {
            logger.debug(`[Served Config] ${url} returned HTTP ${response.status}`);
            return undefined;
        }

        const parsed = parseStorefrontConfigJson(await response.json());
        if (!parsed) {
            logger.debug('[Served Config] config.json has no public.default block');
            return undefined;
        }
        const { commerceEndpoint, scope } = parsed;
        return { commerceEndpoint, scope };
    } catch (error) {
        logger.debug(`[Served Config] Could not read ${url}: ${(error as Error).message}`);
        return undefined;
    }
}

/** Whether two scopes name the same website / store / store view. */
export function scopesMatch(a: StoreScope, b: StoreScope): boolean {
    return (
        a.websiteCode === b.websiteCode &&
        a.storeCode === b.storeCode &&
        a.storeViewCode === b.storeViewCode
    );
}

/** Render a scope for a log or report line. */
export function describeScope(scope: StoreScope): string {
    const parts = [scope.websiteCode ?? '—', scope.storeCode ?? '—', scope.storeViewCode ?? '—'];
    return parts.join(' / ');
}
