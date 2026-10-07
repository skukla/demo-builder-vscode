/**
 * The storefront report (EDS-13f steps 04 and 07): one computation of where a
 * project's storefront comes from, what Demo Builder wrote into it, and each of
 * Demo Builder's fixes, read-only; and its rendering in SC words.
 *
 * GitHub (files, the repository record), the last-known-good read and the
 * ledger fetch are the boundaries. The rule under test throughout: a read that
 * FAILED says "could not read", never "not there".
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import { fetchExternalPatches } from '@/features/eds/services/patches/externalPatchFetcher';
import { SMART_404_MARKER_START } from '@/features/eds/services/pdp/pdp404Snippet';
import {
    readStorefrontReport,
    storefrontReportLines,
    type StorefrontReport,
    type StorefrontReportDeps,
} from '@/features/eds/services/storefront/storefrontReport';
import type { Project } from '@/types/base';
import { makeAddedDemo, makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

jest.mock('@/features/eds/services/patches/externalPatchFetcher', () => ({ fetchExternalPatches: jest.fn() }));
const mockLedger = fetchExternalPatches as jest.Mock;

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const LEDGER_SOURCE = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b', lkgFile: 'b2b/last-known-good' };
const LKG = 'abcdef0123456789abcdef0123456789abcdef01';
const LOAD_BEARING = [
    'product-link-sku-encoding',
    'product-link-sku-slash-encoding',
    'product-teaser-sku-encoding',
    'pdp-empty-data-redirect',
    'aem-assets-sku-sanitization',
];
const CATALOG = [
    makeDemoPackage({
        id: 'bodea',
        name: 'Bodea',
        storefronts: {
            'eds-accs': makeStorefront({
                templateOwner: B2B.owner,
                templateRepo: B2B.repo,
                codePatchSource: LEDGER_SOURCE,
                codePatches: [...LOAD_BEARING, 'header-nav-tools-defensive', 'commerce-account-sidebar-selector-race'],
            }),
        },
    }),
];

function patch(id: string, target: string, token: string): CodePatch {
    return { id, target, description: id, precondition: token, replacement: `${token.toLowerCase()}-fixed` };
}
const LEDGER: CodePatch[] = [
    patch('product-link-sku-encoding', 'scripts/commerce.js', 'A1'),
    patch('product-link-sku-slash-encoding', 'scripts/commerce.js', 'A2'),
    patch('product-teaser-sku-encoding', 'blocks/product-teaser/product-teaser.js', 'T1'),
    patch('pdp-empty-data-redirect', 'blocks/product-details/product-details.js', 'P1'),
    patch('aem-assets-sku-sanitization', 'scripts/initializers/assets.js', 'S1'),
    patch('header-nav-tools-defensive', 'blocks/header/header.js', 'H1'),
    patch('commerce-account-sidebar-selector-race', 'blocks/commerce-account-sidebar/commerce-account-sidebar.js', 'R1'),
];

/** The SC's copy of Jen's storefront: two link fixes and the PDP fix fit, the asset file drifted, the two universal ones already there. */
const OWN_FILES: Record<string, string | Error> = {
    'package.json': '{"name":"@adobe/aem-boilerplate-commerce","version":"4.0.1"}',
    'scripts/commerce.js': 'A1 A2',
    'blocks/product-teaser/product-teaser.js': 'T1',
    'blocks/product-details/product-details.js': 'P1',
    'scripts/initializers/assets.js': 'rewritten by Jen',
    'blocks/header/header.js': 'h1-fixed',
    'blocks/commerce-account-sidebar/commerce-account-sidebar.js': 'r1-fixed',
    'scripts/delayed.js': `${SMART_404_MARKER_START}\n// snippet`,
    'fstab.yaml': 'mountpoints: {}',
    'config.json': '{}',
};
const TEMPLATE_PACKAGE = '{"name":"@adobe/aem-boilerplate-commerce","version":"6.0.0"}';

function deps(own: Record<string, string | Error> = OWN_FILES, overrides: Partial<StorefrontReportDeps> = {}): StorefrontReportDeps {
    return {
        fileOps: {
            getFileContent: jest.fn(async (owner: string, repo: string, path: string, ref?: string) => {
                if (owner === B2B.owner && repo === B2B.repo && path === 'package.json' && ref === LKG) {
                    return { content: TEMPLATE_PACKAGE, sha: 's', path, encoding: 'utf-8' };
                }
                if (owner !== 'steve' || repo !== 'aistore-copy') return null;
                const value = own[path];
                if (value instanceof Error) throw value;
                return value === undefined ? null : { content: value, sha: 's', path, encoding: 'utf-8' };
            }),
        },
        repoOps: {
            getRepository: jest.fn(async () => ({
                id: 1,
                name: 'aistore',
                fullName: 'sayurihanki/aistore',
                htmlUrl: '',
                cloneUrl: '',
                defaultBranch: 'main',
                templateRepository: B2B,
            })),
        },
        readLkg: jest.fn(async () => LKG),
        logger: createMockLogger(),
        packages: CATALOG,
        ...overrides,
    };
}

