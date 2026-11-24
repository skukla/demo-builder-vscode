/**
 * populateEdsMetadata records what the new storefront was built on (EDS-13f
 * step 01): the boilerplate in its own `package.json`, beside the template
 * record the update check already keeps. GitHub is the boundary.
 */

import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { writeBlocksNeedingExamples } from '@/features/eds/services/blockLibrary/examplesNeededRecord';
import { STOREFRONT_CHANGES, storefrontNeedsReset } from '@/features/eds/services/storefront/storefrontChanges';
import { readPatchesRelease } from '@/features/eds/services/patches/lkgReader';
import { resolveTemplateCommitSha } from '@/features/eds/services/templateCommitResolver';
import { populateEdsMetadata } from '@/features/project-creation/handlers/executorEdsPhase';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/eds/handlers/edsServiceCache', () => ({ getGitHubServices: jest.fn() }));
jest.mock('@/features/eds/services/patches/lkgReader', () => ({ readPatchesRelease: jest.fn() }));
jest.mock('@/features/eds/services/templateCommitResolver', () => ({ resolveTemplateCommitSha: jest.fn() }));

const getFileContent = jest.fn();

function project(): Project {
    return createMockProject({
        name: 'p',
        componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS', status: 'ready' } },
    });
}

const CONFIG: ProjectCreationConfig = {
    projectName: 'p',
    edsConfig: {
        repoName: 'bodea-demo',
        repoMode: 'new',
        repoUrl: 'https://github.com/steve/bodea-demo',
        githubOwner: 'steve',
        daLiveOrg: 'steve',
        daLiveSite: 'bodea-demo',
        templateOwner: 'adobe-commerce',
        templateRepo: 'boilerplate-b2b-template',
    },
};

