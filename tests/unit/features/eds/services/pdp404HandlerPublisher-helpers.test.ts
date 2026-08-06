/**
 * pdp404HandlerPublisher — the pure helpers.
 *
 * Split from pdp404HandlerPublisher.test.ts on 2026-08-06: the combined file counted
 * 577 lines against the 500 limit. The seam is side effects — derivePrepublishUrl,
 * buildSmart404Snippet and extractCspNonce are pure string functions, while
 * installSmart404Handler writes to GitHub. The parent keeps the installer.
 */
/**
 * Smart 404 handler installer tests — Phase 1 of BYOM PDP routing.
 *
 * Covers the two pure helpers (buildSmart404Snippet, derivePrepublishUrl)
 * and the orchestrator (installSmart404Handler) end-to-end.
 *
 * Phase 1 v2 contract (post-2026-06-09): the smart 404 handler is
 * vendored into `scripts/delayed.js` rather than published as a DA.live
 * `/404.html` page. EDS strips `<script>` tags from authored content,
 * which silently broke the v1 page-publish approach. Tests pin the new
 * delayed-vendor contract.
 *
 * The installer MUST be non-fatal at every step: any failure logs and
 * returns `{ installed: false, reason }`. These tests enforce that.
 */

import {
    buildSmart404Snippet,
    derivePrepublishUrl,
    extractCspNonce,
} from '@/features/eds/services/pdp404HandlerPublisher';

describe('derivePrepublishUrl', () => {
    it('rewrites /render-pdp to /prepublish-pdp at the end of the path', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('strips the ?org=&site= query the overlay URL carries', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('handles a trailing slash on /render-pdp/', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp/';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('returns undefined for an unparseable URL', () => {
        expect(derivePrepublishUrl('not-a-url')).toBeUndefined();
        expect(derivePrepublishUrl('')).toBeUndefined();
    });

    it('returns undefined when the path does not end with /render-pdp', () => {
        expect(derivePrepublishUrl('https://example.com/api/v1/web/accs-discovery/discover-stores')).toBeUndefined();
        expect(derivePrepublishUrl('https://example.com/render-pdp/extra-segment')).toBeUndefined();
    });

    it('rejects pathologically long URLs', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2500) + '/render-pdp';
        expect(derivePrepublishUrl(longUrl)).toBeUndefined();
    });
});

