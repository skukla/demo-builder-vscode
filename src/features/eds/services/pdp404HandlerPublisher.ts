/**
 * Smart 404 page publisher — Phase 1 of BYOM PDP routing.
 *
 * Generates a custom `/404.html` document and publishes it to the
 * storefront's DA.live site, then runs preview+publish via Helix admin
 * so it serves on the live tier for every 404 the storefront returns.
 *
 * The page contains embedded JS that:
 *   1. Detects PDP-shape URLs (`/products/{urlKey}/{sku}`).
 *   2. Tries a lowercase variant via HEAD — handles the case where a
 *      prior visitor already triggered the publish. (Helix normalizes
 *      content-bus paths to lowercase before storing, so storefront PLPs
 *      that generate mixed-case URLs need this redirect to find the
 *      cached page.)
 *   3. Otherwise POSTs to the sibling `prepublish-pdp` action with the
 *      lowercase path. The action calls Helix admin preview+publish on
 *      the storefront's behalf and returns success.
 *   4. Reloads to the lowercase URL with a `?pdpRetry=1` guard so we
 *      never loop infinitely on a real failure.
 *
 * Together with the existing `render-pdp` overlay registration, this is
 * everything Demo Builder ships for Phase 1 PDP routing. See
 * `docs/architecture/eds-byom-pdp-routing.md` for the full architecture
 * and ADR-005 for the decision rationale.
 *
 * @module features/eds/services/pdp404HandlerPublisher
 */

import { DaLiveContentOperations } from './daLiveContentOperations';
import { HelixService } from './helixService';
import type { Logger } from '@/types/logger';

/**
 * Smart 404 HTML template. Three substitutions handled by
 * `buildSmart404Html`:
 *   __TRIGGER_URL__ — sibling `prepublish-pdp` endpoint URL
 *   __ORG__         — storefront's DA.live org (also the action's `org` param)
 *   __SITE__        — storefront's DA.live site (also the action's `site` param)
 *
 * Kept compact so the page loads fast even on slow connections; the
 * goal is "trigger publish, redirect" not "show a beautiful error page."
 * The storefront's `scripts.js` decorates this with the standard
 * header/footer chrome when EDS serves it.
 */
