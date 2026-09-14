/**
 * "Save as demo package": the preview read, the save (through the ownership
 * rule, plus the card on the SC's own list), and the removal (which undoes only
 * what we did). The GitHub services, the added-demo setting and the datapack
 * service are the boundaries; everything else is real.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    EDS_ONLY,
    handleGetDemoPackagePreview,
    handleRemoveDemoPackage,
    handleSaveDemoPackage,
} from '@/features/dashboard/handlers/demoPackageHandlers';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { forgetAddedDemo, readAddedDemos, rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import type { DemoPackagePreview, RemoveDemoPackageResult, SaveDemoPackageResult } from '@/types/webviewRequests';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({ getGitHubServices: jest.fn() }));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    readAddedDemos: jest.fn(),
    rememberAddedDemo: jest.fn(),
    forgetAddedDemo: jest.fn(),
}));

const mockGitHub = getGitHubServices as jest.Mock;
const mockAccess = resolveDataInstallerAccess as jest.Mock;
const mockList = readAddedDemos as jest.Mock;
const mockRemember = rememberAddedDemo as jest.Mock;
const mockForget = forgetAddedDemo as jest.Mock;

const fileOperations = {
    getFileContent: jest.fn(),
    createOrUpdateFile: jest.fn(),
    deleteFile: jest.fn(),
};
const repoOperations = {
    getRepository: jest.fn(),
    setTemplateFlag: jest.fn(),
};

const OWN_CARD = makeAddedDemo({ name: 'Bodea', source: { owner: 'steve', repo: 'kukla-bodea', branch: 'main' } });

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'kukla-bodea',
        selectedPackage: 'bodea',
        selectedStack: 'eds-accs',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                // As a real project file carries it: repository and DA.live org, no site.
                metadata: { githubRepo: 'steve/kukla-bodea', daLiveOrg: 'skukla' },
            },
        },
        ...overrides,
    });
}

function contextFor(project: Project | null) {
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const context = createMockHandlerContext();
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    (context.stateManager.saveProject as jest.Mock).mockImplementation(saveProject);
    return { context, saveProject };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGitHub.mockReturnValue({ fileOperations, repoOperations });
    mockAccess.mockResolvedValue({ ok: false });
    mockList.mockReturnValue([]);
    mockRemember.mockResolvedValue([]);
    mockForget.mockResolvedValue([]);
    fileOperations.getFileContent.mockResolvedValue(null);
    fileOperations.createOrUpdateFile.mockResolvedValue({ sha: 'blob-1', commitSha: 'c1' });
    fileOperations.deleteFile.mockResolvedValue(undefined);
    repoOperations.getRepository.mockResolvedValue({ fullName: 'steve/kukla-bodea', isPrivate: false, defaultBranch: 'main' });
    repoOperations.setTemplateFlag.mockResolvedValue(undefined);
    // The site's index: only /full-index.json answers, with two pages.
    global.fetch = jest.fn(async (url: string | URL | Request) => ({
        ok: String(url).endsWith('/full-index.json'),
        status: 200,
        json: async () => ({ data: [{}, {}] }),
    })) as unknown as typeof fetch;
});

describe('handleGetDemoPackagePreview', () => {
    it('refuses without a project, and refuses a headless project in words the how-to backs', async () => {
        expect(await handleGetDemoPackagePreview(contextFor(null).context)).toMatchObject({ success: false, error: 'No project found' });
        const headless = createMockProject({ selectedStack: 'headless-paas' });
        expect(await handleGetDemoPackagePreview(contextFor(headless).context)).toMatchObject({ success: false, error: EDS_ONLY });
    });

    it('answers the prefilled draft, the checks, the link, and whether the file is ours and the card is on the list', async () => {
        mockList.mockReturnValue([OWN_CARD]);
        const { context } = contextFor(edsProject({ demoPackage: { fileSha: 'blob-0', savedAt: '2026-09-12T00:00:00.000Z' } }));
        const result = await handleGetDemoPackagePreview(context);
        expect(result.success).toBe(true);
        const preview = result.data as DemoPackagePreview;
        expect(preview).toMatchObject({
            link: 'https://github.com/steve/kukla-bodea',
            saved: true,
            onList: true,
        });
        expect(preview.draft.name).toBe('Bodea');
        expect(preview.checks.map((c) => [c.id, c.ok])).toEqual([['repository', true], ['index', true]]);
        // No datapack on this project, so the datapack service is never asked.
        expect(mockAccess).not.toHaveBeenCalled();
    });

    it('confirms the datapack when the service can be asked, without a panel', async () => {
        mockAccess.mockResolvedValue({
            ok: true,
            client: { findDatapacks: jest.fn().mockResolvedValue({ items: [{ id: { name: 'bodea', version: '1' } }] }) },
        });
        const { context } = contextFor(edsProject({ datapack: { name: 'bodea', version: '1' } }));
        const preview = (await handleGetDemoPackagePreview(context)).data as DemoPackagePreview;
        expect(preview.checks.find((c) => c.id === 'datapack')).toMatchObject({ ok: true });
        expect(preview.onList).toBe(false);
        // Asked with no panel: a preview may never prompt for a sign-in.
        expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({ panel: undefined }));
    });
});

describe('handleSaveDemoPackage', () => {
    it('writes the description file, puts the same card on the list with the default branch, and records the sha', async () => {
        const { context, saveProject } = contextFor(edsProject());
        const result = await handleSaveDemoPackage(context, { name: 'Bodea by Steve', description: 'Data center gear' });

        expect(result.success).toBe(true);
        expect(result.data as SaveDemoPackageResult).toMatchObject({
            link: 'https://github.com/steve/kukla-bodea',
            file: 'written',
            onList: true,
        });
        const [owner, repo, path, content] = fileOperations.createOrUpdateFile.mock.calls[0];
        expect([owner, repo, path]).toEqual(['steve', 'kukla-bodea', 'demo.demo-builder.json']);
        const written = JSON.parse(content as string);
        expect(written).toMatchObject({
            kind: 'demo',
            name: 'Bodea by Steve',
            description: 'Data center gear',
            contentSource: { org: 'skukla', site: 'kukla-bodea', indexPath: '/full-index.json' },
        });
        // The card is the description plus where it lives and what kind it is.
        expect(mockRemember).toHaveBeenCalledWith({
            ...written,
            source: { owner: 'steve', repo: 'kukla-bodea', branch: 'main' },
            storefrontKind: 'eds',
        });
        // Save never touches the repository's settings (the template tick box was
        // removed 2026-09-14: Add a demo package forks, and a template copy loses updates).
        expect(repoOperations.setTemplateFlag).not.toHaveBeenCalled();
        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.demoPackage).toMatchObject({ fileSha: 'blob-1' });
    });

    it('leaves a description file it did not write alone, says so, still puts the card on the list, and records no sha as ours', async () => {
        fileOperations.getFileContent.mockResolvedValue({ content: '{"kind":"demo","name":"hand-written"}', sha: 'theirs' });
        const { context, saveProject } = contextFor(edsProject());
        const result = await handleSaveDemoPackage(context, { name: 'Bodea', description: '' });
        const data = result.data as SaveDemoPackageResult;
        expect(data.file).toBe('skipped');
        expect(data.fileReason).toMatch(/not written by Demo Builder/);
        expect(data.onList).toBe(true);
        expect(fileOperations.createOrUpdateFile).not.toHaveBeenCalled();
        expect(mockRemember).toHaveBeenCalledTimes(1);
        expect((saveProject.mock.calls[0][0] as Project).demoPackage).toMatchObject({ fileSha: '' });
        expect(context.logger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('handleRemoveDemoPackage', () => {
    it('removes the file we wrote, takes the card off the list, and forgets the record', async () => {
        fileOperations.getFileContent.mockResolvedValue({ content: '{}', sha: 'blob-1' });
        mockList.mockReturnValue([OWN_CARD]);
        const { context, saveProject } = contextFor(edsProject({ demoPackage: { fileSha: 'blob-1', savedAt: 'x' } }));
        const result = await handleRemoveDemoPackage(context);
        expect(result.data as RemoveDemoPackageResult).toEqual({ file: 'removed', removedFromList: true });
        expect(fileOperations.deleteFile).toHaveBeenCalledWith('steve', 'kukla-bodea', 'demo.demo-builder.json', expect.any(String), 'blob-1');
        expect(mockForget).toHaveBeenCalledWith(expect.objectContaining({ owner: 'steve', repo: 'kukla-bodea' }));
        expect(repoOperations.setTemplateFlag).not.toHaveBeenCalled();
        expect((saveProject.mock.calls[0][0] as Project).demoPackage).toBeUndefined();
    });

    it('leaves a file that is not ours and a card that is not there, and still clears the record', async () => {
        fileOperations.getFileContent.mockResolvedValue({ content: '{}', sha: 'theirs' });
        const { context } = contextFor(edsProject({ demoPackage: { fileSha: 'blob-1', savedAt: 'x' } }));
        const result = await handleRemoveDemoPackage(context);
        expect(result.data as RemoveDemoPackageResult).toEqual({ file: 'skipped', removedFromList: false });
        expect(fileOperations.deleteFile).not.toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
        expect(repoOperations.setTemplateFlag).not.toHaveBeenCalled();
        expect(context.logger.warn).toHaveBeenCalledTimes(1);
    });
});
