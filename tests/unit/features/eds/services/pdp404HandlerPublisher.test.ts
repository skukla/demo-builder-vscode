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
    installSmart404Handler,
} from '@/features/eds/services/pdp404HandlerPublisher';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

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

describe('installSmart404Handler', () => {
    const repoOwner = 'skukla';
    const repoName = 'citisignal-b2b';
    const daLiveOrg = 'skukla';
    const daLiveSite = 'citisignal-b2b';
    const overlayUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';

    let mockGithub: {
        getFileContent: jest.Mock;
        createOrUpdateFile: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock: head.html and 404.html both include nonced
        // <script> tags matching the convention from
        // aem-boilerplate-commerce. Tests that need to exercise the
        // "no nonce" / "file missing" paths override per-test.
        mockGithub = {
            getFileContent: jest.fn().mockImplementation((_o, _r, path) => {
                if (path === 'head.html') {
                    return Promise.resolve({
                        content: '<meta charset="UTF-8">\n<script nonce="aem" type="importmap">{}</script>\n<title>placeholder</title>\n',
                        sha: 'head-sha',
                    });
                }
                if (path === '404.html') {
                    return Promise.resolve({
                        content: '<!DOCTYPE html><html><head><script nonce="aem">w.x=1;</script></head><body></body></html>',
                        sha: '404-sha',
                    });
                }
                return Promise.resolve({
                    content: '// Existing delayed.js contents\nexport default {};\n',
                    sha: 'existing-file-sha',
                });
            }),
            createOrUpdateFile: jest.fn().mockResolvedValue({
                sha: 'new-file-sha',
                commitSha: 'commit-sha',
            }),
        };
    });

    it('installs the snippet on the happy path', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
        expect(mockGithub.getFileContent).toHaveBeenCalledWith(repoOwner, repoName, 'scripts/delayed.js');
        expect(mockGithub.createOrUpdateFile).toHaveBeenCalledWith(
            repoOwner, repoName, 'scripts/delayed.js',
            expect.stringContaining('Smart 404 PDP rebuild'),
            expect.any(String),
            'existing-file-sha',
        );
    });

    it('also vendors the eager redirect into head.html (eliminates the visible 404 flash)', async () => {
        // The head.html vendor handles the most common case — a PLP
        // click against a mixed-case product URL. Without this, every
        // PDP visit waits ~2 seconds for delayed.js to fire the
        // redirect. With it, the redirect happens synchronously
        // before any 404 paint.
        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(mockGithub.getFileContent).toHaveBeenCalledWith(repoOwner, repoName, 'head.html');
        const headCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === 'head.html');
        expect(headCall).toBeDefined();
        const headContent = headCall![3] as string;
        // Snippet preserved through to the commit
        expect(headContent).toContain('<meta charset="UTF-8">');
        expect(headContent).toContain('Smart 404 PDP eager redirect');
        // Nonce extracted dynamically from the existing nonced script
        // in head.html (the importmap in the default mock uses "aem").
        expect(headContent).toContain('nonce="aem"');
        // Performs the actual mixed-case → lowercase rewrite
        expect(headContent).toContain('toLowerCase()');
        expect(headContent).toContain('location.replace');
        // Speculation Rules guard: head.html declares prerender hints,
        // so the snippet must bail out when running inside a prerender
        // context. Without this, location.replace() during prerender
        // either wastes the prerender or causes inconsistent behavior
        // across browsers.
        expect(headContent).toContain('document.prerendering');
        // Cold-path main hide: when isErrorPage is true and the URL is
        // already lowercase (cold case where delayed.js will fire), the
        // eager script injects #smart-404-cold-hide to suppress the
        // visible 404 chrome until delayed.js paints our loading state.
        // The selector is `main` (NOT `body`) so the storefront's
        // header and footer — populated by scripts.js — stay visible
        // while we wait. Body-level hide was too aggressive and made
        // the cold-path window look like a blank page.
        expect(headContent).toContain('window.isErrorPage');
        expect(headContent).toContain("'smart-404-cold-hide'");
        expect(headContent).toContain('main { visibility: hidden; }');
    });

    it('extracts the CSP nonce dynamically from head.html instead of hardcoding "aem"', async () => {
        // If the storefront's CSP nonce ever rotates or the template
        // changes the string (rebrand, security audit), a hardcoded
        // nonce silently breaks the eager redirect with no visible
        // error. Dynamic extraction means we follow the template.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.resolve({
                    content: '<script nonce="future-rotated-nonce" type="importmap">{}</script>',
                    sha: 'head-sha',
                });
            }
            return Promise.resolve({
                content: '// delayed.js\n',
                sha: 'delayed-sha',
            });
        });

        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        const headCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === 'head.html');
        const headContent = headCall![3] as string;
        expect(headContent).toContain('nonce="future-rotated-nonce"');
        expect(headContent).not.toContain('nonce="aem"');
    });

    it('also vendors the eager redirect into 404.html (Helix serves the static 404.html on unknown-path 404s, bypassing head.html)', async () => {
        // The boilerplate ships a static 404.html at the repo root.
        // Helix serves THAT on 404 responses for unknown paths — not
        // head.html, not authored DA.live content. So the same eager
        // redirect snippet has to be in 404.html too, otherwise the
        // mixed-case PDP flow keeps showing the visible 404 page until
        // delayed.js fires ~1-2s later.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.resolve({
                    content: '<script nonce="aem" type="importmap">{}</script>',
                    sha: 'head-sha',
                });
            }
            if (path === '404.html') {
                return Promise.resolve({
                    content: '<!DOCTYPE html><html><head><title>Page not found</title><script nonce="aem">window.isErrorPage = true;</script></head><body><h1>404</h1></body></html>',
                    sha: '404-sha',
                });
            }
            return Promise.resolve({
                content: '// delayed.js\n',
                sha: 'delayed-sha',
            });
        });

        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(mockGithub.getFileContent).toHaveBeenCalledWith(repoOwner, repoName, '404.html');
        const fourOhFourCall = mockGithub.createOrUpdateFile.mock.calls.find(c => c[2] === '404.html');
        expect(fourOhFourCall).toBeDefined();
        const fourOhFourContent = fourOhFourCall![3] as string;
        // Snippet present
        expect(fourOhFourContent).toContain('Smart 404 PDP eager redirect');
        // Inserted before </head>, not appended after the closing tags
        const snippetIdx = fourOhFourContent.indexOf('Smart 404 PDP eager redirect');
        const headCloseIdx = fourOhFourContent.indexOf('</head>');
        expect(snippetIdx).toBeLessThan(headCloseIdx);
        // Uses the dynamically extracted nonce
        expect(fourOhFourContent).toContain('nonce="aem"');
        // Original content preserved (title, body, etc.)
        expect(fourOhFourContent).toContain('Page not found');
        expect(fourOhFourContent).toContain('window.isErrorPage = true');
    });

    it('404.html vendor is idempotent: skips if marker already present', async () => {
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === '404.html') {
                return Promise.resolve({
                    content: '<!DOCTYPE html><html><head>\n<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->\n<script nonce="aem">existing</script>\n</head></html>',
                    sha: '404-sha',
                });
            }
            if (path === 'head.html') {
                return Promise.resolve({
                    content: '<script nonce="aem" type="importmap">{}</script>',
                    sha: 'head-sha',
                });
            }
            return Promise.resolve({
                content: '// delayed.js\n',
                sha: 'delayed-sha',
            });
        });

        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        const fourOhFourCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === '404.html');
        expect(fourOhFourCommits).toHaveLength(0);
    });

    it('404.html vendor failure is non-fatal: installed=true still, delayed.js fallback active', async () => {
        // Same contract as head.html: a failed 404.html commit degrades
        // UX (visible 404 page persists until delayed.js fires) but
        // never breaks the storefront. installed=true because delayed.js
        // is the load-bearing piece.
        mockGithub.createOrUpdateFile.mockImplementation((_o, _r, path) => {
            if (path === '404.html') return Promise.reject(new Error('404.html conflict'));
            return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
        });

        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
    });

    it('skips head.html vendor when no nonced script tag exists (eager redirect would be silently blocked)', async () => {
        // No nonce = our inline script would likely be blocked by CSP.
        // Better to skip the install cleanly than ship dead code.
        // delayed.js fallback still applies.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.resolve({
                    content: '<meta charset="UTF-8">\n<title>no nonced scripts here</title>',
                    sha: 'head-sha',
                });
            }
            return Promise.resolve({
                content: '// delayed.js\n',
                sha: 'delayed-sha',
            });
        });

        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
        const headCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === 'head.html');
        expect(headCommits).toHaveLength(0);
    });

    it('head.html vendor is idempotent: skips if marker already present', async () => {
        // Lets the install step run on every create/edit/reset without
        // piling up duplicate head.html snippets.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.resolve({
                    content: '<meta charset="UTF-8">\n<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->\n<script>existing</script>\n',
                    sha: 'head-sha',
                });
            }
            return Promise.resolve({
                content: '// Existing delayed.js contents\n',
                sha: 'delayed-sha',
            });
        });

        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        const headCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === 'head.html');
        expect(headCommits).toHaveLength(0);
    });

    it('head.html vendor failure is non-fatal: installed=true still, delayed.js fallback active', async () => {
        // If head.html commit fails (network, conflict), the user gets
        // the slower delayed.js path. We never want to report install
        // failure for the whole handler just because the UX polish step
        // failed.
        mockGithub.createOrUpdateFile.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.reject(new Error('head.html conflict'));
            }
            return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
        });

        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
    });

    it('skips head.html vendor when the file is missing (degrades gracefully)', async () => {
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') return Promise.resolve(null);
            return Promise.resolve({
                content: '// Existing delayed.js contents\n',
                sha: 'delayed-sha',
            });
        });

        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        // delayed.js install still succeeds → installed=true
        expect(result).toEqual({ installed: true });
        const headCommits = mockGithub.createOrUpdateFile.mock.calls.filter(c => c[2] === 'head.html');
        expect(headCommits).toHaveLength(0);
    });

    it('appends the snippet to the existing delayed.js content (preserves prior content)', async () => {
        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        const writtenContent = mockGithub.createOrUpdateFile.mock.calls[0][3] as string;
        expect(writtenContent).toContain('// Existing delayed.js contents');
        expect(writtenContent).toContain('export default {};');
        expect(writtenContent).toContain('Smart 404 PDP rebuild');
    });

    it('skips when BYOM is disabled (overlayUrl is undefined)', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, undefined, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: false, reason: 'BYOM disabled' });
        expect(mockGithub.getFileContent).not.toHaveBeenCalled();
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('skips when the overlay URL cannot be parsed', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, 'not-a-url', mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
        expect(mockGithub.getFileContent).not.toHaveBeenCalled();
    });

    it('skips when the overlay URL is the wrong shape', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName,
            'https://example.com/api/v1/web/accs-discovery/discover-stores',
            mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
    });

    it('skips gracefully when delayed.js is missing from the storefront', async () => {
        mockGithub.getFileContent.mockResolvedValue(null);
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('delayed.js missing');
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('idempotent: skips when the snippet marker is already present', async () => {
        // Lets the step run safely on every create/edit/reset without
        // piling up duplicate snippets in delayed.js.
        mockGithub.getFileContent.mockResolvedValue({
            content: 'existing stuff\n// === Smart 404 PDP rebuild (Demo Builder) ===\n// snippet body...\n',
            sha: 'sha-already-installed',
        });
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('already installed');
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('skips gracefully when the GitHub commit fails', async () => {
        mockGithub.createOrUpdateFile.mockRejectedValue(new Error('GitHub 422 conflict'));
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toContain('GitHub commit failed');
        expect(result.reason).toContain('GitHub 422 conflict');
    });

    it('passes the storefront org and site through to the vendored snippet', async () => {
        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            'custom-org', 'custom-site',
        );

        const writtenContent = mockGithub.createOrUpdateFile.mock.calls[0][3] as string;
        expect(writtenContent).toContain('org=custom-org');
        expect(writtenContent).toContain('site=custom-site');
    });
});

