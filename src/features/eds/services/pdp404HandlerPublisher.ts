/**
 * Smart 404 handler installer — Phase 1 of BYOM PDP routing.
 *
 * Vendors a small JS snippet into the storefront's `scripts/delayed.js`
 * that fires when EDS serves a 404 for a cold PDP URL. The snippet:
 *
 *   1. Gates on `window.isErrorPage` (set by the storefront's head.html
 *      whenever Helix returns a 404), so it's inert on every other page.
 *   2. Detects PDP-shape URLs (`/products/{urlKey}/{sku}`).
 *   3. Tries a lowercase variant via HEAD first — handles the case where
 *      a prior visitor already triggered the publish. (Helix normalizes
 *      content-bus paths to lowercase before storing, so storefront PLPs
 *      that generate mixed-case URLs need this redirect to find the
 *      cached page.)
 *   4. Otherwise POSTs to the sibling `prepublish-pdp` action with the
 *      lowercase path. The action calls Helix admin preview+publish on
 *      the storefront's behalf and returns success.
 *   5. Reloads to the lowercase URL with a `?pdpRetry=1` guard so we
 *      never loop infinitely on a real failure.
 *
 * Why vendor into `delayed.js` rather than publish an authored `/404`
 * page (the v1 approach we shipped earlier today): EDS's content
 * decoration pipeline strips `<script>` tags from authored content for
 * security, so an authored `/404` page with embedded JS publishes as
 * empty content. Visitors hitting cold PDPs would just see the EDS
 * default 404 page with no recovery. Vendoring into `delayed.js` mirrors
 * the existing inspector-tagging pattern — the snippet rides the
 * storefront's code, not its content, and never gets stripped.
 *
 * Together with the existing `render-pdp` overlay registration, this is
 * everything Demo Builder ships for Phase 1 PDP routing. See
 * `docs/architecture/eds-byom-pdp-routing.md` for the full architecture
 * and ADR-005 for the decision rationale.
 *
 * @module features/eds/services/pdp404HandlerPublisher
 */

import { GitHubFileOperations } from './githubFileOperations';
import type { Logger } from '@/types/logger';

/**
 * Marker comment that bookends the smart 404 snippet inside `delayed.js`.
 *
 * Used to detect "already installed" so re-running the installer doesn't
 * duplicate the snippet. Stable string — do not edit without bumping
 * every storefront's `delayed.js`.
 */
const SMART_404_MARKER_START = '// === Smart 404 PDP rebuild (Demo Builder) ===';
const SMART_404_MARKER_END = '// === end Smart 404 PDP rebuild ===';

/**
 * Marker comment that bookends the eager mixed-case redirect snippet
 * inside `head.html`. Same role as `SMART_404_MARKER_START` for the
 * delayed.js snippet — used to detect "already installed" so re-runs
 * are no-ops. Two distinct markers because the two snippets live in
 * different files and the idempotency check has to be per-file.
 */
const SMART_404_HEAD_MARKER_START = '<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->';
const SMART_404_HEAD_MARKER_END = '<!-- === end Smart 404 PDP eager redirect === -->';

/**
 * Eager mixed-case → lowercase redirect, vendored into `head.html` so
 * it fires synchronously before any body paint. Eliminates the visible
 * "Page Not Found" flash on the common PDP path — a PLP click against
 * a mixed-case product URL — which would otherwise wait for `delayed.js`
 * to load (1-2 seconds) before the snippet there could trigger a
 * redirect.
 *
 * Pure URL manipulation: no org/site/triggerUrl templating needed. The
 * `__NONCE__` placeholder gets substituted with the storefront's actual
 * CSP nonce at vendor time — we read it from an existing nonced script
 * in head.html rather than hardcoding it, so future nonce rotations or
 * template changes don't silently block the snippet.
 *
 * `document.prerendering` guard: head.html declares speculation rules
 * that pre-render PDP URLs on hover. Running `location.replace()` inside
 * a prerender context is unspecified browser behavior — at best it
 * wastes the prerender, at worst the real click still goes through the
 * cold flash. Bail out of prerender; the real navigation re-fires the
 * snippet.
 *
 * No-ops on every non-PDP path. Doesn't compete with the delayed.js
 * snippet — covers the mixed-case case; the delayed.js snippet handles
 * the lowercase-cold case (URL is already lowercase but not yet
 * published).
 */
const SMART_404_HEAD_SNIPPET_TEMPLATE = `

${SMART_404_HEAD_MARKER_START}
<script nonce="__NONCE__">
  (function () {
    if (document.prerendering) return;
    var m = location.pathname.match(/^\\/products\\/([^/]+)\\/([^/]+)$/);
    if (!m) return;
    var lc = '/products/' + m[1].toLowerCase() + '/' + m[2].toLowerCase();
    if (lc !== location.pathname) location.replace(lc);
  })();
</script>
${SMART_404_HEAD_MARKER_END}
`;

