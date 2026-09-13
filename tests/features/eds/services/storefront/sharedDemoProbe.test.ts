/**
 * Reading a colleague's repository (shareable-demo step 03). Three real
 * repositories stand behind the fixtures (`sharedDemoProbe.fixtures.ts` says
 * which); the fakes hand their files back by path.
 */

import {
    B2B_DROPINS,
    probeSharedDemo,
    type SharedDemoProbeDeps,
} from '@/features/eds/services/storefront/sharedDemoProbe';
import type { SharedDemoProbeResult } from '@/types/webviewRequests';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { assertKind } from '../../../../helpers/resultAssertions';
import {
    B2B_TEMPLATE_DEPENDENCIES,
    B2C_DEPENDENCIES,
    BODEA_CONFIG_JSON,
    BODEA_FSTAB,
    EDS_CANONICAL,
    NEXTJS_DEPENDENCIES,
    REPOS,
    packageJson,
} from './sharedDemoProbe.fixtures';

const logger = createMockLogger();

/** A catalog with no template to recognise, so probes reach the repository. */
const NO_CATALOG: never[] = [];

function assertOutcome<V extends SharedDemoProbeResult['outcome']>(
    value: SharedDemoProbeResult,
    outcome: V,
): asserts value is Extract<SharedDemoProbeResult, { outcome: V }> {
    assertKind(
        { kind: value.outcome } as { kind: SharedDemoProbeResult['outcome'] },
        outcome,
    );
}

interface FakeRepo {
    files: Record<string, string>;
    repo?: keyof typeof REPOS;
    /** Reads of these paths throw, as a network failure would. */
    throwOn?: string[];
    emptyRepo?: boolean;
    /** The published index: `path` limits the answer to one index path (any path answers when absent). */
    index?: { ok: boolean; data?: unknown[]; path?: string };
}

