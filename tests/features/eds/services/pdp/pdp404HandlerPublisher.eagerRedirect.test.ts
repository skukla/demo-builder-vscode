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
    // EDS-45: 404.html is written by `updateNotFoundPage`, which puts its import map and
    // this redirect into ONE commit; the redirect's own cases live with it
    // (tests/features/eds/services/storefront/notFoundPage.test.ts).
    it('leaves 404.html to updateNotFoundPage: it neither reads nor writes it', async () => {
        await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger,
            daLiveOrg,
            daLiveSite
        );

        expect(mockGithub.getFileContent).not.toHaveBeenCalledWith(repoOwner, repoName, '404.html');
        expect(mockGithub.createOrUpdateFile.mock.calls.filter((c) => c[2] === '404.html')).toHaveLength(0);
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
                    // NONCED on purpose. With a nonce-free head.html the "no
                    // nonced script" guard skips the commit on its own, so the
                    // marker check would be doing nothing and the test would
                    // still pass — which is exactly how it read until 2026-09-06.
                    content:
                        '<meta charset="UTF-8">\n<!-- === Smart 404 PDP eager redirect (Demo Builder) === -->\n<script nonce="aem">existing</script>\n',
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
