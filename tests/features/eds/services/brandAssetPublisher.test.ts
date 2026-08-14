/**
 * brandAssetPublisher — data-driven brand-asset vendoring.
 *
 * Copies additive brand files (theme CSS, brand modules) from a source repo
 * into a generated storefront repo, and vendors an optional marker-bounded
 * snippet into head.html. Same operational contract as the smart-404
 * installer (`pdp404HandlerPublisher`): idempotent by marker/content,
 * stale-SHA retry once, non-fatal — the publisher never throws for fetch or
 * write failures; it logs and reports per-file results instead.
 *
 * The target-allowlist and headSnippet-validation suites live in
 * `brandAssetPublisher-policy.test.ts`; shared fixtures in
 * `brandAssetPublisher.testUtils.ts`.
 */

import {
    publishBrandAssets,
    BRAND_ASSETS_MARKER_START,
    BRAND_ASSETS_MARKER_END,
} from '@/features/eds/services/brandAssetPublisher';
import {
    CONFIG,
    THEME_CSS,
    GROUP_JS,
    HEAD_HTML,
    repoOwner,
    repoName,
    logger,
    asOps,
    writesTo,
    makeMockGithub,
    mockSourceFetch,
} from './brandAssetPublisher.testUtils';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { PREREQUISITE_CHECK: 15000, NORMAL: 15000 },
}));

