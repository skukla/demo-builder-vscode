/**
 * What creation and reset do about our fixes on a project built on an added
 * demo (EDS-13f steps 02 and 03). Three cases, by what the demo shows:
 *
 *   - a saved package (`builtWith` names our template and its ledger): its
 *     ledger is APPLIED where it fits, automatically: both ends are the SC's;
 *   - a colleague's storefront with our lineage: the fixes that fit are
 *     OFFERED, never applied unless the caller says the SC accepted;
 *   - anything else: the dry check, as before. It runs only here.
 *
 * Writes go to the SC's OWN repository, never the demo's source. The real
 * engine runs; the ledger fetch, the template fetch the dry check makes, and
 * the repository are the boundaries.
 */

import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import { applyCanonicalCodePatches } from '@/features/eds/services/patches/codePatchPipelineHelpers';
import { demoFixLines, runDemoFixPass } from '@/features/eds/services/patches/demoFixPass';
import { fetchExternalPatches } from '@/features/eds/services/patches/externalPatchFetcher';
import { CONSEQUENCE_CAVEATS, resolveDryCheckSource } from '@/features/eds/services/patches/loadBearingPatches';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/eds/services/patches/externalPatchFetcher', () => ({ fetchExternalPatches: jest.fn() }));
jest.mock('@/features/eds/services/patches/codePatchPipelineHelpers', () => ({ applyCanonicalCodePatches: jest.fn() }));
const mockLedger = fetchExternalPatches as jest.Mock;
const mockDryCheck = applyCanonicalCodePatches as jest.Mock;

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const SAVED_LEDGER = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b', lkgFile: 'b2b/last-known-good' };
/** The SC's own repository, generated from the demo. */
const OWN = { owner: 'steve', repo: 'aistore-copy', branch: 'main' };
const DEMO_SOURCE = { owner: 'sayurihanki', repo: 'aistore' };

function patch(id: string, target: string, precondition: string): CodePatch {
    // The replacement must not contain the precondition, as a real ledger's does not:
    // otherwise "already present" could never be told apart from "fits".
    return { id, target, description: id, precondition, replacement: `${precondition.toLowerCase()}-fixed` };
}

/** One file per fix; each precondition appears once, so every fix fits unless a test changes the file. */
const LEDGER: CodePatch[] = [
    patch('product-link-sku-encoding', 'scripts/commerce.js', 'A1'),
    patch('product-link-sku-slash-encoding', 'scripts/commerce.js', 'A2'),
    patch('product-teaser-sku-encoding', 'blocks/product-teaser/product-teaser.js', 'T1'),
    patch('pdp-empty-data-redirect', 'blocks/product-details/product-details.js', 'P1'),
    patch('aem-assets-sku-sanitization', 'scripts/initializers/assets.js', 'S1'),
    patch('header-nav-tools-defensive', 'blocks/header/header.js', 'H1'),
    patch('commerce-account-sidebar-selector-race', 'blocks/commerce-account-sidebar/commerce-account-sidebar.js', 'R1'),
];

function repoFiles(overrides: Record<string, string> = {}): Record<string, string> {
    return {
        'scripts/commerce.js': 'A1 A2',
        'blocks/product-teaser/product-teaser.js': 'T1',
        'blocks/product-details/product-details.js': 'P1',
        'scripts/initializers/assets.js': 'S1',
        'blocks/header/header.js': 'H1',
        'blocks/commerce-account-sidebar/commerce-account-sidebar.js': 'R1',
        ...overrides,
    };
}

function deps(files: Record<string, string> = repoFiles()) {
    return {
        fileOps: {
            getFileContent: jest.fn(async (_o: string, _r: string, path: string) =>
                files[path] === undefined ? null : { content: files[path], sha: 's', path, encoding: 'utf-8' },
            ),
            commitTreeToBranch: jest.fn(async () => 'c0ffee1'),
        },
        logger: createMockLogger(),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockLedger.mockResolvedValue(LEDGER);
});

