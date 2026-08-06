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
    installSmart404Handler,
} from '@/features/eds/services/pdp404HandlerPublisher';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

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


/**
 * Stale-SHA retry.
 *
 * Inspector Tagging writes `scripts/delayed.js` through the Git Tree API during
 * block installation; this publisher reads it back through the Contents API,
 * which serves from a different path and can lag behind a tree commit. A live
 * run on 2026-07-29 lost that race 18 seconds after the tree commit:
 *
 *   [PDP404] GitHub commit failed: scripts/delayed.js does not match
 *            15be5fb9e97773471ea4124c259d6d1e2eeb2626 — skipping smart 404 install
 *
 * The step is non-fatal, so setup reported Complete with no PDP handling at all.
 * Re-reading and retrying once covers both the staleness and genuine interleaving.
 */
describe('installSmart404Handler — stale SHA', () => {
    const repoOwner = 'skukla';
    const repoName = 'citisignal-b2b';
    const daLiveOrg = 'skukla';
    const daLiveSite = 'citisignal-b2b';
    const overlayUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';
    const SHA_MISMATCH = 'scripts/delayed.js does not match 15be5fb9e97773471ea4124c259d6d1e2eeb2626';

    /** Contents API hands back `sha` on each successive read of delayed.js. */
    function makeGithub(delayedShas: string[]) {
        let read = 0;
        return {
            getFileContent: jest.fn().mockImplementation((_o: string, _r: string, path: string) => {
                if (path === 'head.html') {
                    return Promise.resolve({
                        content: '<meta charset="UTF-8">\n<script nonce="aem" type="importmap">{}</script>\n',
                        sha: 'head-sha',
                    });
                }
                if (path === '404.html') {
                    return Promise.resolve({
                        content: '<!DOCTYPE html><html><head><script nonce="aem">w.x=1;</script></head></html>',
                        sha: '404-sha',
                    });
                }
                const sha = delayedShas[Math.min(read, delayedShas.length - 1)];
                read += 1;
                return Promise.resolve({ content: '// Existing delayed.js\n', sha });
            }),
            createOrUpdateFile: jest.fn(),
        };
    }

    beforeEach(() => jest.clearAllMocks());

    it('re-reads and retries once when the write is rejected for a stale SHA', async () => {
        const gh = makeGithub(['stale-sha', 'fresh-sha']);
        gh.createOrUpdateFile
            .mockRejectedValueOnce(new Error(SHA_MISMATCH))
            .mockResolvedValue({ sha: 'new', commitSha: 'c' });

        const result = await installSmart404Handler(
            gh as never, repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
        const delayedWrites = gh.createOrUpdateFile.mock.calls.filter(
            c => c[2] === 'scripts/delayed.js',
        );
        expect(delayedWrites).toHaveLength(2);
        expect(delayedWrites[1][5]).toBe('fresh-sha');
    });

    it('retries only once — a second stale rejection gives up', async () => {
        const gh = makeGithub(['stale-1', 'stale-2']);
        gh.createOrUpdateFile.mockRejectedValue(new Error(SHA_MISMATCH));

        const result = await installSmart404Handler(
            gh as never, repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        const delayedWrites = gh.createOrUpdateFile.mock.calls.filter(
            c => c[2] === 'scripts/delayed.js',
        );
        expect(delayedWrites).toHaveLength(2);
    });

    it('does NOT retry a failure that is not a SHA mismatch', async () => {
        // Permissions and missing-file failures are not transient. Retrying
        // them just doubles the latency of a certain failure.
        const gh = makeGithub(['sha-1']);
        gh.createOrUpdateFile.mockRejectedValue(new Error('Resource not accessible by integration'));

        const result = await installSmart404Handler(
            gh as never, repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        const delayedWrites = gh.createOrUpdateFile.mock.calls.filter(
            c => c[2] === 'scripts/delayed.js',
        );
        expect(delayedWrites).toHaveLength(1);
    });
});