const SMART_404_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loading product…</title>
</head>
<body>
<main></main>
<script>
(async () => {
  const RETRY_FLAG = 'pdpRetry';
  const fallback = () => { document.querySelector('main').innerHTML = '<h1>Page Not Found</h1>'; };

  const m = location.pathname.match(/^\\/products\\/([^/]+)\\/([^/]+)$/);
  if (!m) { fallback(); return; }

  // Infinite-loop guard: if we already redirected once and ended up
  // back on the 404, give up rather than retry.
  if (new URLSearchParams(location.search).has(RETRY_FLAG)) {
    document.querySelector('main').innerHTML = '<h1>Product not available</h1>';
    return;
  }

  const [, urlKey, sku] = m;
  const lc = '/products/' + urlKey.toLowerCase() + '/' + sku.toLowerCase();

  // Fast path: the lowercase variant may already be published by a
  // previous visitor. HEAD-check before invoking the trigger.
  if (lc !== location.pathname) {
    try {
      const head = await fetch(lc, { method: 'HEAD' });
      if (head.ok) { location.replace(lc); return; }
    } catch (_) { /* fall through to trigger */ }
  }

  // Slow path: call the sibling action to trigger Helix admin
  // preview+publish for the lowercase path, then reload.
  const triggerUrl = '__TRIGGER_URL__?org=__ORG__&site=__SITE__&path=' + encodeURIComponent(lc);
  try {
    const r = await fetch(triggerUrl, { method: 'POST' });
    if (r.ok) {
      const sep = lc.includes('?') ? '&' : '?';
      location.replace(lc + sep + RETRY_FLAG + '=1');
      return;
    }
  } catch (_) { /* fall through */ }

  document.querySelector('main').innerHTML = '<h1>Product not available</h1>';
})();
</script>
</body>
</html>
`;

/**
 * Maximum overlay URL length we'll accept when deriving the trigger URL.
 * Same cap the BYOM overlay setting uses; defends against pathological
 * pasted values.
 */
const TRIGGER_URL_MAX_LENGTH = 2048;

/**
 * Generate the smart 404 page HTML for a specific storefront.
 *
 * Substitutes the three runtime values into the static template. Returns
 * the HTML string, ready to be written to DA.live.
 */
export function buildSmart404Html(triggerUrl: string, org: string, site: string): string {
    return SMART_404_TEMPLATE
        .replace(/__TRIGGER_URL__/g, triggerUrl)
        .replace(/__ORG__/g, encodeURIComponent(org))
        .replace(/__SITE__/g, encodeURIComponent(site));
}

/**
 * Derive the `prepublish-pdp` trigger endpoint URL from the configured
 * `render-pdp` overlay URL.
 *
 * Both actions are siblings in the same App Builder package — the
 * overlay handles preview-time content; the trigger handles runtime
 * publish requests. By convention, the only difference in their URLs
 * is the action name segment.
 *
 * Strips the `?org=&site=` query the overlay URL carries (those are
 * stamped on per-storefront for the overlay's telemetry; the smart 404
 * appends fresh ones at request time).
 *
 * Returns `undefined` when the input doesn't look like a parseable
 * overlay URL — callers skip publishing the smart 404 in that case
 * rather than ship a broken page.
 */
export function derivePrepublishUrl(overlayUrl: string): string | undefined {
    if (overlayUrl.length > TRIGGER_URL_MAX_LENGTH) return undefined;
    let parsed: URL;
    try {
        parsed = new URL(overlayUrl);
    } catch {
        return undefined;
    }
    if (!/\/render-pdp\/?$/.test(parsed.pathname)) return undefined;
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/render-pdp\/?$/, '/prepublish-pdp');
    return parsed.toString();
}

/**
 * Outcome of a single publish attempt. Surfaces in the pipeline log
 * and is asserted by the tests.
 */
export interface Pdp404PublishResult {
    published: boolean;
    /** Set when published=false to explain why the step was skipped. */
    reason?: string;
}

/**
 * Publish the smart 404 page for one storefront.
 *
 * Non-fatal at every step: any failure is logged and the function
 * returns `{ published: false, reason }`. The storefront still works
 * without the smart 404 — visitors hitting cold PDPs just get the
 * default Helix 404 page. We never want this step to break a create
 * or reset.
 *
 * Skip cases:
 *   - BYOM disabled (`overlayUrl` is `undefined`): nothing to register.
 *   - Overlay URL doesn't parse or doesn't have the expected shape:
 *     can't derive the trigger URL.
 *   - DA write fails (network, auth): log and skip.
 *   - Helix preview/publish fails: log and skip.
 */
export async function publishSmart404Handler(
    helixService: HelixService,
    daLiveContentOps: DaLiveContentOperations,
    daLiveOrg: string,
    daLiveSite: string,
    repoOwner: string,
    repoName: string,
    overlayUrl: string | undefined,
    logger: Logger,
): Promise<Pdp404PublishResult> {
    if (!overlayUrl) {
        logger.info('[PDP404] BYOM disabled (no overlayUrl) — skipping smart 404 publish');
        return { published: false, reason: 'BYOM disabled' };
    }

    const triggerUrl = derivePrepublishUrl(overlayUrl);
    if (!triggerUrl) {
        logger.warn('[PDP404] Could not derive prepublish-pdp URL from overlay URL — skipping smart 404 publish');
        return { published: false, reason: 'invalid overlay URL' };
    }

    const html = buildSmart404Html(triggerUrl, daLiveOrg, daLiveSite);

    // Write to DA.live. `createSource` returns a structured result rather
    // than throwing; turn a non-success into a skip with a reason.
    const writeResult = await daLiveContentOps.createSource(
        daLiveOrg, daLiveSite, '/404.html', html, { overwrite: true },
    );
    if (!writeResult.success) {
        logger.warn(`[PDP404] DA.live write failed: ${writeResult.error ?? 'unknown'} — skipping publish`);
        return { published: false, reason: `DA write failed: ${writeResult.error ?? 'unknown'}` };
    }
    logger.info(`[PDP404] Wrote /404.html to ${daLiveOrg}/${daLiveSite}`);

    // Preview + publish via Helix admin. `previewAndPublishPage` throws
    // on network failure or non-2xx from Helix; catch and skip.
    try {
        await helixService.previewAndPublishPage(repoOwner, repoName, '/404');
        logger.info(`[PDP404] Smart 404 handler published to ${repoOwner}/${repoName}`);
        return { published: true };
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(`[PDP404] Helix preview/publish failed: ${reason} — page is in DA but not yet on live tier`);
        return { published: false, reason: `Helix publish failed: ${reason}` };
    }
}