describe('publishBrandAssets', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('file copies', () => {
        it('fetches each configured file from the source repo at the configured branch', async () => {
            const fetchMock = mockSourceFetch();
            await publishBrandAssets(CONFIG, asOps(makeMockGithub()), repoOwner, repoName, logger);

            const urls = fetchMock.mock.calls.map((c) => String(c[0]));
            expect(urls).toContain(
                'https://raw.githubusercontent.com/skukla/accs-bodea/main/styles/bodea-theme.css',
            );
            expect(urls).toContain(
                'https://raw.githubusercontent.com/skukla/accs-bodea/main/scripts/bodea-customer-group.js',
            );
        });

        it('creates a new file when the target does not exist', async () => {
            mockSourceFetch();
            const github = makeMockGithub();

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            const themeWrites = writesTo(github, 'styles/bodea-theme.css');
            expect(themeWrites).toHaveLength(1);
            // [owner, repo, path, content, message, sha]
            expect(themeWrites[0][3]).toBe(THEME_CSS);
            expect(themeWrites[0][5]).toBeUndefined();
            expect(result.files[0]).toEqual(
                expect.objectContaining({ path: 'styles/bodea-theme.css', installed: true }),
            );
        });

        it('updates an existing file whose content changed, passing its SHA', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'styles/bodea-theme.css') {
                    return Promise.resolve({ content: '/* stale */', sha: 'old-theme-sha' });
                }
                if (path === 'head.html') {
                    return Promise.resolve({ content: HEAD_HTML, sha: 'head-sha' });
                }
                return Promise.resolve(null);
            });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            const themeWrites = writesTo(github, 'styles/bodea-theme.css');
            expect(themeWrites).toHaveLength(1);
            expect(themeWrites[0][3]).toBe(THEME_CSS);
            expect(themeWrites[0][5]).toBe('old-theme-sha');
            expect(result.files[0].installed).toBe(true);
        });

        it('skips the write when the target is already identical', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'styles/bodea-theme.css') {
                    return Promise.resolve({ content: THEME_CSS, sha: 'theme-sha' });
                }
                if (path === 'head.html') {
                    return Promise.resolve({ content: HEAD_HTML, sha: 'head-sha' });
                }
                return Promise.resolve(null);
            });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(writesTo(github, 'styles/bodea-theme.css')).toHaveLength(0);
            expect(result.files[0]).toEqual(
                expect.objectContaining({ installed: false, reason: 'already current' }),
            );
        });

        it('reports a non-fatal reason when a source fetch 404s and still processes the rest', async () => {
            mockSourceFetch({ 'scripts/bodea-customer-group.js': GROUP_JS });
            const github = makeMockGithub();

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(result.files[0].installed).toBe(false);
            expect(result.files[0].reason).toContain('404');
            // The second file still lands.
            expect(writesTo(github, 'scripts/bodea-customer-group.js')).toHaveLength(1);
            expect(result.files[1].installed).toBe(true);
            expect(result.success).toBe(false);
        });

        it('reports a non-fatal reason when the source fetch throws', async () => {
            const mock = jest.fn().mockRejectedValue(new Error('network down'));
            global.fetch = mock as unknown as typeof fetch;
            const github = makeMockGithub();

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(result.success).toBe(false);
            for (const file of result.files) {
                expect(file.installed).toBe(false);
                expect(file.reason).toContain('network down');
            }
        });

        it('reports a non-fatal reason when the GitHub write fails (never throws)', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            github.createOrUpdateFile.mockRejectedValue(new Error('403 Forbidden'));

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(result.success).toBe(false);
            expect(result.files[0].installed).toBe(false);
            expect(result.files[0].reason).toContain('403 Forbidden');
        });

        it('retries once on a stale SHA by re-reading the target', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'styles/bodea-theme.css') {
                    return Promise.resolve({ content: '/* moved */', sha: 'fresh-theme-sha' });
                }
                if (path === 'head.html') {
                    return Promise.resolve({ content: HEAD_HTML, sha: 'head-sha' });
                }
                return Promise.resolve(null);
            });
            github.createOrUpdateFile.mockImplementation((_o, _r, path: string, _c, _m, sha) => {
                if (path === 'styles/bodea-theme.css' && sha !== 'fresh-theme-sha') {
                    return Promise.reject(new Error('styles/bodea-theme.css does not match sha'));
                }
                return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
            });
            // First write uses the initially-read SHA and is rejected as stale;
            // the retry re-reads and succeeds with the fresh SHA.
            github.getFileContent
                .mockImplementationOnce((_o, _r, path: string) => {
                    if (path === 'styles/bodea-theme.css') {
                        return Promise.resolve({ content: '/* stale */', sha: 'stale-theme-sha' });
                    }
                    return Promise.resolve(null);
                });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            const themeWrites = writesTo(github, 'styles/bodea-theme.css');
            expect(themeWrites).toHaveLength(2);
            expect(themeWrites[1][5]).toBe('fresh-theme-sha');
            expect(result.files[0].installed).toBe(true);
        });

        it('skips the retry write when the re-read shows the content already landed', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            // First read: stale state. Re-read after the stale-SHA rejection:
            // someone else already wrote the exact content.
            github.getFileContent
                .mockImplementationOnce((_o, _r, path: string) => {
                    if (path === 'styles/bodea-theme.css') {
                        return Promise.resolve({ content: '/* stale */', sha: 'stale-theme-sha' });
                    }
                    return Promise.resolve(null);
                })
                .mockImplementation((_o, _r, path: string) => {
                    if (path === 'styles/bodea-theme.css') {
                        return Promise.resolve({ content: THEME_CSS, sha: 'fresh-theme-sha' });
                    }
                    if (path === 'head.html') {
                        return Promise.resolve({ content: HEAD_HTML, sha: 'head-sha' });
                    }
                    return Promise.resolve(null);
                });
            github.createOrUpdateFile.mockImplementation((_o, _r, path: string, _c, _m, sha) => {
                if (path === 'styles/bodea-theme.css' && sha === 'stale-theme-sha') {
                    return Promise.reject(new Error('styles/bodea-theme.css does not match sha'));
                }
                return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
            });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(writesTo(github, 'styles/bodea-theme.css')).toHaveLength(1);
            expect(result.files[0].installed).toBe(true);
        });
    });

    describe('head.html snippet', () => {
        it('appends a marker-bounded block when the markers are absent', async () => {
            mockSourceFetch();
            const github = makeMockGithub();

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            const headWrites = writesTo(github, 'head.html');
            expect(headWrites).toHaveLength(1);
            const written = headWrites[0][3] as string;
            expect(written.startsWith(HEAD_HTML)).toBe(true);
            expect(written).toContain(BRAND_ASSETS_MARKER_START);
            expect(written).toContain(CONFIG.headSnippet!);
            expect(written).toContain(BRAND_ASSETS_MARKER_END);
            expect(written.indexOf(BRAND_ASSETS_MARKER_START))
                .toBeLessThan(written.indexOf(BRAND_ASSETS_MARKER_END));
            expect(result.headSnippet).toEqual(
                expect.objectContaining({ path: 'head.html', installed: true }),
            );
        });

        it('is idempotent: an identical marker block is not rewritten', async () => {
            mockSourceFetch();
            const github = makeMockGithub();

            // First run captures what got written; second run starts from it.
            await publishBrandAssets(CONFIG, asOps(github), repoOwner, repoName, logger);
            const vendored = writesTo(github, 'head.html')[0][3] as string;

            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'head.html') {
                    return Promise.resolve({ content: vendored, sha: 'head-sha-2' });
                }
                return Promise.resolve(null);
            });
            github.createOrUpdateFile.mockClear();

            const rerun = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(writesTo(github, 'head.html')).toHaveLength(0);
            expect(rerun.headSnippet).toEqual(
                expect.objectContaining({ installed: false, reason: 'already current' }),
            );
        });

        it('re-vendors in place when the marker block carries an older snippet', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            const stale =
                `${HEAD_HTML}\n${BRAND_ASSETS_MARKER_START}\n`
                + '<link rel="stylesheet" href="/styles/old-theme.css">\n'
                + `${BRAND_ASSETS_MARKER_END}\n<!-- trailing -->\n`;
            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'head.html') {
                    return Promise.resolve({ content: stale, sha: 'head-sha' });
                }
                return Promise.resolve(null);
            });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            const headWrites = writesTo(github, 'head.html');
            expect(headWrites).toHaveLength(1);
            const written = headWrites[0][3] as string;
            expect(written).toContain(CONFIG.headSnippet!);
            expect(written).not.toContain('old-theme.css');
            // Content outside the block is preserved.
            expect(written.startsWith(HEAD_HTML)).toBe(true);
            expect(written).toContain('<!-- trailing -->');
            expect(result.headSnippet!.installed).toBe(true);
        });

        it('reports a failure (not "already current") when the marker block is malformed', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            // Start marker present, end marker mangled away — a complete block
            // cannot be rebuilt, and appending would duplicate the start marker.
            const mangled = `${HEAD_HTML}\n${BRAND_ASSETS_MARKER_START}\n<link rel="stylesheet" href="/styles/bodea-theme.css">\n`;
            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'head.html') {
                    return Promise.resolve({ content: mangled, sha: 'head-sha' });
                }
                return Promise.resolve(null);
            });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(result.headSnippet).toEqual({
                path: 'head.html',
                installed: false,
                reason: 'malformed brand-assets marker block',
            });
            expect(writesTo(github, 'head.html')).toHaveLength(0);
            expect(result.success).toBe(false);
        });

        it('reports a non-fatal reason when head.html is missing', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'head.html') return Promise.resolve(null);
                return Promise.resolve(null);
            });

            const result = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(result.headSnippet).toEqual(
                expect.objectContaining({ installed: false, reason: 'head.html missing' }),
            );
            expect(writesTo(github, 'head.html')).toHaveLength(0);
        });

        it('does not touch head.html when the config has no headSnippet', async () => {
            mockSourceFetch();
            const github = makeMockGithub();
            const { headSnippet: _unused, ...noSnippet } = CONFIG;

            const result = await publishBrandAssets(
                noSnippet as typeof CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(result.headSnippet).toBeUndefined();
            const headReads = github.getFileContent.mock.calls.filter(
                (c) => c[2] === 'head.html',
            );
            expect(headReads).toHaveLength(0);
        });
    });

    describe('overall result', () => {
        it('reports success when everything is already current (no-op re-run)', async () => {
            mockSourceFetch();
            const github = makeMockGithub();

            // First run vendors everything; feed its outputs back as the repo state.
            await publishBrandAssets(CONFIG, asOps(github), repoOwner, repoName, logger);
            const vendoredHead = writesTo(github, 'head.html')[0][3] as string;

            github.getFileContent.mockImplementation((_o, _r, path: string) => {
                if (path === 'head.html') {
                    return Promise.resolve({ content: vendoredHead, sha: 'h2' });
                }
                if (path === 'styles/bodea-theme.css') {
                    return Promise.resolve({ content: THEME_CSS, sha: 't2' });
                }
                if (path === 'scripts/bodea-customer-group.js') {
                    return Promise.resolve({ content: GROUP_JS, sha: 'g2' });
                }
                return Promise.resolve(null);
            });
            github.createOrUpdateFile.mockClear();

            const rerun = await publishBrandAssets(
                CONFIG, asOps(github), repoOwner, repoName, logger,
            );

            expect(rerun.success).toBe(true);
            expect(github.createOrUpdateFile).not.toHaveBeenCalled();
        });
    });
});