/**
 * Extract the CSP nonce from an existing `<script nonce="...">` tag in
 * head.html. Returns `undefined` when no nonced script is found — in
 * which case the eager redirect install is skipped (we can't be sure an
 * inline script without the right nonce will execute).
 *
 * Matches both single and double quotes; first match wins. Storefront
 * head.html files conventionally use one nonce string for all inline
 * scripts (aem-boilerplate-commerce uses "aem"), so first-match is
 * stable.
 */
export function extractCspNonce(headHtmlContent: string): string | undefined {
    const match = headHtmlContent.match(/<script[^>]*\snonce=["']([^"']+)["']/i);
    return match?.[1] || undefined;
}

/**
 * Smart 404 JS template. Three substitutions handled by
 * `buildSmart404Snippet`:
 *   __TRIGGER_URL__ — sibling `prepublish-pdp` endpoint URL
 *   __ORG__         — storefront's DA.live org (also the action's `org` param)
 *   __SITE__        — storefront's DA.live site (also the action's `site` param)
 *
 * Wrapped in an IIFE and gated on `window.isErrorPage` so it's inert on
 * every other page. Sits inside `delayed.js`, so it runs after the EDS
 * critical-path scripts complete — a brief flash of the default "Page
 * Not Found" content is visible before the redirect fires.
 */
const SMART_404_SNIPPET_TEMPLATE = `

${SMART_404_MARKER_START}
// Auto-publishes the per-product page when a visitor hits a cold PDP
// URL. Matches /products/{urlKey}/{sku}; otherwise no-op. Replaces the
// storefront's default "Page Not Found" body with a "Loading product…"
// state the moment the gate passes so the user gets immediate feedback
// during the ~1-2 second cold-publish window.
(function smart404PdpRebuild() {
  if (!window.isErrorPage) return;
  const RETRY_FLAG = 'pdpRetry';
  const m = location.pathname.match(/^\\/products\\/([^/]+)\\/([^/]+)$/);
  if (!m) return;
  if (new URLSearchParams(location.search).has(RETRY_FLAG)) return;
  const [, urlKey, sku] = m;
  const lc = '/products/' + urlKey.toLowerCase() + '/' + sku.toLowerCase();
  // Replace the 404 body with a loading state. Element-level inline
  // style attributes are allowed by storefront CSPs by default
  // (they govern style tags, not the style attribute). Reusing
  // the storefront's <main> keeps header/footer chrome intact.
  const mainEl = document.querySelector('main');
  const LOADING_HTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh;padding:40px 20px;font-size:1.25rem;color:#666;">Loading product…</div>';
  const ERROR_HTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh;padding:40px 20px;font-size:1.25rem;color:#666;">Product not available.</div>';
  if (mainEl) mainEl.innerHTML = LOADING_HTML;
  (async () => {
    if (lc !== location.pathname) {
      try {
        const head = await fetch(lc, { method: 'HEAD' });
        if (head.ok) { location.replace(lc); return; }
      } catch (_) { /* fall through to trigger */ }
    }
    const triggerUrl = '__TRIGGER_URL__?org=__ORG__&site=__SITE__&path=' + encodeURIComponent(lc);
    // One retry on 5xx with 1s backoff. Covers I/O Runtime cold start +
    // transient runtime failures without piling up retries that would
    // make a real outage take twice as long to surface.
    async function tryTrigger() {
      try { return await fetch(triggerUrl, { method: 'POST' }); }
      catch (_) { return null; }
    }
    let r = await tryTrigger();
    if (!r || (r.status >= 500 && r.status < 600)) {
      await new Promise((res) => setTimeout(res, 1000));
      r = await tryTrigger();
    }
    if (r && r.ok) {
      const sep = lc.includes('?') ? '&' : '?';
      location.replace(lc + sep + RETRY_FLAG + '=1');
      return;
    }
    // Action failed after retry. Surface the failure to the user
    // instead of leaving "Loading product…" hanging forever.
    if (mainEl) mainEl.innerHTML = ERROR_HTML;
  })();
})();
${SMART_404_MARKER_END}
`;

/**
 * Maximum overlay URL length we'll accept when deriving the trigger URL.
 * Same cap the BYOM overlay setting uses; defends against pathological
 * pasted values.
 */
const TRIGGER_URL_MAX_LENGTH = 2048;

/**
 * Generate the smart 404 JS snippet for a specific storefront.
 *
 * Substitutes the three runtime values into the static template and
 * returns the snippet ready to be appended to `delayed.js`.
 */