function project(overrides: Partial<Project> = {}, metadata: Record<string, unknown> = {}): Project {
    return createMockProject({
        name: 'aistore-copy',
        selectedStack: 'eds-accs',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'steve/aistore-copy', daLiveOrg: 'steve', ...metadata },
            },
        },
        ...overrides,
    });
}

const COLLEAGUE = project({ demo: makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' } }) });

/** The report for a project that has a storefront: every project here does. */
async function read(target: Project, d: StorefrontReportDeps): Promise<StorefrontReport> {
    const report = await readStorefrontReport(target, d);
    if (!report) throw new Error('expected a report for a project with a storefront repository');
    return report;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockLedger.mockResolvedValue(LEDGER);
});

describe('readStorefrontReport — a colleague’s storefront', () => {
    it('reads the boilerplate, the current one at the last-known-good, the lineage, what was written and each fix', async () => {
        const report = await read(COLLEAGUE, deps());

        expect(report).toEqual({
            repository: { owner: 'steve', repo: 'aistore-copy' },
            boilerplate: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' } },
            current: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' } },
            origin: { kind: 'added', lineage: { status: 'read', value: { templateRepository: B2B } }, match: { by: 'template', template: B2B } },
            written: { smart404: 'present', fstab: 'present', config: 'present', description: 'absent' },
            fixes: [
                { patchId: 'product-link-sku-encoding', target: 'scripts/commerce.js', state: 'fits' },
                { patchId: 'product-link-sku-slash-encoding', target: 'scripts/commerce.js', state: 'fits' },
                { patchId: 'product-teaser-sku-encoding', target: 'blocks/product-teaser/product-teaser.js', state: 'fits' },
                { patchId: 'pdp-empty-data-redirect', target: 'blocks/product-details/product-details.js', state: 'fits' },
                expect.objectContaining({ patchId: 'aem-assets-sku-sanitization', state: 'missing' }),
                { patchId: 'header-nav-tools-defensive', target: 'blocks/header/header.js', state: 'applied' },
                { patchId: 'commerce-account-sidebar-selector-race', target: 'blocks/commerce-account-sidebar/commerce-account-sidebar.js', state: 'applied' },
            ],
            offer: ['product-link-sku-encoding', 'product-link-sku-slash-encoding', 'product-teaser-sku-encoding', 'pdp-empty-data-redirect'],
            contentSite: { org: 'steve', site: 'aistore-copy' },
        });
    });

    it('reads the lineage of the demo’s SOURCE, not of the SC’s copy, and the current boilerplate at the pin', async () => {
        const d = deps();

        await read(COLLEAGUE, d);

        expect(d.repoOps.getRepository).toHaveBeenCalledWith('sayurihanki', 'aistore');
        expect(d.readLkg).toHaveBeenCalledWith({ owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' });
        expect(d.fileOps.getFileContent).toHaveBeenCalledWith(B2B.owner, B2B.repo, 'package.json', LKG);
    });

    it('says it could not read, never that a thing is not there, when a read fails', async () => {
        const failing = { ...OWN_FILES, 'package.json': new Error('502'), 'scripts/delayed.js': new Error('502') };
        const d = deps(failing, {
            repoOps: { getRepository: jest.fn(async () => { throw new Error('rate limited'); }) },
            readLkg: jest.fn(async () => undefined),
        });

        const report = await read(COLLEAGUE, d);

        expect(report.boilerplate).toEqual({ status: 'unreadable', reason: '502' });
        expect(report.current).toEqual({ status: 'unreadable', reason: 'The last-known-good commit could not be read' });
        expect(report.origin).toEqual({ kind: 'added', lineage: { status: 'unreadable', reason: 'rate limited' } });
        expect(report.written.smart404).toBe('unreadable');
        expect(report).not.toHaveProperty('offer');
    });
});

describe('readStorefrontReport — a shipped brand', () => {
    it('is our own template; its fixes come from its own ledger and are never offered (reset keeps a shipped brand current)', async () => {
        const shipped = project(
            { selectedPackage: 'bodea' },
            { lastSyncedCommit: LKG, lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' } },
        );

        const report = await read(shipped, deps());

        expect(report.origin).toEqual({ kind: 'shipped', package: 'bodea', template: B2B, pin: LKG });
        expect(report.fixes).toHaveLength(7);
        expect(report).not.toHaveProperty('offer');
    });
});

describe('storefrontReportLines — the SC-facing rendering', () => {
    it('says where it comes from, what Demo Builder wrote and the fixes by consequence, never by patch id', async () => {
        const lines = storefrontReportLines(await read(COLLEAGUE, deps()));

        expect(lines).toEqual([
            '## Where this storefront comes from',
            "Built on Adobe's Commerce boilerplate 4.0.1. Demo Builder's current one is 6.0.0. " +
                'Built on an older boilerplate (4.x); some fixes may not fit.',
            "GitHub records it as made from adobe-commerce/boilerplate-b2b-template, one of Demo Builder's templates.",
            '## What Demo Builder wrote',
            'Product-page fallback (smart 404): there.',
            'Content mount (fstab.yaml): there.',
            'Store settings (config.json): there.',
            'Demo package description: not there.',
            "## Demo Builder's fixes",
            'Already on the code: header and account sidebar robustness.',
            'Fit, not applied: product links; empty product pages.',
            "Don't fit this code: AEM Assets images.",
        ]);
        expect(lines.join(' ')).not.toMatch(/sku-encoding|nav-tools|sidebar-selector/);
    });

    it('warns only below the floor: a storefront on the current boilerplate gets no warning (step 05)', async () => {
        const current = { ...OWN_FILES, 'package.json': TEMPLATE_PACKAGE };

        const lines = storefrontReportLines(await read(COLLEAGUE, deps(current)));

        expect(lines[1]).toBe("Built on Adobe's Commerce boilerplate 6.0.0. Demo Builder's current one is 6.0.0.");
    });

    it('warns even when the current boilerplate could not be read: the floor is a constant, not a read', async () => {
        const lines = storefrontReportLines(await read(COLLEAGUE, deps(OWN_FILES, { readLkg: jest.fn(async () => undefined) })));

        expect(lines[1]).toBe(
            "Built on Adobe's Commerce boilerplate 4.0.1. Built on an older boilerplate (4.x); some fixes may not fit.",
        );
    });

    it('says "could not read" where a read failed', async () => {
        const d = deps({ ...OWN_FILES, 'package.json': new Error('502') }, {
            repoOps: { getRepository: jest.fn(async () => { throw new Error('rate limited'); }) },
        });

        const lines = storefrontReportLines(await read(COLLEAGUE, d));

        expect(lines).toContain('Could not read what this storefront is built on.');
        expect(lines).toContain('Could not read where GitHub says this storefront comes from.');
    });

    it('names a shipped brand by its pin', async () => {
        const shipped = project(
            { selectedPackage: 'bodea' },
            { lastSyncedCommit: LKG, lkgSource: { owner: 'skukla', repo: 'eds-demo-patches' } },
        );

        const lines = storefrontReportLines(await read(shipped, deps()));

        expect(lines).toContain("Demo Builder's Bodea storefront, made from adobe-commerce/boilerplate-b2b-template at abcdef0.");
    });
});

describe('broken links — links in the content to pages that do not exist (2026-10-07)', () => {
    const WITH_LINKS = project({}, { brokenLinks: [{ link: '/fr', pages: ['/footer', '/index'] }, { link: '/old', pages: [] }] });

    it('carries the recorded links and the DA.live site they are edited in', async () => {
        const report = await read(WITH_LINKS, deps());

        expect(report.brokenLinks).toStrictEqual([
            { link: '/fr', pages: ['/footer', '/index'] },
            { link: '/old', pages: [] },
        ]);
        expect(report.contentSite).toStrictEqual({ org: 'steve', site: 'aistore-copy' });
    });

    it('lists each with the pages it is on, linked to the DA.live editor', async () => {
        const lines = storefrontReportLines(await read(WITH_LINKS, deps()));
        const start = lines.indexOf("## Links to pages that don't exist");

        expect(start).toBeGreaterThan(-1);
        expect(lines.slice(start + 2)).toStrictEqual([
            '- /fr, on [/footer](https://da.live/edit#/steve/aistore-copy/footer), ' +
                '[/index](https://da.live/edit#/steve/aistore-copy/index)',
            '- /old',
        ]);
    });

    it('has no section at all when there are none', async () => {
        const lines = storefrontReportLines(await read(COLLEAGUE, deps()));

        expect(lines.join('\n')).not.toMatch(/Links to pages/);
    });
});
