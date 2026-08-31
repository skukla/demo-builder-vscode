/**
 * Package-derived edsConfig rehydration.
 *
 * `WelcomeStep` is the only producer of the package-derived storefront fields
 * (patches, content patches, code patches, and their sources). It runs on
 * package selection during project creation. Edit mode reconstructs edsConfig
 * from project metadata, which persists none of them — so every republish of an
 * existing project arrived with them undefined, and `storefrontSetupPhase1`
 * silently returned without applying any patch at all.
 *
 * Found 2026-07-29 on a live run: five configured code patches — including the
 * ADR-007 SKU-encoding trio that PDP routing depends on — never fetched. Present
 * in v1.0.0-beta.121 verbatim.
 */

import { rehydratePackageDerivedConfig } from '@/features/eds/handlers/storefrontSetup/storefrontSetupConfigRehydration';
import { getStorefrontForStack } from '@/features/components/services/demoPackageLoader';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStorefrontForStack: jest.fn(),
}));

const mockLookup = getStorefrontForStack as jest.Mock;

const logger = createMockLogger();

const STOREFRONT = {
    codePatches: ['product-link-sku-encoding', 'aem-assets-sku-sanitization'],
    codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
    contentPatches: ['content-a'],
    contentPatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
    patches: ['legacy-a'],
    byomOverlayUrl: 'https://example.test/render-pdp',
    accountContentSource: { owner: 'demo', repo: 'content' },
    brandAssets: {
        source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
        files: [{ from: 'styles/bodea-theme.css', to: 'styles/bodea-theme.css' }],
        headSnippet: '<link rel="stylesheet" href="/styles/bodea-theme.css">',
    },
};

/**
 * The edit-mode shape: metadata only, no package-derived fields — but TYPED to
 * admit them. `rehydratePackageDerivedConfig<T>` returns `Promise<T>`, so the
 * restored fields are only visible to the typechecker if T declares them as
 * optional; runtime-wise the function fills them regardless (that is its job).
 */
const EDIT_MODE_CONFIG: {
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
    githubOwner: string;
} & Partial<typeof STOREFRONT> = {
    repoName: 'demo-builder-test',
    daLiveOrg: 'skukla',
    daLiveSite: 'demo-builder-test',
    githubOwner: 'skukla',
};

describe('rehydratePackageDerivedConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLookup.mockResolvedValue(STOREFRONT);
    });

    it('fills code patches and their source when edit mode omitted them', async () => {
        const result = await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            'custom',
            'eds-accs',
            logger as never
        );

        expect(result.codePatches).toEqual(STOREFRONT.codePatches);
        expect(result.codePatchSource).toEqual(STOREFRONT.codePatchSource);
    });

    it('fills every package-derived field, not just the code patches', async () => {
        // All seven come from the same WelcomeStep assignment and go missing
        // together. Fixing only the code patches would leave content patches
        // silently skipped in exactly the same way.
        const result = (await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            'custom',
            'eds-accs',
            logger as never
        )) as Record<string, unknown>;

        for (const key of Object.keys(STOREFRONT)) {
            expect(result[key]).toEqual((STOREFRONT as Record<string, unknown>)[key]);
        }
    });

    it('preserves the identity fields it did not supply', async () => {
        const result = await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            'custom',
            'eds-accs',
            logger as never
        );

        expect(result.repoName).toBe('demo-builder-test');
        expect(result.daLiveOrg).toBe('skukla');
        expect(result.githubOwner).toBe('skukla');
    });

    it('never overwrites a value the caller already supplied', async () => {
        // Creation flows arrive fully populated. Rehydration must not clobber a
        // deliberate choice with the package default.
        const supplied = { ...EDIT_MODE_CONFIG, codePatches: ['only-this-one'] };

        const result = await rehydratePackageDerivedConfig(
            supplied,
            'custom',
            'eds-accs',
            logger as never
        );

        expect(result.codePatches).toEqual(['only-this-one']);
    });

    it('returns the config untouched when the package is unknown', async () => {
        mockLookup.mockResolvedValue(undefined);

        const result = await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            'nope',
            'eds-accs',
            logger as never
        );

        expect(result).toEqual(EDIT_MODE_CONFIG);
    });

    it('returns the config untouched when package or stack is missing', async () => {
        const result = await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            undefined,
            undefined,
            logger as never
        );

        expect(result).toEqual(EDIT_MODE_CONFIG);
        expect(mockLookup).not.toHaveBeenCalled();
    });

    it('warns when it cannot resolve, rather than no-opping in silence', async () => {
        // A silent no-op here is what let a missing `selectedStack` disable every
        // patch with no trace in the log — the same failure this function fixes.
        await rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, 'custom', undefined, logger as never);

        expect(logger.warn).toHaveBeenCalled();
        expect(logger.warn.mock.calls.flat().join(' ')).toContain('stack=missing');
    });

    it('survives a lookup failure rather than aborting setup', async () => {
        // A malformed demo-packages.json must not take storefront setup down;
        // the pre-fix behavior (no patches) is the correct degradation.
        mockLookup.mockRejectedValue(new Error('bad json'));

        const result = await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            'custom',
            'eds-accs',
            logger as never
        );

        expect(result).toEqual(EDIT_MODE_CONFIG);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('reports what it restored, so a silent skip can never recur unlogged', async () => {
        await rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            'custom',
            'eds-accs',
            logger as never
        );

        const said = logger.info.mock.calls.flat().join(' ');
        expect(said).toContain('codePatches');
    });
});
