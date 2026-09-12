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
import type { Storefront } from '@/types/demoPackages';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';

const logger = createMockLogger();

const STOREFRONT = {
    codePatches: ['product-link-sku-encoding', 'aem-assets-sku-sanitization'],
    codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
    contentPatches: ['content-a'],
    contentPatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
    patches: ['legacy-a'],
    byomOverlayUrl: 'https://example.test/render-pdp',
    accountContentSource: { org: 'demo', site: 'content' },
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
/** The catalog the lookups read: one package, one stack, the storefront above. */
function catalogWith(storefront: Partial<Storefront> = STOREFRONT) {
    return [makeDemoPackage({ id: 'starter', storefronts: { 'eds-accs': makeStorefront(storefront) } })];
}

const LOOKUP = { selectedPackage: 'starter', selectedStack: 'eds-accs' };

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
    });

    it('fills code patches and their source when edit mode omitted them', () => {
        const result = rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, LOOKUP, logger, catalogWith());

        expect(result.codePatches).toEqual(STOREFRONT.codePatches);
        expect(result.codePatchSource).toEqual(STOREFRONT.codePatchSource);
    });

    it('fills every package-derived field, not just the code patches', () => {
        // All seven come from the same WelcomeStep assignment and go missing
        // together. Fixing only the code patches would leave content patches
        // silently skipped in exactly the same way.
        const result = (rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, LOOKUP, logger, catalogWith())) as Record<string, unknown>;

        for (const key of Object.keys(STOREFRONT)) {
            expect(result[key]).toEqual((STOREFRONT as Record<string, unknown>)[key]);
        }
    });

    it('preserves the identity fields it did not supply', () => {
        const result = rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, LOOKUP, logger, catalogWith());

        expect(result.repoName).toBe('demo-builder-test');
        expect(result.daLiveOrg).toBe('skukla');
        expect(result.githubOwner).toBe('skukla');
    });

    it('never overwrites a value the caller already supplied', () => {
        // Creation flows arrive fully populated. Rehydration must not clobber a
        // deliberate choice with the package default.
        const supplied = { ...EDIT_MODE_CONFIG, codePatches: ['only-this-one'] };

        const result = rehydratePackageDerivedConfig(supplied, LOOKUP, logger, catalogWith());

        expect(result.codePatches).toEqual(['only-this-one']);
    });

    it('does not INVENT a key the package never defined', () => {
        // toEqual would let this through — it ignores properties whose value is
        // undefined — so the check is on the key set. A field written as
        // undefined is not the same as a field absent: every consumer guards on
        // presence, and `brandAssets: undefined` reads as configured-but-empty.
        const result = rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            LOOKUP,
            logger,
            catalogWith({ codePatches: ['only-the-one-defined'] }),
        ) as Record<string, unknown>;

        expect(result.codePatches).toEqual(['only-the-one-defined']);
        expect(Object.keys(result).sort()).toStrictEqual(
            [...Object.keys(EDIT_MODE_CONFIG), 'codePatches'].sort()
        );
    });

    it('stays silent when there was nothing to restore', () => {
        // The info line is the record that a republish picked its patches back
        // up. Printing it on a config that arrived complete makes it worthless —
        // it would appear on every creation run, which restores nothing.
        const complete = { ...EDIT_MODE_CONFIG, ...STOREFRONT };

        rehydratePackageDerivedConfig(complete, LOOKUP, logger, catalogWith());

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('returns the config untouched when the package is unknown, and says so', () => {
        // Both ids present and nothing found used to pass in silence — the one
        // miss the warn-on-missing-ids line above did not cover.
        const result = rehydratePackageDerivedConfig(
            EDIT_MODE_CONFIG,
            { selectedPackage: 'nope', selectedStack: 'eds-accs' },
            logger,
            catalogWith(),
        );

        expect(result).toEqual(EDIT_MODE_CONFIG);
        expect(logger.warn.mock.calls.flat().join(' ')).toContain('nope/eds-accs');
    });

    it('returns the config untouched when package or stack is missing', () => {
        const result = rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, {}, logger, catalogWith());

        expect(result).toEqual(EDIT_MODE_CONFIG);
    });

    it('warns when it cannot resolve, rather than no-opping in silence', () => {
        // A silent no-op here is what let a missing `selectedStack` disable every
        // patch with no trace in the log — the same failure this function fixes.
        rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, { selectedPackage: 'starter' }, logger, catalogWith());

        expect(logger.warn).toHaveBeenCalled();
        expect(logger.warn.mock.calls.flat().join(' ')).toContain('stack=missing');
    });


    it('reports what it restored, so a silent skip can never recur unlogged', () => {
        rehydratePackageDerivedConfig(EDIT_MODE_CONFIG, LOOKUP, logger, catalogWith());

        const said = logger.info.mock.calls.flat().join(' ');
        expect(said).toContain('codePatches');
    });
});
