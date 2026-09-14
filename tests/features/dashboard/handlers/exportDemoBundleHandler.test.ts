/**
 * Export, "Send a file": the save dialog from the webview, a contained path from
 * an agent, one bundle of the ticked parts written to disk; setup alone stays
 * the plain settings file. The GitHub services and the settings export are the
 * boundaries; the bundle is really written to a temp project.
 */

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import { handleExportDemoBundle, NO_STOREFRONT_TO_BUNDLE, NOTHING_TICKED } from '@/features/dashboard/handlers/exportDemoBundleHandler';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { exportProjectSettings, exportProjectSettingsToFile } from '@/features/projects-dashboard/services/settingsTransferService';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({ getGitHubServices: jest.fn() }));
jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    exportProjectSettings: jest.fn(),
    exportProjectSettingsToFile: jest.fn(),
}));

const mockGitHub = getGitHubServices as jest.Mock;
const mockSave = vscode.window.showSaveDialog as jest.Mock;
const mockSettingsDialog = exportProjectSettings as jest.Mock;
const mockSettingsFile = exportProjectSettingsToFile as jest.Mock;

function archive(): Buffer {
    const zip = new AdmZip();
    zip.addFile('skukla-kukla-bodea-abc/', Buffer.alloc(0));
    zip.addFile('skukla-kukla-bodea-abc/head.html', Buffer.from('<meta>'));
    return zip.toBuffer();
}

const repoOperations = { getRepository: jest.fn() };
const fileOperations = { downloadRepoArchive: jest.fn() };

function edsProject(dir: string, overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'kukla-bodea',
        path: dir,
        selectedPackage: 'bodea',
        selectedStack: 'eds-accs',
        componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'bodea', ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret' } },
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'steve/kukla-bodea', daLiveOrg: 'skukla' },
            },
        },
        ...overrides,
    });
}

function contextFor(project: Project | null, withPanel: boolean) {
    const context = createMockHandlerContext(withPanel ? { panel: createMockWebviewPanel() } : {});
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return context;
}

let dir: string;
beforeEach(() => {
    jest.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-export-'));
    mockGitHub.mockReturnValue({ repoOperations, fileOperations });
    repoOperations.getRepository.mockResolvedValue({ fullName: 'steve/kukla-bodea', defaultBranch: 'main', isPrivate: false });
    fileOperations.downloadRepoArchive.mockResolvedValue(archive());
    mockSettingsDialog.mockResolvedValue({ success: true, data: { path: '/picked/kukla-bodea.demo-builder.json' } });
    mockSettingsFile.mockResolvedValue({ path: '/p/kukla-bodea.demo-builder.json', includesSecrets: false, verify: 'x' });
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
});

describe('handleExportDemoBundle', () => {
    it('refuses without a project, with nothing ticked, and refuses the storefront part for a headless project', async () => {
        expect(await handleExportDemoBundle(contextFor(null, true), undefined)).toMatchObject({ success: false, error: 'No project found' });
        expect(await handleExportDemoBundle(contextFor(edsProject(dir), true), { setup: false, storefront: false })).toMatchObject({ success: false, error: NOTHING_TICKED });
        const headless = createMockProject({ selectedStack: 'headless-paas', path: dir });
        expect(await handleExportDemoBundle(contextFor(headless, true), { storefront: true })).toMatchObject({ success: false, error: NO_STOREFRONT_TO_BUNDLE });
    });

    it('with setup alone hands over to the settings export: the save dialog from the webview, a credential-free file for an agent', async () => {
        const fromDialog = await handleExportDemoBundle(contextFor(edsProject(dir), true), { setup: true, storefront: false });
        expect(mockSettingsDialog).toHaveBeenCalledTimes(1);
        expect(fromDialog).toMatchObject({ success: true });

        const headless = await handleExportDemoBundle(contextFor(edsProject(dir), false), { setup: true, storefront: false, path: 'out.json' });
        expect(mockSettingsFile).toHaveBeenCalledWith(expect.anything(), { path: 'out.json', includeSecrets: false });
        expect(headless).toEqual({ success: true, data: { path: '/p/kukla-bodea.demo-builder.json', fileCount: 1, parts: ['setup'] } });
    });

    it('asks where with the save dialog from the webview, and answers cancelled when dismissed', async () => {
        mockSave.mockResolvedValue(undefined);
        const result = await handleExportDemoBundle(contextFor(edsProject(dir), true), undefined);
        expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ filters: { 'Demo bundle': ['zip'] } }));
        expect(result).toEqual({ success: true, data: { cancelled: true } });
        expect(fileOperations.downloadRepoArchive).not.toHaveBeenCalled();
    });

    it('writes the bundle where the dialog said: setup without credentials, storefront from the default branch with the description inside', async () => {
        const target = path.join(dir, 'anywhere.zip');
        mockSave.mockResolvedValue({ fsPath: target });
        repoOperations.getRepository.mockResolvedValue({ fullName: 'steve/kukla-bodea', defaultBranch: 'develop', isPrivate: false });

        const result = await handleExportDemoBundle(contextFor(edsProject(dir), true), undefined);

        expect(fileOperations.downloadRepoArchive).toHaveBeenCalledWith('steve', 'kukla-bodea', 'develop');
        expect(result).toMatchObject({ success: true, data: { path: target, fileCount: 3, parts: ['setup', 'storefront'] } });
        const written = new AdmZip(fs.readFileSync(target));
        const setup = JSON.parse(written.readAsText('kukla-bodea-demo-bundle/setup.demo-builder.json'));
        expect(setup.includesSecrets).toBe(false);
        expect(JSON.stringify(setup)).not.toContain('fake-test-pw-not-a-secret');
        const description = JSON.parse(written.readAsText('kukla-bodea-demo-bundle/storefront/demo.demo-builder.json'));
        expect(description).toMatchObject({ kind: 'demo', name: 'Bodea', contentSource: { org: 'skukla', site: 'kukla-bodea' } });
    });

    it('with no panel writes <project>-demo-bundle.zip inside the project directory, and keeps a given path inside it', async () => {
        const result = await handleExportDemoBundle(contextFor(edsProject(dir), false), { setup: false });
        expect(result).toMatchObject({ success: true, data: { path: path.join(fs.realpathSync(dir), 'kukla-bodea-demo-bundle.zip'), parts: ['storefront'] } });
        expect(mockSave).not.toHaveBeenCalled();

        const outside = await handleExportDemoBundle(contextFor(edsProject(dir), false), { path: '../escape.zip' });
        expect(outside.success).toBe(false);
        expect(fs.existsSync(path.join(dir, '..', 'escape.zip'))).toBe(false);
    });

    it("passes GitHub's failure through", async () => {
        fileOperations.downloadRepoArchive.mockRejectedValue(new Error('Failed to download archive: HTTP 404'));
        expect(await handleExportDemoBundle(contextFor(edsProject(dir), false), undefined)).toEqual({ success: false, error: 'Failed to download archive: HTTP 404' });
    });
});