describe('buildSmart404Snippet', () => {
    const triggerUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

    it('substitutes the trigger URL, org, and site into the template', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain(triggerUrl);
        expect(snippet).toContain('org=skukla');
        expect(snippet).toContain('site=citisignal-b2b');
    });

    it('URL-encodes org and site values that contain special characters', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'my org', 'site-with/slash');
        expect(snippet).toContain('org=my%20org');
        expect(snippet).toContain('site=site-with%2Fslash');
    });

    it('gates on window.isErrorPage so the snippet is inert on non-404 pages', () => {
        // Critical: the snippet rides delayed.js, which runs on every page.
        // Without this gate it would try to redirect on the home page.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('window.isErrorPage');
    });

    it('matches the PDP-shape pattern /products/{urlKey}/{sku}', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('/products/');
    });

    it('keeps a permissive SKU matcher so _HH-encoded paths still match (ADR-007)', () => {
        // The SKU segment is reversibly encoded into [a-z0-9_-] (encodeSkuForUrl);
        // an underscore-encoded SKU like yale_20unoplus must match. The matcher
        // must stay `([^/]+)` — narrowing it (e.g. to [a-z0-9-]+) would drop the
        // `_` and silently break the cold-path redirect for prose SKUs.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('([^/]+)');
        const m = '/products/cmlodestar/yale_20unoplus-series_20a'.match(
            /^\/products\/([^/]+)\/([^/]+)$/,
        );
        expect(m?.[2]).toBe('yale_20unoplus-series_20a');
    });

    it('embeds the infinite-loop guard using the pdpRetry sentinel', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('pdpRetry');
    });

    it('produces a delayed.js snippet (NOT an HTML document)', () => {
        // Regression guard: the v1 implementation built a full <!DOCTYPE
        // html> page for DA.live publication. EDS stripped the <script>
        // tag inside it. We must never go back to that shape.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).not.toContain('<!DOCTYPE');
        expect(snippet).not.toContain('<html');
        expect(snippet).toContain('Smart 404 PDP rebuild');
    });

    it('snippet is lint-clean (no eslint-disable directives, follows aem-boilerplate-commerce rules)', () => {
        // The snippet has to pass `npm run lint` on the storefront repo
        // after Demo Builder commits it to scripts/delayed.js. We
        // explicitly rewrote it to follow the boilerplate's ESLint
        // rules (window.location not bare location, template literals
        // not string concat, wrap-iife "inside" style, braced promise
        // executor, brace-style for try/catch). Pinning the absence of
        // eslint-disable here so a future contributor doesn't reach for
        // the easy fix when adding new code; rewrite the new code to be
        // lint-clean instead.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).not.toContain('eslint-disable');
        expect(snippet).not.toContain('eslint-enable');
    });

    it('uses window.location everywhere (no bare location — no-restricted-globals)', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        // Every `location` reference must be `window.location`. Catches
        // regressions where a contributor copies in code using bare
        // `location` without thinking about the storefront lint config.
        const bareLocationMatches = snippet.match(/\b(?<!window\.)location\b/g) || [];
        expect(bareLocationMatches).toHaveLength(0);
    });

    it('uses template literals (no string concatenation — prefer-template)', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        // Spot-check the obvious construction points. A future
        // contributor reaching for `'a' + b + 'c'` will trip this and
        // get redirected to template literals.
        expect(snippet).toContain('`/products/${urlKey.toLowerCase()}/${sku.toLowerCase()}`');
        expect(snippet).toContain('encodeURIComponent(lc)');
        expect(snippet).toContain('${lc}${sep}${RETRY_FLAG}=1');
    });

    it('outer function IIFE uses inside-parens style (wrap-iife)', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        // The outer `(function smart404PdpRebuild() {...})` IIFE must
        // close as `}());`, NOT `})();`. The inner `(async () => {})()`
        // arrow IIFE is exempt — wrap-iife only governs function
        // expressions, not arrow functions.
        expect(snippet).toContain('}());');
        // Spot-check: the outer IIFE's close, right before the marker
        // end, must be `}());` (the inside-parens variant).
        const beforeMarkerEnd = snippet.split('// === end Smart 404 PDP rebuild ===')[0];
        expect(beforeMarkerEnd).toMatch(/\}\(\)\);\s*$/);
    });

    it('promise executor wraps setTimeout in a block (no-promise-executor-return)', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        // `(res) => setTimeout(res, 1000)` would return setTimeout's
        // value from the executor — trips no-promise-executor-return.
        // Wrap in a block to discard the return.
        expect(snippet).toContain('(res) => { setTimeout(res, 1000); }');
    });

    it('bookends the snippet with stable start and end markers for idempotency', () => {
        // The installer uses these markers to detect "already installed"
        // and skip re-vendoring on every reset.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('=== Smart 404 PDP rebuild (Demo Builder) ===');
        expect(snippet).toContain('=== end Smart 404 PDP rebuild ===');
    });

    it('removes the eager-script hide style and clears main.className before showing loading state', () => {
        // Two regressions this test pins:
        // 1. The eager script in 404.html injects #smart-404-cold-hide
        //    to suppress the visible 404 chrome during the cold-path
        //    window. delayed.js must remove it before painting the
        //    loading state, otherwise the user sees nothing.
        // 2. The boilerplate's 404.html ships <main class="error"> with
        //    its own flex layout (align-items:center, max-width, etc.)
        //    that fought our flex-centered loading div and pushed it
        //    off-center. Clearing className strips .error so our
        //    centering wins.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain("getElementById('smart-404-cold-hide')");
        expect(snippet).toContain('hideStyle.remove()');
        expect(snippet).toContain("mainEl.className = ''");
    });

    it('shows a spinner + "Loading product…" caption during the cold-publish window', () => {
        // Without this, the cold path leaves "Page Not Found" visible
        // for the ~1-2 second action call. Spinner + caption is more
        // intentional than text-only — clearly communicates "something
        // is loading" rather than a static error message.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('Loading product');
        // CSS-only rotating ring (border-top-color + animation keyframe)
        // — no image asset, renders instantly when the loading state
        // paints.
        expect(snippet).toContain('@keyframes smart404Spin');
        expect(snippet).toContain('border-top-color');
        expect(snippet).toContain('border-radius:50%');
        // Replacement targets <main> to preserve storefront chrome
        // (header, footer) — body is too aggressive, would wipe the nav.
        expect(snippet).toContain("querySelector('main')");
    });

    it('uses storefront design tokens with hardcoded fallbacks for the loading state styling', () => {
        // Aligns the loading state visually with each storefront's
        // brand/spacing/typography when those tokens are defined
        // (aem-boilerplate-commerce ships --color-brand-500,
        // --spacing-large, --type-body-1-default-font). Fallbacks
        // preserve a clean default if a storefront doesn't.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('var(--color-brand-500,#454545)');
        expect(snippet).toContain('var(--color-neutral-200,#f0f0f0)');
        expect(snippet).toContain('var(--spacing-large,40px)');
        expect(snippet).toContain('var(--type-body-1-default-font,1.25rem/1.5 sans-serif)');
    });

    it('surfaces a fallback message when the action fails after retry', () => {
        // If the user is left staring at "Loading product…" forever,
        // that's worse than the original 404. After the retry path
        // exhausts, swap to an explicit failure message.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('Product not available');
    });

    it('retries the action call once with backoff on 5xx (covers I/O Runtime cold start)', () => {
        // Cold-path action calls can land on a freshly-warmed I/O
        // Runtime container that 503s once before responding normally.
        // Without retry, the very first visitor to a SKU after action
        // idle eats the 503 and sees "Page Not Found". With retry, the
        // user sees one extra second and the page renders.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        // 5xx detection
        expect(snippet).toContain('r.status >= 500');
        expect(snippet).toContain('r.status < 600');
        // 1-second backoff
        expect(snippet).toContain('setTimeout(res, 1000)');
    });
});