function context() {
    return createMockHandlerContext({
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        stateManager: createMockStateManager(),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (getGitHubServices as jest.Mock).mockReturnValue({ fileOperations: { getFileContent } });
    (resolveTemplateCommitSha as jest.Mock).mockResolvedValue('a'.repeat(40));
});

describe('populateEdsMetadata: the patches release is the storefront\'s version', () => {
    const THIN_LAYER: ProjectCreationConfig = {
        ...CONFIG,
        edsConfig: {
            ...CONFIG.edsConfig!,
            codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b', lkgFile: 'b2b/last-known-good' },
        } as ProjectCreationConfig['edsConfig'],
    };

    it('records the release a thin-layer storefront was built from', async () => {
        getFileContent.mockRejectedValue(new Error('not needed'));
        (readPatchesRelease as jest.Mock).mockResolvedValue('v1.1.5');
        const target = project();

        await populateEdsMetadata(context(), target, THIN_LAYER, true);

        expect(readPatchesRelease).toHaveBeenCalledWith(
            expect.objectContaining({ owner: 'skukla', repo: 'eds-demo-patches' }),
            expect.anything(),
        );
        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({
            patchesRelease: 'v1.1.5',
        });
    });

    // F255: an imported storefront was built from the sender's release, not today's, so every
    // release published since is offered. The import record keeps only the import.
    it("records the sender's release for a storefront imported from a bundle", async () => {
        getFileContent.mockRejectedValue(new Error('not needed'));
        (readPatchesRelease as jest.Mock).mockResolvedValue('v1.2.0');
        const target = project();
        const imported: ProjectCreationConfig = {
            ...THIN_LAYER,
            importedFrom: { bundleName: 'Bodea Summit', bundlePath: '/x/bodea.zip' },
            edsConfig: { ...THIN_LAYER.edsConfig!, bundleImport: { commit: 'import-commit', patchesRelease: 'v1.1.5' } },
        };

        await populateEdsMetadata(context(), target, imported, true);

        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({ patchesRelease: 'v1.1.5' });
        expect(readPatchesRelease).not.toHaveBeenCalled();
        expect(target.importedFrom).toStrictEqual({ bundleName: 'Bodea Summit', commit: 'import-commit' });
    });

    it("CONTROL: an import whose bundle names no release records today's", async () => {
        getFileContent.mockRejectedValue(new Error('not needed'));
        (readPatchesRelease as jest.Mock).mockResolvedValue('v1.2.0');
        const target = project();
        const imported: ProjectCreationConfig = {
            ...THIN_LAYER,
            importedFrom: { bundleName: 'Bodea Summit', bundlePath: '/x/bodea.zip' },
            edsConfig: { ...THIN_LAYER.edsConfig!, bundleImport: { commit: 'import-commit' } },
        };

        await populateEdsMetadata(context(), target, imported, true);

        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({ patchesRelease: 'v1.2.0' });
    });

    it('records none for a storefront that is not thin-layer', async () => {
        getFileContent.mockRejectedValue(new Error('not needed'));
        const target = project();

        await populateEdsMetadata(context(), target, CONFIG, true);

        expect(readPatchesRelease).not.toHaveBeenCalled();
        expect(target.componentInstances?.['eds-storefront']?.metadata).not.toHaveProperty('patchesRelease');
    });
});

describe('populateEdsMetadata — the boilerplate (EDS-13f)', () => {
    it("records the new repository's boilerplate, read from the repository itself", async () => {
        getFileContent.mockResolvedValue({
            content: JSON.stringify({ name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' }),
        });
        const target = project();

        await populateEdsMetadata(context(), target, CONFIG, true);

        expect(getFileContent).toHaveBeenCalledWith('steve', 'bodea-demo', 'package.json', undefined);
        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({
            githubRepo: 'steve/bodea-demo',
            boilerplate: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' },
        });
    });

    it('records no boilerplate when it cannot be read, and still records the rest', async () => {
        getFileContent.mockRejectedValue(new Error('GitHub answered 502'));
        const target = project();

        await populateEdsMetadata(context(), target, CONFIG, true);

        const metadata = target.componentInstances?.['eds-storefront']?.metadata;
        expect(metadata).not.toHaveProperty('boilerplate');
        expect(metadata).toMatchObject({ githubRepo: 'steve/bodea-demo', templateRepo: 'boilerplate-b2b-template' });
    });
});

describe('populateEdsMetadata — broken links found by storefront setup (2026-10-07)', () => {
    beforeEach(() => getFileContent.mockRejectedValue(new Error('not needed here')));

    it('records the links the setup copy found, for the Storefront Report', async () => {
        const target = project();
        const withLinks = {
            ...CONFIG,
            edsConfig: { ...CONFIG.edsConfig!, brokenLinks: [{ link: '/fr', pages: ['/footer'] }] },
        };

        await populateEdsMetadata(context(), target, withLinks, true);

        expect(target.componentInstances?.['eds-storefront']?.metadata?.brokenLinks).toStrictEqual([
            { link: '/fr', pages: ['/footer'] },
        ]);
    });

    it('leaves an existing record alone when setup reported none (an edit copies nothing)', async () => {
        const target = project();
        const instance = target.componentInstances!['eds-storefront'];
        instance.metadata = { ...instance.metadata, brokenLinks: [{ link: '/old', pages: [] }] };

        await populateEdsMetadata(context(), target, CONFIG, true);

        expect(target.componentInstances?.['eds-storefront']?.metadata?.brokenLinks).toStrictEqual([
            { link: '/old', pages: [] },
        ]);
    });
});

// The "Needs reset" status reads this stamp (storefrontChanges.ts). Setup builds the storefront
// before the project exists, so it hands creation whether its build step's fixes all landed.
describe('populateEdsMetadata — the storefront built the way Demo Builder builds them now', () => {
    beforeEach(() => getFileContent.mockRejectedValue(new Error('not needed here')));

    const NEWEST = STOREFRONT_CHANGES[STOREFRONT_CHANGES.length - 1].since;
    const built = (storefrontBuildComplete: boolean): ProjectCreationConfig => ({
        ...CONFIG,
        edsConfig: { ...CONFIG.edsConfig!, storefrontBuildComplete },
    });
    const metadataOf = (target: Project) => target.componentInstances?.['eds-storefront']?.metadata;

    it('stamps a storefront setup built in full, so it shows no "Needs reset"', async () => {
        const target = project();

        await populateEdsMetadata(context(), target, built(true), true);

        expect(metadataOf(target)?.storefrontBuiltThrough).toBe(NEWEST);
        expect(metadataOf(target)).not.toHaveProperty('storefrontBuildIncomplete');
        expect(storefrontNeedsReset(target)).toBe(false);
    });

    it('marks a build whose fixes did not all land, so it shows "Needs reset"', async () => {
        const target = project();

        await populateEdsMetadata(context(), target, built(false), true);

        expect(metadataOf(target)?.storefrontBuildIncomplete).toBe(true);
        expect(storefrontNeedsReset(target)).toBe(true);
    });

    it('stamps nothing when setup did not run (an edit builds nothing)', async () => {
        const target = project();

        await populateEdsMetadata(context(), target, CONFIG, true);

        expect(metadataOf(target)).not.toHaveProperty('storefrontBuiltThrough');
    });
});

// PL-101: the project's Finish Setup steps. A setup that ran replaces the record whole, so a
// clean run leaves no stale step; an edit that ran no setup keeps what the project had.
describe('populateEdsMetadata — the steps setup left to finish', () => {
    beforeEach(() => getFileContent.mockRejectedValue(new Error('not needed here')));

    const ran = (codeNotServed?: string[]): ProjectCreationConfig => ({
        ...CONFIG,
        edsConfig: { ...CONFIG.edsConfig!, storefrontBuildComplete: true, ...(codeNotServed ? { codeNotServed } : {}) },
    });

    it('saves Republish the Code with the files the live site did not serve', async () => {
        const target = project();

        await populateEdsMetadata(context(), target, ran(['scripts/commerce.js']), true);

        expect(target.finishSetup).toStrictEqual({ 'republish-code': { files: ['scripts/commerce.js'] } });
    });

    it('replaces an earlier record when setup ran and the site served everything', async () => {
        const target = project();
        target.finishSetup = { 'republish-code': { files: ['scripts/old.js'], state: 'done' } };

        await populateEdsMetadata(context(), target, ran(), true);

        expect(target).not.toHaveProperty('finishSetup');
    });

    it('CONTROL: keeps the record when setup did not run (an edit builds nothing)', async () => {
        const target = project();
        target.finishSetup = { 'republish-code': { files: ['scripts/old.js'] } };

        await populateEdsMetadata(context(), target, CONFIG, true);

        expect(target.finishSetup).toStrictEqual({ 'republish-code': { files: ['scripts/old.js'] } });
    });
});

// EDS-71 step 4c: the blocks setup's block list left on a placeholder, for the Draft Examples tile.
describe('populateEdsMetadata — the blocks still needing an example', () => {
    beforeEach(() => getFileContent.mockRejectedValue(new Error('not needed here')));

    const withList = (blocksNeedingExamples: string[]): ProjectCreationConfig => ({
        ...CONFIG,
        edsConfig: { ...CONFIG.edsConfig!, blocksNeedingExamples },
    });
    const neededOf = (target: Project): unknown =>
        target.componentInstances?.['eds-storefront']?.metadata?.blocksNeedingExamples;

    it('records the blocks setup left on a placeholder', async () => {
        const target = project();

        await populateEdsMetadata(context(), target, withList(['carousel']), true);

        expect(neededOf(target)).toStrictEqual(['carousel']);
    });

    it('records none when setup left none, and keeps the record when setup did not say', async () => {
        const cleared = project();
        writeBlocksNeedingExamples(cleared, ['tabs']);
        const kept = project();
        writeBlocksNeedingExamples(kept, ['tabs']);

        await populateEdsMetadata(context(), cleared, withList([]), true);
        await populateEdsMetadata(context(), kept, CONFIG, true);

        expect(neededOf(cleared)).toStrictEqual([]);
        expect(neededOf(kept)).toStrictEqual(['tabs']);
    });
});

// EDS-72 decisions 1 and 3: an imported project records the import (commit, sender's repository,
// content site) and is recorded as a project on the brand it was built on, with no `demo` row.
describe('populateEdsMetadata — a project imported from a demo bundle', () => {
    beforeEach(() => getFileContent.mockRejectedValue(new Error('not needed here')));

    const IMPORTED: ProjectCreationConfig = {
        ...CONFIG,
        selectedPackage: 'bodea',
        importedFrom: { bundleName: 'Bodea Summit', bundlePath: '/x/bodea-demo-bundle.zip', sourceRepository: 'sender/kukla-bodea' },
        edsConfig: {
            ...CONFIG.edsConfig!,
            bundleImport: { commit: 'import-commit', contentSource: { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' } },
        },
    };

    it('records the import on the project, without the path on this machine', async () => {
        const target = project();

        await populateEdsMetadata(context(), target, IMPORTED, true);

        expect(target.importedFrom).toStrictEqual({
            bundleName: 'Bodea Summit',
            sourceRepository: 'sender/kukla-bodea',
            commit: 'import-commit',
            contentSource: { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' },
        });
        expect(target.demo).toBeUndefined();
        // Read as a brand project: the brand's template is the update record (decision 3).
        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({ templateRepo: 'boilerplate-b2b-template' });
    });

    // F252: updates count from the template commit the sender's code was built on, not today's.
    it("records the sender's template commit as the version updates count from", async () => {
        const senderBase = 'c'.repeat(40);
        const target = project();
        const withBase: ProjectCreationConfig = {
            ...IMPORTED,
            edsConfig: { ...IMPORTED.edsConfig!, bundleImport: { commit: 'import-commit', templateBase: senderBase } },
        };

        await populateEdsMetadata(context(), target, withBase, true);

        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({
            templateOwner: 'adobe-commerce',
            templateRepo: 'boilerplate-b2b-template',
            lastSyncedCommit: senderBase,
        });
        expect(resolveTemplateCommitSha).not.toHaveBeenCalled();
        // The import record keeps only the import: the base lives where updates read it.
        expect(target.importedFrom).toStrictEqual({
            bundleName: 'Bodea Summit',
            sourceRepository: 'sender/kukla-bodea',
            commit: 'import-commit',
        });
    });

    it("CONTROL: with no sender's commit, records today's template version as before", async () => {
        const target = project();

        await populateEdsMetadata(context(), target, IMPORTED, true);

        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({ lastSyncedCommit: 'a'.repeat(40) });
    });

    it('records nothing when setup made no repository from the bundle, and nothing for other projects', async () => {
        const noCommit = project();
        await populateEdsMetadata(context(), noCommit, { ...IMPORTED, edsConfig: CONFIG.edsConfig }, true);
        expect(noCommit.importedFrom).toBeUndefined();

        const brand = project();
        await populateEdsMetadata(context(), brand, CONFIG, true);
        expect(brand.importedFrom).toBeUndefined();
    });
});