describe('a saved package (builtWith) — applied where it fits', () => {
    const savedPackage = makeAddedDemo({
        source: DEMO_SOURCE,
        builtWith: {
            template: B2B,
            codePatchSource: SAVED_LEDGER,
            codePatches: ['header-nav-tools-defensive', 'pdp-empty-data-redirect'],
            extension: '1.0.0-beta.150',
        },
    });

    it("applies the package's own ledger to the SC's repository in one commit, and owes no caveat for what it fixed", async () => {
        const d = deps();

        const report = await runDemoFixPass(savedPackage, OWN, DEMO_SOURCE, d);

        expect(mockLedger).toHaveBeenCalledWith(SAVED_LEDGER, 'code-patches.json', d.logger);
        expect(d.fileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        expect(d.fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'steve',
            'aistore-copy',
            'main',
            expect.any(Array),
            'Demo Builder: 2 fixes\n\nheader-nav-tools-defensive\npdp-empty-data-redirect',
        );
        expect(report).toEqual({ by: 'built-with', applied: ['header-nav-tools-defensive', 'pdp-empty-data-redirect'], caveats: [] });
        expect(mockDryCheck).not.toHaveBeenCalled();
    });

    it('applies nothing to code that was edited by hand, and says what that costs', async () => {
        const d = deps(repoFiles({ 'blocks/product-details/product-details.js': 'edited by the SC' }));

        const report = await runDemoFixPass(savedPackage, OWN, DEMO_SOURCE, d);

        expect(report.applied).toEqual(['header-nav-tools-defensive']);
        expect(report.caveats).toEqual([CONSEQUENCE_CAVEATS['empty-product-page']]);
    });

    it('is not trusted when the recorded template is not one of ours', async () => {
        const stranger = makeAddedDemo({
            source: DEMO_SOURCE,
            builtWith: { template: { owner: 'jen', repo: 'fork' }, codePatchSource: SAVED_LEDGER, codePatches: ['pdp-empty-data-redirect'], extension: 'x' },
        });
        mockDryCheck.mockResolvedValue([]);
        const d = deps();

        const report = await runDemoFixPass(stranger, OWN, DEMO_SOURCE, d);

        expect(d.fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(report).not.toHaveProperty('applied');
        expect(mockDryCheck).toHaveBeenCalled();
    });
});

describe("a colleague's storefront with our lineage — offered, opt-in", () => {
    const colleague = makeAddedDemo({ source: DEMO_SOURCE, lineage: { templateRepository: B2B } });

    it('offers the fits from the shipped ledger, writes nothing, and keeps the caveats', async () => {
        const d = deps(repoFiles({ 'blocks/product-teaser/product-teaser.js': 'diverged' }));

        const report = await runDemoFixPass(colleague, OWN, DEMO_SOURCE, d);

        expect(mockLedger).toHaveBeenCalledWith(resolveDryCheckSource(), 'code-patches.json', d.logger);
        expect(d.fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(report.by).toBe('template');
        expect(report.offered).toEqual([
            'product-link-sku-encoding',
            'product-link-sku-slash-encoding',
            'pdp-empty-data-redirect',
            'aem-assets-sku-sanitization',
            'header-nav-tools-defensive',
            'commerce-account-sidebar-selector-race',
        ]);
        // Every load-bearing fix not on the code is still a caveat: declining leaves them.
        expect(report.caveats).toEqual([
            CONSEQUENCE_CAVEATS['product-links'],
            CONSEQUENCE_CAVEATS['empty-product-page'],
            CONSEQUENCE_CAVEATS['asset-images'],
        ]);
    });

    it("applies the fits only when the SC accepted, to the SC's repository, and clears the caveats they answer", async () => {
        const d = deps(repoFiles({ 'blocks/product-teaser/product-teaser.js': 'diverged' }));

        const report = await runDemoFixPass(colleague, OWN, DEMO_SOURCE, d, { applyOffered: true });

        expect(d.fileOps.commitTreeToBranch).toHaveBeenCalledWith('steve', 'aistore-copy', 'main', expect.any(Array), expect.stringMatching(/^Demo Builder: 6 fixes\n/));
        expect(report.applied).toHaveLength(6);
        expect(report).not.toHaveProperty('offered');
        // The teaser fix missed: product links stay a caveat; the rest are answered.
        expect(report.caveats).toEqual([CONSEQUENCE_CAVEATS['product-links']]);
    });

    it('never offers when the code already carries every fix', async () => {
        const fixed = Object.fromEntries(Object.entries(repoFiles()).map(([p, t]) => [p, t.replace(/([A-Z]\d)/g, (m) => `${m.toLowerCase()}-fixed`)]));

        const report = await runDemoFixPass(colleague, OWN, DEMO_SOURCE, deps(fixed));

        expect(report).toEqual({ by: 'template', caveats: [] });
    });
});

describe('no lineage — the dry check, as before', () => {
    it("runs only the dry check against the demo's source, and offers nothing", async () => {
        mockDryCheck.mockResolvedValue([{ patchId: 'pdp-empty-data-redirect', target: 'x', applied: false }]);
        const d = deps();

        const report = await runDemoFixPass(makeAddedDemo({ source: DEMO_SOURCE }), OWN, DEMO_SOURCE, d, { applyOffered: true });

        expect(mockDryCheck).toHaveBeenCalledWith(expect.any(Map), 'sayurihanki', 'aistore', expect.any(Array), expect.anything(), d.logger, 'main');
        expect(d.fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(report).toEqual({ caveats: [CONSEQUENCE_CAVEATS['empty-product-page']] });
    });
});

describe('demoFixLines — what the SC reads', () => {
    it('says what was applied, then what may not work, then the offer, by consequence and never by id', () => {
        expect(
            demoFixLines({
                by: 'template',
                applied: ['header-nav-tools-defensive'],
                caveats: [CONSEQUENCE_CAVEATS['asset-images']],
                offered: ['pdp-empty-data-redirect'],
            }),
        ).toEqual([
            'Demo Builder applied 1 fix to this storefront: header and account sidebar robustness.',
            CONSEQUENCE_CAVEATS['asset-images'],
            "1 of Demo Builder's fixes fits this storefront's code: empty product pages. It was not applied. Apply it from the storefront report.",
        ]);
        expect(demoFixLines({ caveats: [] })).toStrictEqual([]);
    });
});
