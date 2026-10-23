/**
 * The storefront report (EDS-13f steps 04 and 07): one computation of where a
 * project's storefront comes from and what Demo Builder wrote into it, read-only;
 * and its rendering in SC words. Demo Builder's fixes left it on 2026-10-23 (EDS-64).
 *
 * GitHub (files, the repository record) and the last-known-good read are the
 * boundaries. The rule under test throughout: a read that FAILED says "could not
 * read", never "not there".
 */

import { COMPONENT_IDS } from '@/core/constants';
import { SMART_404_MARKER_START } from '@/features/eds/services/pdp/pdp404Snippet';
import {
    readStorefrontReport,
    storefrontReportLines,
    storefrontReportView,
    type StorefrontReport,
    type StorefrontReportDeps,
} from '@/features/eds/services/storefront/storefrontReport';
import type { Project } from '@/types/base';
import { makeAddedDemo, makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { STOREFRONT_CHANGES } from '@/features/eds/services/storefront/storefrontChanges';
import { createMockProject } from '../../../../helpers/projectFake';

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const LEDGER_SOURCE = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b', lkgFile: 'b2b/last-known-good' };
const LKG = 'abcdef0123456789abcdef0123456789abcdef01';
const LOAD_BEARING = [
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
                codePatches: [...LOAD_BEARING, 'header-nav-tools-defensive'],
            }),
        },
    }),
];

/** The SC's copy of Jen's storefront. */
const OWN_FILES: Record<string, string | Error> = {
    'package.json': '{"name":"@adobe/aem-boilerplate-commerce","version":"4.0.1"}',
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
        // GitHub has nothing to say about the Adobe base unless a case sets one (EDS-56).
        boilerplateGitHub: {
            repository: jest.fn(async () => undefined),
            firstCommitTree: jest.fn(async () => undefined),
            commitsBefore: jest.fn(async () => undefined),
            topLevel: jest.fn(async () => undefined),
        },
        logger: createMockLogger(),
        packages: CATALOG,
        ...overrides,
    };
}

const NEWEST_CHANGE = STOREFRONT_CHANGES[STOREFRONT_CHANGES.length - 1].since;

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
                // Built after every storefront change unless a test says otherwise: "Needs reset"
                // has its own tests at the end.
                metadata: { githubRepo: 'steve/aistore-copy', daLiveOrg: 'steve', storefrontBuiltThrough: NEWEST_CHANGE, ...metadata },
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
});

