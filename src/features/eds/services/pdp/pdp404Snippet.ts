/**
 * Smart 404 PDP snippet authoring — pure string and URL work, no I/O.
 *
 * Builds the client-side script that publishes a cold product or category page,
 * the eager redirect vendored into `head.html` / `404.html`, and the marker-block
 * replacement both rely on. Where the two sit in `404.html` is `pdp404Page.ts`. Extracted from `pdp404HandlerPublisher` so that
 * authoring the snippet and installing it into a GitHub repo change for
 * different reasons: the snippet's contract is with the browser, the
 * installer's is with the GitHub Contents API.
 *
 * Everything here is deterministic and dependency-free — which is why its tests
 * need no mocks at all (`pdp404Snippet.test.ts`).
 */

export const SMART_404_MARKER_START = '// === Smart 404 PDP rebuild (Demo Builder) ===';
export const SMART_404_MARKER_END = '// === end Smart 404 PDP rebuild ===';

/**
 * Marker comment that bookends the eager mixed-case redirect snippet
 * inside `head.html` and `404.html`, used to find the block so a re-run swaps it
 * in place. `SMART_404_MARKER_START` bookends the recovery script itself (and
 * finds the copy a storefront still carries in `scripts/delayed.js`).
 */
export const SMART_404_HEAD_MARKER_START =
    '<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->';
export const SMART_404_HEAD_MARKER_END = '<!-- === end Smart 404 PDP eager redirect === -->';

/**
 * Eager mixed-case → lowercase redirect, vendored into `head.html` so
 * it fires synchronously before any body paint. Eliminates the visible
 * "Page Not Found" flash on the common PDP path — a PLP click against
 * a mixed-case product URL — which would otherwise wait for the recovery
 * script at the end of the page's body before anything could redirect.
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
 * No-ops on every path the recovery script ignores. Doesn't compete with
 * it — covers the mixed-case product case and the cold-path hide; the
 * recovery script handles the lowercase-cold case (URL is already
 * lowercase but not yet published). The mixed-case redirect
 * is product-only: a category address is lowercase by definition.
 *
 * The category shape here and in `SMART_404_SNIPPET_TEMPLATE` is the same
 * rule, written twice because the two scripts ship in different files.
 */
