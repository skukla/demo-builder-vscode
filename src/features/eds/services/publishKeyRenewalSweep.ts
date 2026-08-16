/**
 * Keep every storefront's runtime publish key alive.
 *
 * WHY this exists: Helix Admin API keys carry a ~1 year server expiry, and until
 * this sweep nothing renewed them. A key was minted only when something WROTE the
 * site config — setup, reset, repair, rename — so a storefront that simply ran
 * lost its key about a year after creation. The symptom is PDPs that 404 on first
 * visit, staggered per site, with nothing connecting it to a key that quietly
 * aged out.
 *
 * Runs fire-and-forget at activation, alongside `refreshGlobalMcpIfPresent` and
 * `ensureHomeAiContext`. Thirty days leaves enormous margin under a one-year
 * expiry while keeping the work to two requests per project per month.
 *
 * THE STAMP LIVES HERE, and only here. The other registration paths deliberately
 * do not write it: threading a `Project` through `registerSiteConfig` is the same
 * coupling that let two callers forget to register a key at all. The cost is that
 * this sweep may refresh a key some other path just replaced — cheap, and it
 * fails safe in the direction of the key existing.
 *
 * @module features/eds/services/publishKeyRenewalSweep
 */

import { registerPublishKey, type PublishKeyTokenProvider } from './publishKeyRegistrar';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * How long a registered key is trusted before the sweep refreshes it.
 *
 * Not derived from the server expiry on purpose: the server figure is ~1 year and
 * undocumented as an exact value, so the safe design is to renew far inside it
 * rather than to predict it.
 */
export const PUBLISH_KEY_RENEWAL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RenewPublishKeysParams {
    /** Projects to consider. Non-EDS projects are ignored. */
    projects: Project[];
    /** DA.live token source, or undefined when one could not be built. */
    tokenProvider: PublishKeyTokenProvider | undefined;
    /** Persists the stamped project. Supplied by the caller so this stays UI-free. */
    saveProject(project: Project): Promise<void>;
    logger: Logger;
    /** Injected clock, for tests. */
    now?: number;
}

/** The GitHub pair a Helix key is scoped to, or null when this is not an EDS project. */
function resolveSite(project: Project): { owner: string; repo: string } | null {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    const githubRepo = metadata?.githubRepo as string | undefined;
    if (!githubRepo) return null;

    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) return null;
    return { owner, repo };
}

/** True when the key is missing, unparseable, or older than the renewal window. */
function isDue(project: Project, now: number): boolean {
    const stamp = project.publishKeyRegisteredAt;
    if (!stamp) return true;

    const registeredAt = Date.parse(stamp);
    if (Number.isNaN(registeredAt)) return true;
    return now - registeredAt >= PUBLISH_KEY_RENEWAL_INTERVAL_MS;
}

/**
 * Refresh every EDS storefront whose publish key is due.
 *
 * Never throws: this runs on activation, where a failure must cost a renewal and
 * nothing else.
 */
export async function renewPublishKeys(params: RenewPublishKeysParams): Promise<void> {
    const { projects, tokenProvider, saveProject, logger, now = Date.now() } = params;

    if (!tokenProvider) return;

    // One session check for the whole sweep rather than per project. No session is
    // the ordinary state at activation and says nothing about the keys, so it is
    // a debug line — warning here would fire on every cold start and train the
    // reader to ignore the channel that carries the real failures.
    const token = await tokenProvider.getAccessToken().catch(() => null);
    if (!token) {
        logger.debug('[PublishKey] Renewal sweep skipped — no DA.live session');
        return;
    }

    let renewed = 0;
    for (const project of projects) {
        const site = resolveSite(project);
        if (!site || !isDue(project, now)) continue;

        try {
            const result = await registerPublishKey(tokenProvider, site, logger);
            // Stamp only on success. Stamping a failure would suppress the retry
            // for a further 30 days and leave the storefront with a dead key that
            // the sweep considers handled.
            if (!result.registered) continue;

            project.publishKeyRegisteredAt = new Date(now).toISOString();
            await saveProject(project);
            renewed++;
        } catch (error) {
            // One project must never cost the rest of the sweep.
            logger.debug(
                `[PublishKey] Renewal failed for ${site.owner}/${site.repo}: ` +
                    `${(error as Error).message}`,
            );
        }
    }

    if (renewed > 0) {
        logger.info(
            `[PublishKey] Renewed the publish key for ${renewed} storefront(s) — ` +
                'products added later can still publish on first visit',
        );
    }
}