describe('readStorefrontReport — a colleague’s storefront', () => {
    it('reads the boilerplate, the current one at the last-known-good, the lineage and what was written', async () => {
        const report = await read(COLLEAGUE, deps());

        expect(report).toEqual({
            repository: { owner: 'steve', repo: 'aistore-copy' },
            boilerplate: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' } },
            current: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' } },
            origin: { kind: 'added', lineage: { status: 'read', value: { templateRepository: B2B } }, match: { by: 'template', template: B2B } },
            written: { smart404: 'present', fstab: 'present', config: 'present', description: 'absent' },
            contentSite: { org: 'steve', site: 'aistore-copy' },
            adobe: { reason: 'GitHub could not be read for sayurihanki/aistore' },
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
        expect(report.origin).toEqual({ kind: 'added', lineage: { status: 'unreadable', reason: 'rate limited' } });
        expect(report.written.smart404).toBe('unreadable');
        // Not knowing which template it came from, there is nothing of ours to compare it with.
        expect(report).not.toHaveProperty('current');
    });

    it("says it could not read Demo Builder's current boilerplate when the tested commit cannot be read", async () => {
        const report = await read(COLLEAGUE, deps(OWN_FILES, { readLkg: jest.fn(async () => undefined) }));

        expect(report.current).toEqual({ status: 'unreadable', reason: 'The last-known-good commit could not be read' });
    });
});

describe('readStorefrontReport — a shipped brand', () => {
    it('is our own template, pinned at the commit it was built from', async () => {
        const shipped = project(
            { selectedPackage: 'bodea' },
            { lastSyncedCommit: LKG, lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' } },
        );

        const report = await read(shipped, deps());

        expect(report.origin).toEqual({ kind: 'shipped', package: 'bodea', template: B2B, pin: LKG });
        expect(report.current).toEqual({ status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' } });
    });
});

describe('storefrontReportLines — the SC-facing rendering', () => {
    it('says where it comes from and what Demo Builder wrote, and lists no fixes', async () => {
        const lines = storefrontReportLines(await read(COLLEAGUE, deps()));

        expect(lines).toEqual([
            '## Where this storefront comes from',
            "Built on Adobe's Commerce boilerplate 4.0.1. Demo Builder's current one is 6.0.0. " +
                'Built on an older boilerplate (4.x) than Demo Builder tests on.',
            "GitHub records it as made from adobe-commerce/boilerplate-b2b-template, one of Demo Builder's templates.",
            'Adobe boilerplate updates: not offered, because GitHub could not be read for sayurihanki/aistore.',
            '## What Demo Builder wrote',
            'Product-page fallback (smart 404): there.',
            'Content mount (fstab.yaml): there.',
            'Store settings (config.json): there.',
            'Demo package description: not there.',
        ]);
    });

    // EDS-56: an added demo whose Adobe starting point is known follows our tested version too.
    it.each([
        [LKG, "That is Demo Builder's tested version."],
        ['71a67e027b4b288a67f5cda1fc106d2df9a34805', "Demo Builder's tested version is abcdef0; Check for Updates offers it."],
    ])('says where its Adobe code started and how it stands against the tested version (%s)', async (base, ending) => {
        const known = project(
            { demo: makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' } }) },
            { boilerplateBase: { template: B2B, commit: base, lkgSource: LEDGER_SOURCE, found: 'first-commit' } },
        );

        const lines = storefrontReportLines(await read(known, deps()));

        expect(lines).toContain(
            `Adobe boilerplate: started at adobe-commerce/boilerplate-b2b-template ${base.slice(0, 7)} (matched by its first commit). ${ending}`,
        );
    });

    it('warns only below the floor: a storefront on the current boilerplate gets no warning (step 05)', async () => {
        const current = { ...OWN_FILES, 'package.json': TEMPLATE_PACKAGE };

        const lines = storefrontReportLines(await read(COLLEAGUE, deps(current)));

        expect(lines[1]).toBe("Built on Adobe's Commerce boilerplate 6.0.0. Demo Builder's current one is 6.0.0.");
    });

    it('warns even when the current boilerplate could not be read: the floor is a constant, not a read', async () => {
        const lines = storefrontReportLines(await read(COLLEAGUE, deps(OWN_FILES, { readLkg: jest.fn(async () => undefined) })));

        expect(lines[1]).toBe(
            "Built on Adobe's Commerce boilerplate 4.0.1. Built on an older boilerplate (4.x) than Demo Builder tests on.",
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

// The "Needs reset" status (storefrontChanges.ts): read from the project's record, no GitHub read.
describe('needs reset — a storefront behind how Demo Builder builds storefronts now', () => {
    const OLD = project({}, { storefrontBuiltThrough: '2026-01-01' });
    const CURRENT = project({ created: new Date('2026-01-01T00:00:00Z') }, { storefrontBuiltThrough: NEWEST_CHANGE });

    it('says so first, in the status words, with no date', async () => {
        const report = await read(OLD, deps());

        expect(report.needsReset).toBe(true);
        expect(storefrontReportLines(report)[0]).toBe(
            'Needs reset: This storefront is behind how Demo Builder builds storefronts now. ' +
                'Reset it to bring it up to date.',
        );
    });

    it('says nothing about it for a storefront built after every change', async () => {
        const report = await read(CURRENT, deps());

        expect(report).not.toHaveProperty('needsReset');
        expect(storefrontReportLines(report).join('\n')).not.toMatch(/Needs reset/);
    });
});

// The dashboard's window (EDS-64): the same sentences as the markdown, shaped for it.
describe('storefrontReportView — what the dashboard window shows', () => {
    it('puts the broken links first, each page linked to its DA.live editor', async () => {
        const view = storefrontReportView(await read(project({}, { brokenLinks: [{ link: '/fr', pages: ['/footer'] }] }), deps()));

        expect(view.brokenLinks).toStrictEqual([
            { link: '/fr', pages: [{ path: '/footer', editUrl: 'https://da.live/edit#/steve/aistore-copy/footer' }] },
        ]);
        expect(view).not.toHaveProperty('needsReset');
    });

    it('says where the storefront comes from in the same words as the markdown, the files folded away', async () => {
        const report = await read(COLLEAGUE, deps());
        const lines = storefrontReportLines(report);

        const view = storefrontReportView(report);

        expect(view.about).toStrictEqual([
            { label: 'Comes from', text: lines[2] },
            { label: 'Built on', text: lines[1] },
        ]);
        expect(view.details).toContain('Product-page fallback (smart 404): there.');
        expect(view.brokenLinks).toStrictEqual([]);
    });

    it('leads with the reset line when the storefront is behind', async () => {
        const behind = project({}, { storefrontBuiltThrough: '2026-01-01' });

        expect(storefrontReportView(await read(behind, deps())).needsReset).toBe(
            'This storefront is behind how Demo Builder builds storefronts now. Reset it to bring it up to date.',
        );
    });
});
