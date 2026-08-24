/**
 * Smart 404 PDP snippet authoring — pure string and URL work, no I/O.
 *
 * Builds the client-side snippet that rebuilds a cold product detail page, the
 * eager redirect vendored into `head.html` / `404.html`, and the marker-block
 * replacement both rely on. Extracted from `pdp404HandlerPublisher` so that
 * authoring the snippet and installing it into a GitHub repo change for
 * different reasons: the snippet's contract is with the browser, the
 * installer's is with the GitHub Contents API.
 *
 * Everything here is deterministic and dependency-free — which is why its tests
 * need no mocks at all (`pdp404HandlerPublisher.test.ts`).
 */

export const SMART_404_MARKER_START = '// === Smart 404 PDP rebuild (Demo Builder) ===';
export const SMART_404_MARKER_END = '// === end Smart 404 PDP rebuild ===';

/**
 * Marker comment that bookends the eager mixed-case redirect snippet
 * inside `head.html`. Same role as `SMART_404_MARKER_START` for the
 * delayed.js snippet — used to detect "already installed" so re-runs
 * are no-ops. Two distinct markers because the two snippets live in
 * different files and the idempotency check has to be per-file.
 */
export const SMART_404_HEAD_MARKER_START =
    '<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->';
export const SMART_404_HEAD_MARKER_END = '<!-- === end Smart 404 PDP eager redirect === -->';

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
export const SMART_404_HEAD_SNIPPET_TEMPLATE = `

${SMART_404_HEAD_MARKER_START}
<script nonce="__NONCE__">
  (function () {
    if (document.prerendering) return;
    var m = location.pathname.match(/^\\/products\\/([^/]+)\\/([^/]+)$/);
    if (!m) return;
    var lc = '/products/' + m[1].toLowerCase() + '/' + m[2].toLowerCase();
    // Mixed case: redirect to lowercase before any paint
    if (lc !== location.pathname) {
      location.replace(lc);
      return;
    }
    // Already lowercase. If this is a 404 page (cold path: SKU never
    // published), the storefront's default 404 chrome will paint before
    // delayed.js loads and runs our cold-path snippet. Hide just the
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
  const m = window.location.pathname.match(/^\\/products\\/([^/]+)\\/([^/]+)$/);
  if (!m) return;
  if (new URLSearchParams(window.location.search).has(RETRY_FLAG)) return;
  const [, urlKey, sku] = m;
  const lc = \`/products/\${urlKey.toLowerCase()}/\${sku.toLowerCase()}\`;
  // Reveal the body now that we're ready to show our own loading state.
  // The eager script in 404.html injected a "visibility: hidden" style
  // to suppress the default 404 chrome during the cold-path window;
  // removing it now lets our loading state render.
  const hideStyle = document.getElementById('smart-404-cold-hide');
  if (hideStyle) hideStyle.remove();
  // Replace the 404 body with a loading state. Element-level inline
  // style attributes are governed by style-src 'unsafe-inline' (not
  // the nonce or strict-dynamic), and storefront CSPs we have
  // inspected allow this by default. Reusing the storefront <main>
  // keeps header and footer chrome intact. Uses the storefront design
  // tokens with hardcoded fallbacks so the loading state still
  // renders cleanly when a storefront does not define them. Clear
  // main's class so the default 404 chrome (e.g. main.error's own
  // flex layout) does not compete with our flex centering and push
  // the message off-center.
  const mainEl = document.querySelector('main');
  // Loading state: a centered spinner with "Loading product…" caption.
  // Uses storefront design tokens for color/typography with hardcoded
  // fallbacks. Spinner is a CSS-only rotating ring (no images, no
  // assets to load) so it renders instantly the moment we paint.
  const WRAP = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;padding:var(--spacing-large,40px) var(--spacing-medium,20px);gap:var(--spacing-medium,20px);';
  const SPIN = 'width:48px;height:48px;border:4px solid var(--color-neutral-200,#f0f0f0);border-top-color:var(--color-brand-500,#454545);border-radius:50%;animation:smart404Spin 0.8s linear infinite;';
  const TEXT = 'font:var(--type-body-1-default-font,1.25rem/1.5 sans-serif);color:var(--color-brand-500,#454545);';
  const ANIM = '<style>@keyframes smart404Spin{to{transform:rotate(360deg)}}</style>';
  const LOADING_HTML = \`<div style="\${WRAP}"><div style="\${SPIN}"></div><div style="\${TEXT}">Loading product…</div></div>\${ANIM}\`;
  if (mainEl) {
    mainEl.className = '';
    mainEl.innerHTML = LOADING_HTML;
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
      const sep = lc.includes('?') ? '&' : '?';
      window.location.replace(\`\${lc}\${sep}\${RETRY_FLAG}=1\`);
      return;
    }
    // Action failed after retry — the SKU has no publishable PDP
    // (deleted, renamed, or never existed in Commerce). The honest UX
    // is the storefront's native /404, not a custom in-place message
    // that implies the product page exists. A full redirect makes the
    // URL bar, history, and bookmarks all reflect reality. /404 does not
    // match the PDP pattern, so this never loops.
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
 * returns the snippet ready to be appended to `delayed.js`.
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
