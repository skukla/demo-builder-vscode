/**
 * Smart 404 handler — what one storefront's script is, before anything is written.
 *
 * The recovery script lives inline in the storefront code's `404.html` (since 2026-10-29;
 * `pdp404Page.ts` says why and places it), the eager script in `head.html` and `404.html`.
 * `bringStorefrontUpToDate` writes every file: `404.html` once with everything it needs,
 * `head.html` and the old `scripts/delayed.js` copy through `storefrontCodeBlocks.ts`.
 *
 * The script text is authored in `./pdp404Snippet`.
 */

import { buildSmart404Snippet, derivePrepublishUrl } from './pdp404Snippet';
import type { Logger } from '@/types/logger';

export { derivePrepublishUrl } from './pdp404Snippet';

/**
 * Whether a storefront has the recovery script after an install. Surfaces in the
 * pipeline log and the setup/reset reports.
 */
export interface Pdp404InstallResult {
    installed: boolean;
    /** Set when installed=false to explain why. */
    reason?: string;
}

/** The recovery script for one storefront, or why it has none. */
export type Smart404Handler = { handler: string } | { installed: false; reason: string };

/**
 * Build the storefront's recovery script. Writes nothing.
 *
 * No script when BYOM is off (no `overlayUrl`) or the overlay URL does not name a
 * `render-pdp` action to derive `prepublish-pdp` from. A storefront without the script
 * still works: a visitor to a cold page gets the plain 404.
 */
export function prepareSmart404Handler(
    overlayUrl: string | undefined,
    logger: Logger,
    daLiveOrg: string,
    daLiveSite: string,
): Smart404Handler {
    if (!overlayUrl) {
        logger.info('[PDP404] BYOM disabled (no overlayUrl) — skipping smart 404 install');
        return { installed: false, reason: 'BYOM disabled' };
    }
    const triggerUrl = derivePrepublishUrl(overlayUrl);
    if (!triggerUrl) {
        logger.warn(
            '[PDP404] Could not derive prepublish-pdp URL from overlay URL — skipping smart 404 install',
        );
        return { installed: false, reason: 'invalid overlay URL' };
    }
    return { handler: buildSmart404Snippet(triggerUrl, daLiveOrg, daLiveSite) };
}
