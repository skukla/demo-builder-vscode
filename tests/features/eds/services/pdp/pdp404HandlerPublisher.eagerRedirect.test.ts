/**
 * Smart 404 handler installer — eager-redirect vendoring.
 *
 * Helix serves the static `404.html` on unknown-path 404s, bypassing
 * `head.html`, so the eager redirect has to be vendored into BOTH to eliminate
 * the visible 404 flash. Every failure here is non-fatal by design: the
 * `delayed.js` handler still recovers the page ~1-2s later, so a storefront
 * that cannot take the eager redirect is degraded, not broken.
 *
 * The `delayed.js` core path lives in the sibling
 * `pdp404HandlerPublisher.install.test.ts`.
 */

import { installSmart404Handler } from '@/features/eds/services/pdp/pdp404HandlerPublisher';

import {
    daLiveOrg,
    daLiveSite,
    makePdp404Github,
    mockLogger,
    overlayUrl,
    repoName,
    repoOwner,
    type GithubFake,
} from './pdp404HandlerPublisher.testUtils';

describe('installSmart404Handler — eager redirect vendoring', () => {
    let mockGithub: GithubFake;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGithub = makePdp404Github();
    });

    it('also vendors the eager redirect into head.html (eliminates the visible 404 flash)', async () => {
        // The head.html vendor handles the most common case — a PLP
        // click against a mixed-case product URL. Without this, every
        // PDP visit waits ~2 seconds for delayed.js to fire the
        // redirect. With it, the redirect happens synchronously
        // before any 404 paint.
        await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        expect(mockGithub.getFileContent).toHaveBeenCalledWith(repoOwner, repoName, 'head.html');
        const headCall = mockGithub.createOrUpdateFile.mock.calls.find((c) => c[2] === 'head.html');
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
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        const headCall = mockGithub.createOrUpdateFile.mock.calls.find((c) => c[2] === 'head.html');
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
                    content:
                        '<!DOCTYPE html><html><head><title>Page not found</title><script nonce="aem">window.isErrorPage = true;</script></head><body><h1>404</h1></body></html>',
                    sha: '404-sha',
                });
            }
            return Promise.resolve({
                content: '// delayed.js\n',
                sha: 'delayed-sha',
            });
        });

        await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        expect(mockGithub.getFileContent).toHaveBeenCalledWith(repoOwner, repoName, '404.html');
        const fourOhFourCall = mockGithub.createOrUpdateFile.mock.calls.find(
            (c) => c[2] === '404.html'
        );
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
                    content:
                        '<!DOCTYPE html><html><head>\n<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->\n<script nonce="aem">existing</script>\n</head></html>',
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
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        const fourOhFourCommits = mockGithub.createOrUpdateFile.mock.calls.filter(
            (c) => c[2] === '404.html'
        );
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
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
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
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        expect(result).toEqual({ installed: true });
        const headCommits = mockGithub.createOrUpdateFile.mock.calls.filter(
            (c) => c[2] === 'head.html'
        );
        expect(headCommits).toHaveLength(0);
    });
    it('head.html vendor is idempotent: skips if marker already present', async () => {
        // Lets the install step run on every create/edit/reset without
        // piling up duplicate head.html snippets.
        mockGithub.getFileContent.mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.resolve({
                    content:
                        '<meta charset="UTF-8">\n<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->\n<script>existing</script>\n',
                    sha: 'head-sha',
                });
            }
            return Promise.resolve({
                content: '// Existing delayed.js contents\n',
                sha: 'delayed-sha',
            });
        });

        await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        const headCommits = mockGithub.createOrUpdateFile.mock.calls.filter(
            (c) => c[2] === 'head.html'
        );
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
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
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
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        // delayed.js install still succeeds → installed=true
        expect(result).toEqual({ installed: true });
        const headCommits = mockGithub.createOrUpdateFile.mock.calls.filter(
            (c) => c[2] === 'head.html'
        );
        expect(headCommits).toHaveLength(0);
    });
});
