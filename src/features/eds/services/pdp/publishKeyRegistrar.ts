/**
 * Register this storefront's publish key with the shared PDP action.
 *
 * WHY: storefront setup pins a site admin, which sets `requireAuth: "auto"` and
 * closes the Helix admin API to anonymous callers. The runtime smart-404
 * handler that publishes a PDP on first visit runs in the VISITOR's BROWSER and
 * can never hold a credential — so the shared `prepublish-pdp` action holds one
 * per site, and only we can mint it (we hold the DA.live bearer Helix accepts).
 *
 * Without this, a product an SC adds after setup 404s forever: the page was
 * never pre-published and the fallback cannot publish it either. SCs add
 * products routinely, so that is a main path, not an edge case.
 *
 * WHEN to call it — TWO triggers, and the second is easy to miss:
 *   1. after storefront setup registers the site config, and
 *   2. after ANY later site config write (edit, reset, repair).
 * `apiKeys` lives INSIDE the site config document, so the delete-then-re-register
 * that `updateSiteConfig` performs destroys the key server-side. Measured
 * 2026-08-15: 1 key → delete → re-register → 0 keys. The key cannot be captured
 * and restored the way admin grants are, because a key value is unreadable after
 * creation — re-minting is the only option.
 *
 * NON-FATAL by design, exactly like `pinSiteAdmin`: a storefront without a
 * registered key still works for every pre-published PDP, and the next config
 * write retries. Never throws.
 *
 * Backlog: `.rptc/backlog/pdp-prewarm-401-after-admin-pinning.md`
 */

import { HelixService } from '../helix/helixService';
import { deriveRegisterKeyUrl } from '../pdp/pdp404Snippet';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { resolveByomOverlayUrl } from '@/features/eds/handlers/edsHelpers';
import type { Logger } from '@/types/logger';

/**
 * Minimal DA.live token source — the same shape `pinSiteAdmin` takes.
 *
 * Exported so `siteConfigRegistrar` can name what it forwards. Keeping one type
 * means the registrar cannot drift from what this function accepts.
 */
export interface PublishKeyTokenProvider {
    getAccessToken(): Promise<string | null>;
}

export interface RegisterPublishKeyResult {
    registered: boolean;
    /** Why it did not register. Present only when `registered` is false. */
    reason?: string;
}

/**
 * The Helix calls this function makes, as a seam a caller can supply.
 *
 * `HelixService` is STATELESS — its credentials arrive at construction and are never
 * mutated — so building one here costs nothing and the construction stays put
 * (ADR-015's amendment rules on state, not location). What it did cost was TEST
 * DESIGN: a suite that cannot hand the collaborator in has to `jest.mock` the whole
 * module, and 25 suites do exactly that. ADR-016 records the list and calls converting
 * them the largest test-design win available.
 *
 * So this is the injection seam `tests/README.md` already prescribes for config leaves,
 * applied to a service: production callers take the default and are unchanged; a test
 * passes a fake through the front door and asserts on the ARGUMENTS it received, which
 * a module mock cannot see.
 */
export interface PublishKeyHelix {
    forgetApiKey(owner: string, repo: string): Promise<void>;
    createAdminApiKey(owner: string, repo: string): Promise<string | null>;
}

/** The real Helix, bound to this call's logger and token source. */
const realHelix = (logger: Logger, tokenProvider: PublishKeyTokenProvider): PublishKeyHelix => ({
    forgetApiKey: (owner, repo) => HelixService.forgetApiKey(owner, repo),
    createAdminApiKey: (owner, repo) =>
        new HelixService(logger, undefined, tokenProvider).createAdminApiKey(owner, repo),
});

/**
 * Mint a fresh site-scoped publish key and register it with the shared action.
 *
 * Always re-mints rather than reusing a cached key: the only reason to call this
 * is that a config write just happened, which destroyed whatever key existed.
 *
 * @param tokenProvider DA.live token source (authenticates BOTH the mint and the register)
 * @param site          `{ owner, repo }` — the Helix org/site pair
 * @param logger        pipeline logger; failures land here, never as a throw
 * @param helix         Helix seam; defaults to the real service. Tests hand in a fake.
 */
export async function registerPublishKey(
    tokenProvider: PublishKeyTokenProvider,
    site: { owner: string; repo: string },
    logger: Logger,
    helix: PublishKeyHelix = realHelix(logger, tokenProvider),
): Promise<RegisterPublishKeyResult> {
    const target = `${site.owner}/${site.repo}`;
    try {
        const overlayUrl = resolveByomOverlayUrl();
        if (!overlayUrl) {
            // Expected on every non-BYOM storefront — not a problem to report.
            return skip('BYOM disabled — no overlay URL', target, logger, 'debug');
        }
        const registerUrl = deriveRegisterKeyUrl(overlayUrl);
        if (!registerUrl) {
            return skip(
                `overlay URL is not a recognizable render-pdp URL (check demoBuilder.byom.overlayUrl)`,
                target,
                logger,
            );
        }

        // The previous key died with the last config write; drop our stale copy
        // so the mint below is genuinely fresh rather than a cache hit.
        await helix.forgetApiKey(site.owner, site.repo);

        logger.debug(`[PublishKey] Minting a publish key for ${target}`);
        const publishKey = await helix.createAdminApiKey(site.owner, site.repo);
        if (!publishKey) {
            return skip('could not mint a publish key from the Config Service', target, logger);
        }

        const daLiveToken = await tokenProvider.getAccessToken();
        if (!daLiveToken) {
            return skip(
                'no DA.live session — sign in and run "Demo Builder: Repair Site Configuration"',
                target,
                logger,
            );
        }

        const response = await fetch(registerUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${daLiveToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ org: site.owner, site: site.repo, key: publishKey }),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        if (!response.ok) {
            return skip(`registration returned ${response.status}`, target, logger);
        }

        // Say what it BUYS, not just that it happened — a reader scanning logs
        // for why PDPs 404 needs to recognise this line as the thing that works.
        logger.info(
            `[PublishKey] Registered a publish key for ${target} — ` +
                'products added after setup can now publish on first visit',
        );
        return { registered: true };
    } catch (error) {
        return skip((error as Error).message, target, logger);
    }
}

/**
 * Report a non-registration, at the level its consequence deserves.
 *
 * WARN by default and say what breaks. This feature's entire failure mode is
 * silence — an unregistered key surfaces later as "some PDPs 404", with nothing
 * connecting the two. A log line naming the consequence is the only breadcrumb
 * between them.
 *
 * `debug` is for the genuinely uninteresting case (BYOM off), because warning on
 * every non-BYOM storefront trains the reader to ignore the channel.
 */
function skip(
    reason: string,
    target: string,
    logger: Logger,
    level: 'warn' | 'debug' = 'warn',
): RegisterPublishKeyResult {
    if (level === 'debug') {
        logger.debug(`[PublishKey] Not registered for ${target}: ${reason}`);
    } else {
        logger.warn(
            `[PublishKey] No publish key registered for ${target}: ${reason}. ` +
                'Products added to the catalog after setup will 404 on first visit ' +
                'until this succeeds.',
        );
    }
    return { registered: false, reason };
}
