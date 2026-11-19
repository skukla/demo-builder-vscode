/**
 * Storefront setup for a project imported from a demo bundle (EDS-72): the bundle is read from
 * the path the import held, the brand's own code and content settings give way to the bundle's,
 * and phase 1 makes the project's OWN repository from the files (no template, no template flag),
 * recording the pushed commit for Reset. GitHub is the boundary: the repository calls are fakes,
 * and the bundle is a real zip on disk read by the real reader.
 */

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    executePhaseBundleRepo,
    readSetupBundle,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupBundle';
import type {
    RepoInfo,
    SetupServices,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { StorefrontSetupStartPayload } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';

type EdsConfig = StorefrontSetupStartPayload['edsConfig'];

const DESCRIPTION = JSON.stringify({
    kind: 'demo',
    version: 2,
    name: 'Bodea',
    contentSource: { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' },
});

/** A bundle as Export writes it: setup file plus the storefront under `storefront/`. */
function bundleOnDisk(
    storefront: Record<string, string> = {
        'scripts/scripts.js': 'export {};',
        '404.html': '<html>',
        'head.html': '<meta>',
        'demo.demo-builder.json': DESCRIPTION,
    }
): string {
    const zip = new AdmZip();
    for (const [name, text] of Object.entries(storefront)) {
        zip.addFile(`bodea-demo-bundle/storefront/${name}`, Buffer.from(text, 'utf-8'));
    }
    const file = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-setup-')),
        'bodea-demo-bundle.zip'
    );
    zip.writeZip(file);
    return file;
}

/** What the wizard sends for a brand project: the brand's template, patches and pages. */
function brandConfig(overrides: Partial<EdsConfig> = {}): EdsConfig {
    return {
        repoName: 'my-bodea',
        repoMode: 'new',
        daLiveOrg: 'acme',
        daLiveSite: 'my-bodea',
        githubOwner: 'acme',
        templateOwner: 'demo-system-stores',
        templateRepo: 'accs-bodea',
        contentSource: { org: 'brand-org', site: 'brand-site', indexPath: '/full-index.json' },
        accountContentSource: { org: 'b2b', site: 'account' },
        codePatches: ['sku-encoding'],
        codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'patches' },
        contentPatches: ['x'],
        contentPatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'content' },
        patches: ['y'],
        brandAssets: { source: { owner: 'skukla', repo: 'brand', branch: 'main' }, files: [] },
        ...overrides,
    };
}