function deps(fake: FakeRepo, packages: readonly ReturnType<typeof makeDemoPackage>[] = NO_CATALOG): SharedDemoProbeDeps {
    const fetchImpl = jest.fn(async (url: string) => {
        const index = fake.index ?? { ok: false };
        const ok = index.ok && (!index.path || url.endsWith(index.path));
        return {
            ok,
            status: ok ? 200 : 404,
            json: async () => ({ data: index.data ?? [] }),
        } as unknown as Response;
    });
    return {
        fileOps: {
            getFileContent: jest.fn(async (_o: string, _r: string, path: string) => {
                if (fake.emptyRepo) throw new Error('This repository is empty.');
                if (fake.throwOn?.includes(path)) throw new Error('network down');
                const content = fake.files[path];
                return content === undefined ? null : { content, sha: 's', path, encoding: 'utf-8' };
            }),
        },
        repoOps: {
            getRepository: jest.fn(async () => {
                if (!fake.repo) throw new Error('Repository not found');
                return REPOS[fake.repo];
            }),
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        packages,
    };
}

function edsFiles(extra: Record<string, string> = {}): Record<string, string> {
    return { ...Object.fromEntries(EDS_CANONICAL.map((f) => [f, '// x'])), ...extra };
}

const BODEA: FakeRepo = {
    repo: 'skukla/kukla-bodea',
    files: edsFiles({
        'fstab.yaml': BODEA_FSTAB,
        'config.json': BODEA_CONFIG_JSON,
        'package.json': packageJson(B2B_TEMPLATE_DEPENDENCIES),
    }),
    index: { ok: true, data: [{ path: '/' }, { path: '/about' }, { path: '/products/default' }] },
};

describe('probeSharedDemo', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reads a Demo Builder-generated EDS storefront: content site, codes, B2B, published pages', async () => {
        const result = await probeSharedDemo(deps(BODEA), 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(result).toEqual({
            outcome: 'read',
            fullName: 'skukla/kukla-bodea',
            defaultBranch: 'main',
            isTemplate: false,
            kind: 'eds',
            // The row always names its index path: recorded from the lookup, here the first path.
            contentSource: { org: 'skukla', site: 'kukla-bodea', indexPath: '/full-index.json' },
            contentPublished: { indexFound: true, pageCount: 3 },
            storeCodes: { websiteCode: 'bodea', storeCode: 'bodea_store', storeViewCode: 'bodea_us' },
            b2b: 'on',
            b2bSource: 'config-json',
            overrides: [],
            warnings: [],
        });
    });

    it('probes the index the pipeline copies from, and only that', async () => {
        const d = deps(BODEA);
        await probeSharedDemo(d, 'skukla', 'kukla-bodea', logger);

        expect(d.fetchImpl).toHaveBeenCalledTimes(1);
        expect(d.fetchImpl).toHaveBeenCalledWith(
            'https://main--kukla-bodea--skukla.aem.live/full-index.json',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it("tries the paths the shipped brands publish under, and records the one that answers on the row's content source", async () => {
        // The real kukla-bodea site (2026-09-12): no full-index.json, a sitemap.json.
        const d = deps({ ...BODEA, index: { ok: true, data: [{}, {}], path: '/sitemap.json' } });
        const result = await probeSharedDemo(d, 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(d.fetchImpl).toHaveBeenCalledTimes(2);
        expect(d.fetchImpl).toHaveBeenLastCalledWith(
            'https://main--kukla-bodea--skukla.aem.live/sitemap.json',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(result.contentSource).toEqual({ org: 'skukla', site: 'kukla-bodea', indexPath: '/sitemap.json' });
        expect(result.contentPublished).toEqual({ indexFound: true, pageCount: 2 });
    });

    it('reads a stated index path as stated, without trying the others', async () => {
        const d = deps({
            ...BODEA,
            files: edsFiles({ 'demo.demo-builder.json': JSON.stringify({ kind: 'demo', version: 1, name: 'B', contentSource: { org: 'skukla', site: 'kukla-bodea', indexPath: '/pages.json' } }) }),
            index: { ok: false },
        });
        const result = await probeSharedDemo(d, 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(d.fetchImpl).toHaveBeenCalledTimes(1);
        expect(d.fetchImpl).toHaveBeenCalledWith(
            'https://main--kukla-bodea--skukla.aem.live/pages.json',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(result.contentPublished).toEqual({ indexFound: false });
    });

    it('reads the B2B boilerplate: no content site, no codes, B2B from its drop-ins, template flag', async () => {
        const template: FakeRepo = {
            repo: 'adobe-commerce/boilerplate-b2b-template',
            files: edsFiles({ 'package.json': packageJson(B2B_TEMPLATE_DEPENDENCIES) }),
        };
        const d = deps(template);

        const result = await probeSharedDemo(d, 'adobe-commerce', 'boilerplate-b2b-template', logger);

        assertOutcome(result, 'read');
        expect(result.kind).toBe('eds');
        expect(result.isTemplate).toBe(true);
        expect(result.contentSource).toBeUndefined();
        expect(result.storeCodes).toBeUndefined();
        expect(result.b2b).toBe('on');
        expect(result.b2bSource).toBe('dependencies');
        expect(result.contentPublished).toEqual({ indexFound: false });
        expect(result.warnings).toEqual([expect.stringMatching(/start empty/)]);
        // No content site means no index to probe.
        expect(d.fetchImpl).not.toHaveBeenCalled();
    });

    it('reads a B2C boilerplate as B2B off, from its dependencies', async () => {
        const b2c: FakeRepo = {
            repo: 'skukla/kukla-bodea',
            files: edsFiles({ 'package.json': packageJson(B2C_DEPENDENCIES) }),
        };
        const result = await probeSharedDemo(deps(b2c), 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(result.b2b).toBe('off');
        expect(result.b2bSource).toBe('dependencies');
    });

    it('is unknown on B2B when neither config.json nor package.json can be read', async () => {
        const bare: FakeRepo = { repo: 'skukla/kukla-bodea', files: edsFiles() };
        const result = await probeSharedDemo(deps(bare), 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(result.b2b).toBe('unknown');
        expect(result.b2bSource).toBeUndefined();
    });

    it('reads a Next.js storefront as headless, with its non-main default branch', async () => {
        const nextjs: FakeRepo = {
            repo: 'skukla/citisignal-nextjs',
            files: { 'package.json': packageJson(NEXTJS_DEPENDENCIES) },
        };
        const result = await probeSharedDemo(deps(nextjs), 'skukla', 'citisignal-nextjs', logger);

        assertOutcome(result, 'read');
        expect(result.kind).toBe('headless');
        expect(result.defaultBranch).toBe('master');
        expect(result.contentPublished).toEqual({ indexFound: false });
        expect(result.missing).toBeUndefined();
    });

    it('names what is missing when a populated repository is neither kind', async () => {
        const other: FakeRepo = {
            repo: 'skukla/kukla-bodea',
            files: { 'head.html': '<x>', 'package.json': packageJson(['react']) },
        };
        const result = await probeSharedDemo(deps(other), 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(result.kind).toBe('not-a-storefront');
        expect(result.missing).toEqual(['scripts/scripts.js', 'scripts/delayed.js']);
    });

    it('says an empty repository is empty', async () => {
        const result = await probeSharedDemo(
            deps({ repo: 'skukla/kukla-bodea', files: {}, emptyRepo: true }),
            'skukla',
            'kukla-bodea',
            logger,
        );

        assertOutcome(result, 'read');
        expect(result.kind).toBe('not-a-storefront');
        expect(result.missing).toEqual(EDS_CANONICAL);
        expect(result.warnings).toEqual(['This repository is empty.']);
    });

    it('is unreadable, not a throw, when the repository cannot be found', async () => {
        const result = await probeSharedDemo(deps({ files: {} }), 'nobody', 'nothing', logger);

        expect(result).toEqual({ outcome: 'unreadable', reason: expect.stringMatching(/couldn't find/) });
    });

    it('names both halves when the site answers but the repository does not', async () => {
        const d = deps({ files: {}, index: { ok: true } });
        const result = await probeSharedDemo(d, 'sayurihanki', 'razer', logger);

        expect(result).toEqual({
            outcome: 'unreadable',
            reason: "The site main--razer--sayurihanki.aem.live is up, but its repository sayurihanki/razer couldn't be found, or you don't have access to it. Ask its owner to make it public or give you access.",
        });
        expect(d.fetchImpl).toHaveBeenCalledWith('https://main--razer--sayurihanki.aem.live/', expect.objectContaining({ method: 'HEAD' }));
    });

    it('is unreadable when a canonical file cannot be read, rather than guessing', async () => {
        const flaky: FakeRepo = {
            repo: 'skukla/kukla-bodea',
            files: edsFiles(),
            throwOn: ['scripts/delayed.js'],
        };
        const result = await probeSharedDemo(deps(flaky), 'skukla', 'kukla-bodea', logger);

        expect(result.outcome).toBe('unreadable');
    });

    it('survives a missing index without throwing', async () => {
        const result = await probeSharedDemo(
            deps({ ...BODEA, index: { ok: false } }),
            'skukla',
            'kukla-bodea',
            logger,
        );

        assertOutcome(result, 'read');
        expect(result.contentPublished).toEqual({ indexFound: false });
    });

    it('lets the description file win, and says what it overrode', async () => {
        const description = JSON.stringify({
            kind: 'demo',
            version: 1,
            name: 'Bodea by Steve',
            configDefaults: { ACCS_WEBSITE_CODE: 'other', ACCS_STORE_CODE: 'other_store' },
            configFlags: { 'commerce-b2b-enabled': false },
            contentSource: { org: 'other-org', site: 'other-site', indexPath: '/sitemap.json' },
        });
        const withFile: FakeRepo = {
            ...BODEA,
            files: { ...BODEA.files, 'demo.demo-builder.json': description },
        };
        const d = deps(withFile);

        const result = await probeSharedDemo(d, 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(result.description?.name).toBe('Bodea by Steve');
        expect(result.contentSource).toEqual({ org: 'other-org', site: 'other-site', indexPath: '/sitemap.json' });
        expect(result.storeCodes).toEqual({ websiteCode: 'other', storeCode: 'other_store', storeViewCode: undefined });
        expect(result.b2b).toBe('off');
        expect(result.b2bSource).toBe('description-file');
        expect(result.overrides).toEqual(['contentSource', 'storeCodes', 'b2b']);
        // The index probe follows the description's content source and index path.
        expect(d.fetchImpl).toHaveBeenCalledWith(
            'https://main--other-site--other-org.aem.live/sitemap.json',
            expect.anything(),
        );
    });

    it('warns on a description file it cannot read, and uses what the repository says', async () => {
        const broken: FakeRepo = {
            ...BODEA,
            files: { ...BODEA.files, 'demo.demo-builder.json': '{not json' },
        };
        const result = await probeSharedDemo(deps(broken), 'skukla', 'kukla-bodea', logger);

        assertOutcome(result, 'read');
        expect(result.description).toBeUndefined();
        expect(result.storeCodes?.websiteCode).toBe('bodea');
        expect(result.overrides).toStrictEqual([]);
        expect(result.warnings).toEqual([expect.stringMatching(/description file couldn't be read/)]);
    });

    it('recognises one of our own templates and reads nothing else (D30)', async () => {
        const catalog = [
            makeDemoPackage({
                id: 'starter',
                storefronts: {
                    'eds-paas': makeStorefront({
                        templateOwner: 'adobe-commerce',
                        templateRepo: 'boilerplate-b2b-template',
                    }),
                },
            }),
        ];
        const d = deps({ files: {} }, catalog);

        const result = await probeSharedDemo(d, 'Adobe-Commerce', 'boilerplate-b2b-template', logger);

        expect(result).toEqual({
            outcome: 'shipped',
            shippedPackageId: 'starter',
            fullName: 'Adobe-Commerce/boilerplate-b2b-template',
        });
        expect(d.repoOps.getRepository).not.toHaveBeenCalled();
        expect(d.fileOps.getFileContent).not.toHaveBeenCalled();
    });

    it('does not recognise a fork of our template as the template', async () => {
        const catalog = [
            makeDemoPackage({
                id: 'starter',
                storefronts: {
                    'eds-paas': makeStorefront({
                        templateOwner: 'adobe-commerce',
                        templateRepo: 'boilerplate-b2b-template',
                    }),
                },
            }),
        ];
        const fork: FakeRepo = { repo: 'skukla/kukla-bodea', files: edsFiles() };

        const result = await probeSharedDemo(deps(fork, catalog), 'skukla', 'kukla-bodea', logger);

        expect(result.outcome).toBe('read');
    });

    it('recognises the shipped Starter template through the bundled catalog by default', async () => {
        const d = deps({ files: {} }, undefined);
        delete (d as { packages?: unknown }).packages;

        const result = await probeSharedDemo(d, 'adobe-commerce', 'boilerplate-b2b-template', logger);

        assertOutcome(result, 'shipped');
        expect(result.shippedPackageId).toBe('starter');
    });

    it('pins the B2B drop-in list to what the boilerplate ships', () => {
        for (const name of B2B_DROPINS) {
            expect(B2B_TEMPLATE_DEPENDENCIES).toContain(name);
            expect(B2C_DEPENDENCIES).not.toContain(name);
        }
    });
});