describe('extractCspNonce', () => {
    it('returns the nonce from a standard nonced script tag (double quotes)', () => {
        expect(extractCspNonce('<script nonce="aem" type="importmap">{}</script>')).toBe('aem');
    });

    it('handles single-quoted nonce attributes', () => {
        expect(extractCspNonce("<script nonce='aem' type='module'></script>")).toBe('aem');
    });

    it('returns first match when multiple nonced scripts are present', () => {
        // Storefront convention is one nonce per page; first-match is stable.
        const head = '<script nonce="first">a</script>\n<script nonce="second">b</script>';
        expect(extractCspNonce(head)).toBe('first');
    });

    it('returns undefined when head.html has no nonced scripts', () => {
        expect(extractCspNonce('<meta charset="UTF-8">\n<title>plain</title>')).toBeUndefined();
    });

    it('returns undefined when nonce attribute is empty', () => {
        expect(extractCspNonce('<script nonce="">x</script>')).toBeUndefined();
    });

    it('case-insensitive for the script tag name', () => {
        expect(extractCspNonce('<SCRIPT NONCE="aem">x</SCRIPT>')).toBe('aem');
    });

    it('matches nonce on any nonced script regardless of other attributes', () => {
        expect(extractCspNonce('<script type="importmap" nonce="aem" id="x">{}</script>')).toBe('aem');
    });
});
