/**
 * brandAssetPublisher policy suites — target allowlist, headSnippet
 * validation, and the failedTargets result filter.
 *
 * Brand-asset config comes from demo-packages.json and its content lands in
 * generated storefront repos, where it runs in demo audiences' browsers.
 * These tests pin the point-of-consumption checks (mirroring
 * `patchTargetPolicy` for code patches): a `files[].to` outside
 * styles/*.css | scripts/*.js is refused, and a head snippet that is
 * anything but rooted link/script tags is refused — both as per-target
 * non-fatal failures, never throws.
 */

import {
    publishBrandAssets,
    failedTargets,
    BRAND_ASSETS_MARKER_END,
} from '@/features/eds/services/brandAssetPublisher';
import type { BrandAssetsConfig } from '@/types/demoPackages';
import {
    CONFIG,
    THEME_CSS,
    GROUP_JS,
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

describe('publishBrandAssets policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('target policy', () => {
        function configWithFiles(files: Array<{ from: string; to: string }>): BrandAssetsConfig {
            return { source: CONFIG.source, files };
        }

        it('allows styles/*.css, scripts/*.js and data/*.json targets', async () => {
            mockSourceFetch({
                'src/theme.css': THEME_CSS,
                'src/mod.js': GROUP_JS,
                'src/schema.json': '{"id":"x"}',
            });
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithFiles([
                    { from: 'src/theme.css', to: 'styles/x.css' },
                    { from: 'src/mod.js', to: 'scripts/y.js' },
                    { from: 'src/schema.json', to: 'data/guided-selling/z.json' },
                ]),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.files[0]).toEqual(
                expect.objectContaining({ path: 'styles/x.css', installed: true })
            );
            expect(result.files[1]).toEqual(
                expect.objectContaining({ path: 'scripts/y.js', installed: true })
            );
            expect(result.files[2]).toEqual(
                expect.objectContaining({ path: 'data/guided-selling/z.json', installed: true })
            );
            expect(result.success).toBe(true);
        });

        it.each([
            '.github/workflows/x.yml',
            '../x.css',
            '/abs.css',
            'styles/x.js',
            'head.html',
            'scripts\\evil.js',
            'scripts/../.github/x.js',
            // data/ is allowlisted only for .json — not as a general escape hatch
            'data/x.js',
            'data/../.github/x.json',
        ])('refuses target %s with a per-file non-fatal failure', async (to) => {
            // Source fetch WOULD succeed — only the target policy stands in the way.
            mockSourceFetch({ 'styles/bodea-theme.css': THEME_CSS });
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithFiles([{ from: 'styles/bodea-theme.css', to }]),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.files[0]).toEqual({
                path: to,
                installed: false,
                reason: `refused target: ${to}`,
            });
            expect(github.createOrUpdateFile).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining(`refused target: ${to}`)
            );
        });

        // The drive-letter refusal is anchored to the START of the path. A colon
        // further along is an ordinary character in a filename, and an unanchored
        // check would refuse a target the allowlist otherwise accepts.
        it('does not read a colon later in the path as a drive letter', async () => {
            mockSourceFetch({ 'src/theme.css': THEME_CSS });
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithFiles([{ from: 'src/theme.css', to: 'styles/bodea:dark.css' }]),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.files[0]).toEqual(
                expect.objectContaining({ path: 'styles/bodea:dark.css', installed: true })
            );
        });

        it('still vendors the allowed files when one target is refused', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithFiles([
                    { from: 'styles/bodea-theme.css', to: '.github/workflows/x.yml' },
                    {
                        from: 'scripts/bodea-customer-group.js',
                        to: 'scripts/bodea-customer-group.js',
                    },
                ]),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.files[0].installed).toBe(false);
            expect(writesTo(github, 'scripts/bodea-customer-group.js')).toHaveLength(1);
            expect(result.files[1].installed).toBe(true);
        });
    });

    describe('headSnippet validation', () => {
        function configWithSnippet(headSnippet: string): BrandAssetsConfig {
            return { source: CONFIG.source, files: [], headSnippet };
        }

        it('accepts the bundled shape: a stylesheet link plus a module script', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithSnippet(CONFIG.headSnippet!),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.headSnippet).toEqual(
                expect.objectContaining({ path: 'head.html', installed: true })
            );
            expect(writesTo(github, 'head.html')).toHaveLength(1);
        });

        // Formatting is not content. A snippet authored with indentation or with
        // blank lines around it is the same two tags, and refusing it would make
        // demo-packages.json editable only by someone who knew the rule.
        it.each([
            ['blank lines around the tags', `\n${CONFIG.headSnippet!}\n`],
            ['indented tags', `  ${CONFIG.headSnippet!.split('\n').join('\n  ')}  `],
        ])('accepts a snippet with %s', async (_label, headSnippet) => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithSnippet(headSnippet),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.headSnippet).toEqual(
                expect.objectContaining({ path: 'head.html', installed: true })
            );
        });

        // EVERY line has to pass, not merely one of them. A snippet that opens
        // with a legitimate stylesheet link and follows it with anything else is
        // refused whole.
        it('refuses a snippet where only SOME lines are allowed', async () => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithSnippet(
                    '<link rel="stylesheet" href="/styles/ok.css">\n<iframe src="/x.html"></iframe>'
                ),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.headSnippet).toEqual({
                path: 'head.html',
                installed: false,
                reason: 'refused headSnippet',
            });
            expect(github.createOrUpdateFile).not.toHaveBeenCalled();
        });

        it.each([
            ['inline script body', '<script>alert(1)</script>'],
            ['non-link/script tag', '<iframe src="/x.html"></iframe>'],
            [
                'embedded end marker',
                `<link rel="stylesheet" href="/a.css">\n${BRAND_ASSETS_MARKER_END}`,
            ],
            ['external http script src', '<script src="http://evil.example/x.js"></script>'],
            [
                'event-handler attribute on a link',
                '<link rel="stylesheet" href="/x.css" onload="alert(1)">',
            ],
            [
                'decoy data-href smuggling an external stylesheet URL',
                '<link rel="stylesheet" href="https://evil.example/x.css" data-href="/ok.css">',
            ],
            [
                'decoy data-src smuggling an external script URL',
                '<script type="module" src="https://evil.example/x.js" data-src="/ok.js"></script>',
            ],
            [
                'backslash authority (WHATWG treats \\ as / in http URLs)',
                '<script type="module" src="/\\evil.example/x.js"></script>',
            ],
            [
                'tab-split authority (URL preprocessing strips tabs)',
                '<link rel="stylesheet" href="/\t/evil.example/x.css">',
            ],
        ])('refuses a snippet with %s without touching head.html', async (_label, headSnippet) => {
            mockSourceFetch();
            const github = makeBrandAssetGithub();

            const result = await publishBrandAssets(
                configWithSnippet(headSnippet),
                asOps(github),
                repoOwner,
                repoName,
                logger
            );

            expect(result.headSnippet).toEqual({
                path: 'head.html',
                installed: false,
                reason: 'refused headSnippet',
            });
            expect(github.createOrUpdateFile).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('refused headSnippet')
            );
        });
    });

    describe('failedTargets', () => {
        it('keeps real failures across files and headSnippet, dropping installed and already-current targets', () => {
            expect(
                failedTargets({
                    success: false,
                    files: [
                        { path: 'styles/a.css', installed: true },
                        { path: 'styles/b.css', installed: false, reason: 'already current' },
                        {
                            path: 'scripts/c.js',
                            installed: false,
                            reason: 'fetch failed: HTTP 404 Not Found',
                        },
                    ],
                    headSnippet: {
                        path: 'head.html',
                        installed: false,
                        reason: 'malformed brand-assets marker block',
                    },
                })
            ).toEqual([
                {
                    path: 'scripts/c.js',
                    installed: false,
                    reason: 'fetch failed: HTTP 404 Not Found',
                },
                {
                    path: 'head.html',
                    installed: false,
                    reason: 'malformed brand-assets marker block',
                },
            ]);
        });

        it('returns an empty list when everything is current (no headSnippet declared)', () => {
            expect(
                failedTargets({
                    success: true,
                    files: [
                        { path: 'styles/a.css', installed: true },
                        { path: 'styles/b.css', installed: false, reason: 'already current' },
                    ],
                })
            ).toEqual([]);
        });
    });
});
