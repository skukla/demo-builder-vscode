/**
 * What brandAssetPublisher does when someone else writes to the repo mid-run.
 *
 * `syncFile` reads, derives and writes, and re-reads ONCE when GitHub rejects
 * the write for a stale SHA. Everything here is that retry: what earns one, what
 * the re-derived write carries, and the two states the re-read can come back in
 * that the first read could not — the target deleted, and the content already
 * landed.
 *
 * The happy paths live in `brandAssetPublisher.test.ts`, the allowlists in
 * `brandAssetPublisher-policy.test.ts`, and the fixtures in
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
    HEAD_HTML,
    repoOwner,
    repoName,
    logger,
    asOps,
    writesTo,
    makeBrandAssetGithub,
    mockSourceFetch,
} from './brandAssetPublisher.testUtils';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { PREREQUISITE_CHECK: 15000, NORMAL: 15000 },
}));

describe('publishBrandAssets under a concurrent writer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('a contended file copy', () => {
        it('retries once on a stale SHA by re-reading the target', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();
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
            github.getFileContent.mockImplementationOnce((_o, _r, path: string) => {
                if (path === 'styles/bodea-theme.css') {
                    return Promise.resolve({ content: '/* stale */', sha: 'stale-theme-sha' });
                }
                return Promise.resolve(null);
            });

            const result = await publishBrandAssets(
                CONFIG,
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            const themeWrites = writesTo(github, 'styles/bodea-theme.css');
            expect(themeWrites).toHaveLength(2);
            expect(themeWrites[1][5]).toBe('fresh-theme-sha');
            expect(result.files[0].installed).toBe(true);
        });

        // Only a stale SHA earns a retry. Re-reading after a 403 would spend a
        // second round trip to reach the same refusal.
        it('does not re-read the target when the write fails for another reason', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();
            github.createOrUpdateFile.mockRejectedValue(new Error('403 Forbidden'));

            await publishBrandAssets(CONFIG, asOps(github), repoOwner, repoName, logger);

            const themeReads = github.getFileContent.mock.calls.filter(
                (c) => c[2] === 'styles/bodea-theme.css'
            );
            expect(themeReads).toHaveLength(1);
        });

        // The concurrent writer DELETED the file rather than changing it. The
        // retry then has no SHA to send, which is exactly right for a create.
        it('retries as a create when the re-read finds the target gone', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();
            github.getFileContent
                .mockImplementationOnce((_o, _r, path: string) =>
                    Promise.resolve(
                        path === 'styles/bodea-theme.css'
                            ? { content: '/* stale */', sha: 'stale-theme-sha' }
                            : null
                    )
                )
                .mockImplementation((_o, _r, path: string) =>
                    Promise.resolve(
                        path === 'head.html' ? { content: HEAD_HTML, sha: 'head-sha' } : null
                    )
                );
            github.createOrUpdateFile.mockImplementation((_o, _r, path: string, _c, _m, sha) =>
                path === 'styles/bodea-theme.css' && sha === 'stale-theme-sha'
                    ? Promise.reject(new Error('styles/bodea-theme.css does not match sha'))
                    : Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' })
            );

            const result = await publishBrandAssets(
                CONFIG,
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            const themeWrites = writesTo(github, 'styles/bodea-theme.css');
            expect(themeWrites).toHaveLength(2);
            expect(themeWrites[1][5]).toBeUndefined();
            expect(result.files[0].installed).toBe(true);
        });

        it('skips the retry write when the re-read shows the content already landed', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();
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
                CONFIG,
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(writesTo(github, 'styles/bodea-theme.css')).toHaveLength(1);
            expect(result.files[0].installed).toBe(true);
        });
    });

    describe('a contended head.html', () => {
        // head.html existed on the first read (or the target would have been
        // refused outright) and was gone by the retry. The block is rebuilt from
        // an empty document rather than read off nothing.
        it('rebuilds the block from scratch when the re-read finds head.html gone', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();
            github.getFileContent
                .mockImplementationOnce((_o, _r, path: string) =>
                    Promise.resolve(
                        path === 'head.html' ? { content: HEAD_HTML, sha: 'head-sha' } : null
                    )
                )
                .mockImplementation((_o, _r, path: string) =>
                    Promise.resolve(
                        path === 'head.html' ? { content: HEAD_HTML, sha: 'head-sha' } : null
                    )
                );
            // Only head.html is contended; the file copies land normally.
            let headWritesSeen = 0;
            github.createOrUpdateFile.mockImplementation((_o, _r, path: string) => {
                if (path !== 'head.html') {
                    return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
                }
                headWritesSeen += 1;
                if (headWritesSeen === 1) {
                    // Rejected as stale, and the re-read below finds it deleted.
                    github.getFileContent.mockResolvedValue(null);
                    return Promise.reject(new Error('head.html does not match sha'));
                }
                return Promise.resolve({ sha: 'new-sha', commitSha: 'commit-sha' });
            });

            const result = await publishBrandAssets(
                CONFIG,
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            const headWrites = writesTo(github, 'head.html');
            expect(headWrites).toHaveLength(2);
            expect(headWrites[1][3]).toBe(
                `\n${BRAND_ASSETS_MARKER_START}\n${CONFIG.headSnippet}\n${BRAND_ASSETS_MARKER_END}\n`
            );
            expect(result.headSnippet!.installed).toBe(true);
        });
    });
});