describe('readSetupBundle', () => {
    it('leaves a brand project exactly as it came', async () => {
        const config = brandConfig();
        expect(await readSetupBundle(config, createMockLogger())).toStrictEqual({
            edsConfig: config,
        });
    });

    it("reads the bundle, takes its content site, and drops the brand's patches, assets and account pages", async () => {
        const bundlePath = bundleOnDisk();

        const read = await readSetupBundle(
            brandConfig({ bundleSource: { bundlePath } }),
            createMockLogger()
        );

        if ('error' in read) throw new Error(read.error);
        expect(read.bundle?.files.has('head.html')).toBe(true);
        expect(read.bundle?.contentSource).toStrictEqual({
            org: 'sender',
            site: 'kukla-bodea',
            indexPath: '/query-index.json',
        });
        expect(read.edsConfig.contentSource).toStrictEqual({
            org: 'sender',
            site: 'kukla-bodea',
            indexPath: '/query-index.json',
        });
        for (const field of [
            'codePatches',
            'codePatchSource',
            'contentPatches',
            'contentPatchSource',
            'patches',
            'brandAssets',
            'accountContentSource',
        ]) {
            expect(read.edsConfig).not.toHaveProperty(field);
        }
        // The brand's template stays: the project is recorded as a brand project (decision 3).
        expect(read.edsConfig.templateOwner).toBe('demo-system-stores');
    });

    // F252: the sender's storefront was built on an older template commit than today's. Updates
    // must count from THAT commit, or every Adobe change made in between is never offered.
    const SENDER_BASE = 'c'.repeat(40);
    /** A storefront bundle whose description file records `builtWith`. */
    const bundleBuiltWith = (builtWith: Record<string, unknown>): string =>
        bundleOnDisk({
            'scripts/scripts.js': 'export {};',
            '404.html': '<html>',
            'head.html': '<meta>',
            'demo.demo-builder.json': JSON.stringify({ ...JSON.parse(DESCRIPTION), builtWith }),
        });

    it('reads the template commit the sender was built on, from the description file', async () => {
        const bundlePath = bundleBuiltWith({
            template: { owner: 'demo-system-stores', repo: 'accs-bodea' },
            lkg: SENDER_BASE,
            extension: '1.0.0',
        });

        const read = await readSetupBundle(brandConfig({ bundleSource: { bundlePath } }), createMockLogger());

        if ('error' in read) throw new Error(read.error);
        expect(read.bundle?.templateBase).toBe(SENDER_BASE);
    });

    it.each([
        ['names no base (an older sender)', { extension: '1.0.0' }],
        ['names a base that is not a commit', { lkg: 'main', extension: '1.0.0' }],
        [
            'names a base on another template',
            { template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' }, lkg: SENDER_BASE, extension: '1.0.0' },
        ],
    ])('takes no base when the description %s, so updates count from the import', async (_label, builtWith) => {
        const logger = createMockLogger();
        const bundlePath = bundleBuiltWith(builtWith);

        const read = await readSetupBundle(brandConfig({ bundleSource: { bundlePath } }), logger);

        if ('error' in read) throw new Error(read.error);
        // The outcome is the missing base; which line the log prints is not behaviour (the
        // repo's no-logger-wording rule), so only the absence is asserted.
        expect(read.bundle).not.toHaveProperty('templateBase');
    });

    // F255: a thin-layer storefront also tracks the patches release it was built from. The
    // import records the sender's, so every release published since the sender's build is offered.
    const LEDGER = { owner: 'skukla', repo: 'eds-demo-patches', path: 'patches' };

    it('reads the patches release the sender was built from, when it is on the same ledger', async () => {
        const bundlePath = bundleBuiltWith({ codePatchSource: LEDGER, patchesRelease: 'v1.1.5', extension: '1.0.0' });

        const read = await readSetupBundle(brandConfig({ bundleSource: { bundlePath } }), createMockLogger());

        if ('error' in read) throw new Error(read.error);
        expect(read.bundle?.patchesRelease).toBe('v1.1.5');
    });

    it.each([
        ['names no release (an older sender)', { codePatchSource: LEDGER, extension: '1.0.0' }],
        ['names a release that is not a version', { codePatchSource: LEDGER, patchesRelease: 'latest', extension: '1.0.0' }],
        [
            'names a release of another ledger',
            { codePatchSource: { ...LEDGER, repo: 'other-patches' }, patchesRelease: 'v1.1.5', extension: '1.0.0' },
        ],
    ])('takes no release when the description %s, so creation reads today\'s', async (_label, builtWith) => {
        const bundlePath = bundleBuiltWith(builtWith);

        const read = await readSetupBundle(brandConfig({ bundleSource: { bundlePath } }), createMockLogger());

        if ('error' in read) throw new Error(read.error);
        expect(read.bundle).not.toHaveProperty('patchesRelease');
    });

    it('takes no release for a project with no patches ledger', async () => {
        const bundlePath = bundleBuiltWith({ codePatchSource: LEDGER, patchesRelease: 'v1.1.5', extension: '1.0.0' });

        const read = await readSetupBundle(
            brandConfig({ bundleSource: { bundlePath }, codePatchSource: undefined }),
            createMockLogger(),
        );

        if ('error' in read) throw new Error(read.error);
        expect(read.bundle).not.toHaveProperty('patchesRelease');
    });

    it('refuses in words when the file is gone or holds no storefront', async () => {
        const gone = await readSetupBundle(
            brandConfig({ bundleSource: { bundlePath: '/nowhere/x.zip' } }),
            createMockLogger()
        );
        expect(gone).toMatchObject({
            error: expect.stringMatching(/^The imported demo's file could not be read: /),
        });

        const notes = await readSetupBundle(
            brandConfig({ bundleSource: { bundlePath: bundleOnDisk({ 'README.md': 'hi' }) } }),
            createMockLogger()
        );
        expect(notes).toStrictEqual({ error: "The imported demo's file holds no storefront." });
    });
});

describe('executePhaseBundleRepo', () => {
    function fakes() {
        const repoLifecycle = {
            createEmptyRepository: jest
                .fn()
                .mockResolvedValue({
                    fullName: 'acme/my-bodea',
                    name: 'my-bodea',
                    defaultBranch: 'main',
                }),
            waitForContent: jest.fn().mockResolvedValue(true),
            setTemplateFlag: jest.fn().mockResolvedValue(undefined),
        };
        const treeCommits = {
            getBranchInfo: jest.fn().mockResolvedValue({ commitSha: 'head', treeSha: 't0' }),
            createBlob: jest.fn(),
            createTree: jest.fn().mockResolvedValue('tree-1'),
            createCommit: jest.fn().mockResolvedValue('import-commit'),
            updateBranchRef: jest.fn().mockResolvedValue(undefined),
        };
        const services = {
            githubRepoLifecycle: repoLifecycle,
            githubFileOps: { treeCommits },
        } as unknown as SetupServices;
        return { repoLifecycle, treeCommits, services };
    }

    it("creates the project's own repository from the files, in its namespace and unflagged, and records the commit", async () => {
        const { repoLifecycle, services } = fakes();
        const repoInfo: RepoInfo = { repoOwner: 'acme', repoName: 'my-bodea' };
        const bundle = {
            files: new Map([['head.html', Buffer.from('<meta>')]]),
            dropped: 2,
            contentSource: { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' },
        };
        const context = createMockHandlerContext({ logger: createMockLogger() });

        const result = await executePhaseBundleRepo(
            context,
            brandConfig({ isPrivate: true }),
            services,
            repoInfo,
            bundle
        );

        expect(result).toBeNull();
        expect(repoLifecycle.createEmptyRepository).toHaveBeenCalledWith('my-bodea', true, 'acme');
        expect(repoLifecycle.setTemplateFlag).not.toHaveBeenCalled();
        expect(repoInfo).toStrictEqual({
            repoOwner: 'acme',
            repoName: 'my-bodea',
            repoUrl: 'https://github.com/acme/my-bodea',
            bundleImport: { commit: 'import-commit', contentSource: bundle.contentSource },
        });
    });

    it("carries the sender's template commit into what setup reports, for creation to record", async () => {
        const { services } = fakes();
        const repoInfo: RepoInfo = { repoOwner: 'acme', repoName: 'my-bodea' };
        const context = createMockHandlerContext({ logger: createMockLogger() });

        await executePhaseBundleRepo(context, brandConfig(), services, repoInfo, {
            files: new Map([['head.html', Buffer.from('<meta>')]]),
            dropped: 0,
            templateBase: 'c'.repeat(40),
        });

        expect(repoInfo.bundleImport).toStrictEqual({ commit: 'import-commit', templateBase: 'c'.repeat(40) });
        const lines = (context.sendMessage as jest.Mock).mock.calls.map(
            ([, payload]) => payload.message
        );
        // The ready push carries no words: line 2 keeps what it said.
        expect(lines[lines.length - 1]).toBeUndefined();
    });

    it("carries the sender's patches release into what setup reports, for creation to record", async () => {
        const { services } = fakes();
        const repoInfo: RepoInfo = { repoOwner: 'acme', repoName: 'my-bodea' };
        const context = createMockHandlerContext({ logger: createMockLogger() });

        await executePhaseBundleRepo(context, brandConfig(), services, repoInfo, {
            files: new Map([['head.html', Buffer.from('<meta>')]]),
            dropped: 0,
            patchesRelease: 'v1.1.5',
        });

        expect(repoInfo.bundleImport).toStrictEqual({ commit: 'import-commit', patchesRelease: 'v1.1.5' });
    });

    it('refuses an existing or already-created repository: an imported project makes its own', async () => {
        const { repoLifecycle, services } = fakes();
        const context = createMockHandlerContext({ logger: createMockLogger() });
        const bundle = { files: new Map(), dropped: 0 };

        await expect(
            executePhaseBundleRepo(
                context,
                brandConfig({ repoMode: 'existing', existingRepo: 'acme/old' }),
                services,
                { repoOwner: 'acme', repoName: 'old' },
                bundle
            )
        ).rejects.toThrow(
            'An imported project makes its own new repository. Choose a new repository name.'
        );
        expect(repoLifecycle.createEmptyRepository).not.toHaveBeenCalled();
    });
});