export const SMART_404_HEAD_SNIPPET_TEMPLATE = `

${SMART_404_HEAD_MARKER_START}
<script nonce="__NONCE__">
  (function () {
    if (document.prerendering) return;
    var p = location.pathname;
    var m = p.match(/^\\/products\\/([^/]+)\\/([^/]+)$/);
    if (m) {
      var lc = '/products/' + m[1].toLowerCase() + '/' + m[2].toLowerCase();
      // Mixed case: redirect to lowercase before any paint
      if (lc !== p) {
        location.replace(lc);
        return;
      }
    } else if (!/^(?:\\/[a-z0-9-]+)+$/.test(p) || p === '/404'
      || p === '/categories/default' || p === '/products/default') {
      // Neither a product nor a category address: not ours.
      return;
    }
    // Already lowercase. If this is a 404 page (cold path: page never
    // published), the storefront's default 404 chrome could paint before
    // the recovery script at the end of the body runs. Hide just the
    // <main> (not the whole body) so the storefront's header and footer
    // — populated by scripts.js as usual — stay visible while we wait.
    // User sees real storefront chrome around a loading area, not a
    // blank page. On non-404 pages window.isErrorPage is undefined so
    // we skip the hide.
    if (window.isErrorPage && !new URLSearchParams(location.search).has('pdpRetry')) {
      var s = document.createElement('style');
      s.id = 'smart-404-cold-hide';
      s.textContent = 'main { visibility: hidden; }';
      document.head.appendChild(s);
    }
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
 * Smart 404 JS template — product pages, and category pages (EDS-61), which
 * the overlay serves at each category's own address (`/signs/fire`) and the
 * same `prepublish-pdp` action publishes on a shopper's first visit.
 *
 * The action's contract (EDS-61 step 2, 2026-10-29): a category address is any
 * path whose segments are all `[a-z0-9-]`, except `/categories/default` and
 * `/products/default`; a product-shaped address is tried as a product first,
 * then as a category. It answers 200 (published, with the path), 404 (neither,
 * nothing published), 503 (the store could not be asked, nothing published) or
 * 400 (bad input). The snippet asks only for an address of one of those two
 * shapes, so an ordinary 404 (a file, an uppercase or underscored path) costs
 * no request and shows nothing of ours.
 *
 * On a refusal: a product-shaped address goes to the native `/404`, whatever
 * the status (owner, 2026-10-29: a product link must never land on a search);
 * any other category address on a 503 goes to a search filtered to the
 * category (the menu block's own fallback, `searchFallbackHref` in
 * `blocks/catalog-menu/catalog-menu-core.js`);
 * any other category refusal puts the storefront's own 404 back at the
 * address the shopper opened, as it was before the snippet ran.
 *
 * Three substitutions handled by `buildSmart404Snippet`:
 *   __TRIGGER_URL__ — sibling `prepublish-pdp` endpoint URL
 *   __ORG__         — storefront's DA.live org (also the action's `org` param)
 *   __SITE__        — storefront's DA.live site (also the action's `site` param)
 *
 * Wrapped in an IIFE and gated on `window.isErrorPage`. It runs inline at the
 * end of the code's `404.html` body (`pdp404Page.ts` wraps it with the page's
 * CSP nonce): no helper script of Adobe's, no wait for cookie consent. That is
 * BEFORE the storefront's own scripts decorate `<main>`, so the script never
 * writes into `<main>`: its loading state is its own element beside it, and
 * `<main>` stays hidden until the script is done with the page.
 */
const SMART_404_SNIPPET_TEMPLATE = `
${SMART_404_MARKER_START}
// Auto-publishes the page when a visitor hits a cold product address
// (/products/{urlKey}/{sku}) or a cold category address (every segment
// [a-z0-9-]; never /404 or the /categories/default and /products/default
// templates). It shows a loading state in place of the storefront's
// "Page Not Found" during the ~1-2 second cold-publish window, then
// reloads into the published page. Any other path is left alone.
(function smart404PdpRebuild() {
  if (!window.isErrorPage) return;
  const RETRY_FLAG = 'pdpRetry';
  const { pathname } = window.location;
  const PRODUCT = /^\\/products\\/([^/]+)\\/([^/]+)$/;
  const CATEGORY = /^(?:\\/[a-z0-9-]+)+$/;
  const TEMPLATES = ['/404', '/categories/default', '/products/default'];
  const isProduct = PRODUCT.test(pathname);
  const lc = pathname.toLowerCase();
  // A product address is asked for lowercased; a category one must already be.
  const isCategory = CATEGORY.test(isProduct ? lc : pathname) && !TEMPLATES.includes(lc);
  if (!isProduct && !isCategory) return;
  if (new URLSearchParams(window.location.search).has(RETRY_FLAG)) return;
  // Where the action may send us: a page of the same kind.
  const PAGE_PATH = isProduct ? /^\\/products\\/[^/?#]+\\/[^/?#]+$/ : CATEGORY;
  // This runs at the end of the 404 page's body, before the storefront's own
  // scripts decorate <main>. So nothing is written into <main>: it stays
  // hidden, and the loading state is an element of its own beside it, which
  // nothing of the storefront's touches. The eager script in the page's
  // <head> already hid <main> (#smart-404-cold-hide) before it painted.
  const mainEl = document.querySelector('main');
  const hide = document.createElement('style');
  hide.textContent = 'main { display: none; }';
  document.head.appendChild(hide);
  // Loading state: a centered spinner with a caption ("Loading product…" on
  // a product address, "Loading…" on a category one). Element-level inline
  // style attributes are governed by style-src 'unsafe-inline' (not the
  // nonce or strict-dynamic), which storefront CSPs we have inspected allow.
  // Uses the storefront design tokens with hardcoded fallbacks so it renders
  // cleanly when a storefront does not define them. The spinner is a
  // CSS-only rotating ring (no images, no assets to load), so it renders the
  // moment it is painted.
  const caption = isProduct ? 'Loading product…' : 'Loading…';
  const WRAP = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;padding:var(--spacing-large,40px) var(--spacing-medium,20px);gap:var(--spacing-medium,20px);';
  const SPIN = 'width:48px;height:48px;border:4px solid var(--color-neutral-200,#f0f0f0);border-top-color:var(--color-brand-500,#454545);border-radius:50%;animation:smart404Spin 0.8s linear infinite;';
  const TEXT = 'font:var(--type-body-1-default-font,1.25rem/1.5 sans-serif);color:var(--color-brand-500,#454545);';
  const ANIM = '<style>@keyframes smart404Spin{to{transform:rotate(360deg)}}</style>';
  const loading = document.createElement('div');
  loading.id = 'smart-404-loading';
  loading.innerHTML = \`<div style="\${WRAP}"><div style="\${SPIN}"></div><div style="\${TEXT}">\${caption}</div></div>\${ANIM}\`;
  if (mainEl) mainEl.before(loading);
  else document.body.append(loading);
  // No such category: the storefront's own 404, where the shopper is. Taking
  // our elements away is all it needs; <main> was never touched.
  function showOwn404() {
    loading.remove();
    hide.remove();
    const eagerHide = document.getElementById('smart-404-cold-hide');
    if (eagerHide) eagerHide.remove();
  }
  // The search the menu block links a category with no page to
  // (searchFallbackHref in blocks/catalog-menu/catalog-menu-core.js), or
  // null where it links none: the search block would read "10-20" as a range.
  function categorySearch() {
    const urlPath = lc.slice(1);
    const [from, to] = urlPath.split('-');
    const isNumber = (value) => Number.isFinite(Number(value));
    if (to !== undefined && isNumber(from) && isNumber(to)) return null;
    const filter = encodeURIComponent(\`categoryPath:\${urlPath}\`);
    return \`/search?filter=\${filter}\`;
  }
  (async () => {
    if (lc !== window.location.pathname) {
      try {
        const head = await fetch(lc, { method: 'HEAD' });
        if (head.ok) {
          window.location.replace(lc);
          return;
        }
      } catch (_) { /* fall through to trigger */ }
    }
    const triggerUrl = \`__TRIGGER_URL__?org=__ORG__&site=__SITE__&path=\${encodeURIComponent(lc)}\`;
    // One retry on 5xx with 1s backoff. Covers I/O Runtime cold start
    // + transient runtime failures without piling up retries that
    // would make a real outage take twice as long to surface.
    async function tryTrigger() {
      try {
        return await fetch(triggerUrl, { method: 'POST' });
      } catch (_) {
        return null;
      }
    }
    let r = await tryTrigger();
    if (!r || (r.status >= 500 && r.status < 600)) {
      await new Promise((res) => { setTimeout(res, 1000); });
      r = await tryTrigger();
    }
    if (r && r.ok) {
      // The action publishes the page at its one canonical path and says
      // where; an older link form (or any path Helix would clean) lands there.
      let target = lc;
      try {
        const body = await r.json();
        if (body && typeof body.path === 'string' && PAGE_PATH.test(body.path)) {
          target = body.path;
        }
      } catch (_) { /* keep the requested path */ }
      window.location.replace(\`\${target}?\${RETRY_FLAG}=1\`);
      return;
    }
    // 503: the store could not be asked, so this may still be a category.
    // Its products are one search away, as the menu would link them. Never
    // for a product address: a product link must not land on a search.
    const search = !isProduct && r && r.status === 503 ? categorySearch() : null;
    if (search) {
      window.location.replace(search);
      return;
    }
    if (!isProduct) {
      // No such category: the storefront's own 404, where the shopper is.
      showOwn404();
      return;
    }
    // Action failed after retry — the SKU has no publishable PDP
    // (deleted, renamed, or never existed in Commerce). The honest UX is
    // the storefront's native /404, not a custom in-place message that
    // implies the product page exists. A full redirect makes the URL bar,
    // history, and bookmarks all reflect reality. /404 is excluded from
    // both patterns, so this never loops.
    window.location.replace('/404');
  })();
}());
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
 * returns the script, which `pdp404Page.ts` wraps for `404.html`.
 */
export function buildSmart404Snippet(triggerUrl: string, org: string, site: string): string {
    return SMART_404_SNIPPET_TEMPLATE.replace(/__TRIGGER_URL__/g, triggerUrl)
        .replace(/__ORG__/g, encodeURIComponent(org))
        .replace(/__SITE__/g, encodeURIComponent(site));
}

/**
 * Replace the marker-bounded block in `content` with the corresponding block
 * from `freshFull` (a freshly built snippet). Content outside the block —
 * including whitespace around it — is preserved. Returns `null` when both
 * markers aren't present in `content` in order (missing, half-marked, or
 * inverted), so the caller leaves the file untouched rather than risk
 * duplicating or corrupting a malformed block.
 */
export function replaceMarkedBlock(
    content: string,
    startMarker: string,
    endMarker: string,
    freshFull: string,
): string | null {
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return null;
    // Search only AFTER the start marker: an end marker that exists solely
    // before it (mangled block) must not pull the splice point backwards.
    const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) return null;
    const blockEnd = endIdx + endMarker.length;
    const freshStart = freshFull.indexOf(startMarker);
    const freshEnd = freshFull.indexOf(endMarker) + endMarker.length;
    const freshBlock = freshFull.slice(freshStart, freshEnd);
    return content.slice(0, startIdx) + freshBlock + content.slice(blockEnd);
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
    return deriveSiblingActionUrl(overlayUrl, 'prepublish-pdp');
}

/**
 * URL of the `register-publish-key` action, derived from the overlay URL the
 * same way `derivePrepublishUrl` derives its sibling.
 *
 * The extension POSTs a site-scoped publish key here so `prepublish-pdp` can
 * publish on a site whose admin API is locked — see
 * `.rptc/backlog/pdp-prewarm-401-after-admin-pinning.md`.
 */
export function deriveRegisterKeyUrl(overlayUrl: string): string | undefined {
    return deriveSiblingActionUrl(overlayUrl, 'register-publish-key');
}

/**
 * Swap the overlay URL's trailing `/render-pdp` for a sibling action in the
 * same package, dropping the query. Returns undefined for anything that is not
 * a plausible overlay URL, so a misconfigured setting cannot build a request to
 * an arbitrary host.
 */
function deriveSiblingActionUrl(overlayUrl: string, action: string): string | undefined {
    if (overlayUrl.length > TRIGGER_URL_MAX_LENGTH) return undefined;
    let parsed: URL;
    try {
        parsed = new URL(overlayUrl);
    } catch {
        return undefined;
    }
    if (!/\/render-pdp\/?$/.test(parsed.pathname)) return undefined;
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/render-pdp\/?$/, `/${action}`);
    return parsed.toString();
}
