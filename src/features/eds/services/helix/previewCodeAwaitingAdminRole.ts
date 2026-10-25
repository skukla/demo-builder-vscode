/**
 * Publish code right after a site gained an admin, waiting out a 401 while the
 * admin role propagates.
 *
 * Pinning a site admin makes Helix require the DA.live IMS Bearer for the code
 * publish (eds-publish-and-config rule 5). `previewCode` already sends it
 * (`tryAdminBearer`), and that same call publishes the code of an established
 * pinned site — the dashboard's Republish did, on skukla/scratch-1022, 2026-10-22.
 * Yet on skukla/scratch-1022-b the first publish after the AEM Code Sync App was
 * added, 36 seconds after the admin was pinned, answered 401. That is inside the
 * documented 30–90s admin-role propagation window the Configuration Service
 * registration already waits out on a 403, so the same delays are used here.
 *
 * NOT VERIFIED that propagation is the cause: no second publish was made on that
 * site. The command that would falsify it is one code publish on scratch-1022-b
 * now — a 401 there means the Bearer is refused outright and waiting cannot help.
 *
 * Only a 401 waits. Every other failure is thrown at once, as `previewCode` threw it.
 *
 * @module features/eds/services/helix/previewCodeAwaitingAdminRole
 */

import { CONFIG_SERVICE_PROPAGATION_DELAYS_MS } from '../configService/siteConfigRegistrar';
import { ADMIN_API_401_MESSAGE } from './helixAdminErrors';
import type { HelixCodePreview } from './helixCapabilities';
import { sleep } from '@/core/utils/sleep';
import type { Logger } from '@/types/logger';

/** What to publish: the repository, the path, and the branch (Helix's default when absent). */
interface CodePublishTarget {
    owner: string;
    repo: string;
    path: string;
    branch?: string;
}

/**
 * Publish `target`'s code, retrying a 401 across the admin-role propagation window.
 *
 * @param helix - the Helix service, built on the DA.live token provider
 * @param target - what to publish
 * @param logger - logger
 * @throws the last 401 when it never clears, or any other failure at once
 */
export async function previewCodeAwaitingAdminRole(
    helix: HelixCodePreview,
    target: CodePublishTarget,
    logger: Logger,
): Promise<void> {
    const { owner, repo, path, branch } = target;
    for (let attempt = 0; ; attempt++) {
        try {
            // No branch argument at all when none was given, so Helix's default applies.
            await (branch === undefined
                ? helix.previewCode(owner, repo, path)
                : helix.previewCode(owner, repo, path, branch));
            return;
        } catch (error) {
            const delay = CONFIG_SERVICE_PROPAGATION_DELAYS_MS[attempt];
            if ((error as Error).message !== ADMIN_API_401_MESSAGE || delay === undefined) {
                throw error;
            }
            logger.info(
                `[Helix] Code publish for ${owner}/${repo} got a 401 — the site's admin role ` +
                    `may still be propagating; trying again in ${delay / 1000}s`,
            );
            await sleep(delay);
        }
    }
}