export function buildSmart404Snippet(triggerUrl: string, org: string, site: string): string {
    return SMART_404_SNIPPET_TEMPLATE
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
 * overlay URL — callers skip installing the smart 404 in that case
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
 * Outcome of a single install attempt. Surfaces in the pipeline log
 * and is asserted by the tests.
 */
export interface Pdp404InstallResult {
    installed: boolean;
    /** Set when installed=false to explain why the step was skipped. */
    reason?: string;
}

/**
 * Install the smart 404 handler for one storefront.
 *
 * Called from the two places that modify the storefront's GitHub repo
 * — `storefrontSetupPhase2.ts` (create/edit) and `edsResetRepoHelper.ts`
 * (reset) — alongside `installInspectorTagging`. Both operations share
 * the same shape: vendor a small JS file into the storefront's code.
 * Both run before the surrounding pipeline's bulk Helix code preview,
 * which picks up the committed change and makes it live.
 *
 * Non-fatal at every step: any failure is logged and the function
 * returns `{ installed: false, reason }`. The storefront still works
 * without the smart 404 — visitors hitting cold PDPs just get the
 * default Helix 404 page. We never want this step to break a create,
 * edit, or reset.
 *
 * Skip cases:
 *   - BYOM disabled (`overlayUrl` is `undefined`): nothing to install.
 *   - Overlay URL doesn't parse or doesn't have the expected shape:
 *     can't derive the trigger URL.
 *   - `scripts/delayed.js` doesn't exist in the storefront: log warning,
 *     skip (the storefront isn't an EDS storefront we recognize).
 *   - Snippet marker already present: idempotent skip (already installed).
 *   - GitHub commit fails (network, auth): log and skip.
 */
export async function installSmart404Handler(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    overlayUrl: string | undefined,
    logger: Logger,
    daLiveOrg: string,
    daLiveSite: string,
): Promise<Pdp404InstallResult> {
    if (!overlayUrl) {
        logger.info('[PDP404] BYOM disabled (no overlayUrl) — skipping smart 404 install');
        return { installed: false, reason: 'BYOM disabled' };
    }

    const triggerUrl = derivePrepublishUrl(overlayUrl);
    if (!triggerUrl) {
        logger.warn('[PDP404] Could not derive prepublish-pdp URL from overlay URL — skipping smart 404 install');
        return { installed: false, reason: 'invalid overlay URL' };
    }

    // Read the storefront's existing `scripts/delayed.js`. If absent, the
    // storefront doesn't have the EDS delayed-load module and we have
    // nowhere to vendor into — skip with a warning rather than create the
    // file ourselves (we don't know the right surrounding boilerplate).
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, 'scripts/delayed.js');
    if (!existing?.content) {
        logger.warn('[PDP404] scripts/delayed.js not found — skipping smart 404 install');
        return { installed: false, reason: 'delayed.js missing' };
    }

    // Idempotent: if the marker is already present, do nothing. Lets the
    // step run on every create/edit/reset without piling up duplicate
    // snippets.
    if (existing.content.includes(SMART_404_MARKER_START)) {
        logger.info('[PDP404] Smart 404 snippet already present in delayed.js — skipping');
        return { installed: false, reason: 'already installed' };
    }

    const snippet = buildSmart404Snippet(triggerUrl, daLiveOrg, daLiveSite);
    const newContent = existing.content + snippet;

    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            'scripts/delayed.js',
            newContent,
            'chore(demo-builder): vendor smart 404 PDP handler into delayed.js',
            existing.sha,
        );
        logger.info(`[PDP404] Vendored smart 404 snippet into scripts/delayed.js (${repoOwner}/${repoName})`);
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(`[PDP404] GitHub commit failed: ${reason} — skipping smart 404 install`);
        return { installed: false, reason: `GitHub commit failed: ${reason}` };
    }

    // Vendor the eager mixed-case redirect into head.html. Non-fatal at
    // every step: a failure here means the user still gets the slower
    // path (delayed.js handles it after ~1-2s) but the storefront still
    // works. We log and continue rather than report install failure for
    // the whole handler.
    await installSmart404HeadRedirect(githubFileOps, repoOwner, repoName, logger);

    return { installed: true };
}

/**
 * Vendor the eager mixed-case redirect script into `head.html`. Same
 * shape as the delayed.js install: read, idempotent-check, commit.
 *
 * Non-fatal at every step. Failures degrade the UX (visible 404 flash
 * persists until `delayed.js` fires) but never break the storefront.
 */
async function installSmart404HeadRedirect(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<void> {
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, 'head.html');
    if (!existing?.content) {
        logger.warn('[PDP404] head.html not found — skipping eager redirect install');
        return;
    }
    if (existing.content.includes(SMART_404_HEAD_MARKER_START)) {
        logger.info('[PDP404] Eager redirect already present in head.html — skipping');
        return;
    }
    // Detect the CSP nonce from an existing nonced script. If none is
    // found, the storefront either doesn't use CSP nonces or our
    // detector can't recognize the convention — either way, we can't
    // be sure our inline script will execute, so skip rather than
    // ship a snippet that will be silently blocked.
    const nonce = extractCspNonce(existing.content);
    if (!nonce) {
        logger.warn('[PDP404] head.html has no nonced script tag — skipping eager redirect (delayed.js fallback still active)');
        return;
    }
    const snippet = SMART_404_HEAD_SNIPPET_TEMPLATE.replace(/__NONCE__/g, nonce);
    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            'head.html',
            existing.content + snippet,
            'chore(demo-builder): vendor smart 404 eager redirect into head.html',
            existing.sha,
        );
        logger.info(`[PDP404] Vendored eager redirect into head.html (${repoOwner}/${repoName}, nonce="${nonce}")`);
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(`[PDP404] head.html commit failed: ${reason} — eager redirect not installed (delayed.js fallback still active)`);
    }
}
