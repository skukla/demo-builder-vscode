/**
 * The zip door: pick, unpack, refuse what is not a storefront, create the
 * repository in the SC's own account, push, flag, answer owner/repo. The zip
 * reader, the GitHub services and the picker are the boundaries.
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { handleImportStorefrontZip, handleUseBundleSetup, importDemoBundle } from '@/features/eds/handlers/importStorefrontZipHandler';
import { rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { pushFiles } from '@/features/eds/services/github/githubTreePush';
import { readStorefrontZip } from '@/features/eds/services/storefront/zipStorefrontImport';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import type { SettingsFile } from '@/types/settingsFile';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({ getGitHubServices: jest.fn() }));
jest.mock('@/features/eds/services/github/githubTreePush', () => ({ pushFiles: jest.fn() }));
jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    rememberAddedDemo: jest.fn(async () => []),
}));
jest.mock('@/features/eds/services/storefront/zipStorefrontImport', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/zipStorefrontImport'),
    readStorefrontZip: jest.fn(),
}));

const mockServices = getGitHubServices as jest.Mock;
const mockPush = pushFiles as jest.Mock;
const mockRead = readStorefrontZip as jest.Mock;
const mockOpen = vscode.window.showOpenDialog as jest.Mock;
const mockExecute = vscode.commands.executeCommand as jest.Mock;
const mockRemember = rememberAddedDemo as jest.Mock;
const SETUP: SettingsFile = {
    version: 1,
    exportedAt: 'x',
    source: { project: 'bodea' },
    includesSecrets: false,
    selections: {},
    configs: {},
    selectedStack: 'eds-accs',
    edsConfig: { githubOwner: 'sender' },
};

const tokenService = { validateToken: jest.fn() };
const repoOperations = {
    createEmptyRepository: jest.fn(),
    waitForContent: jest.fn().mockResolvedValue(true),
    setTemplateFlag: jest.fn().mockResolvedValue(undefined),
};
const fileOperations = {};

const STOREFRONT = new Map<string, Buffer>([
    ['scripts/scripts.js', Buffer.from('x')],
    ['scripts/delayed.js', Buffer.from('x')],
    ['head.html', Buffer.from('x')],
]);

function ctx() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockServices.mockReturnValue({ repoOperations, fileOperations, tokenService });
    tokenService.validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
    mockRead.mockReturnValue({ files: STOREFRONT, rootName: 'citisignal-b2b-summit-main', dropped: 7 });
    repoOperations.createEmptyRepository.mockResolvedValue({ fullName: 'steve/citisignal-b2b-summit', name: 'citisignal-b2b-summit', defaultBranch: 'main' });
    mockExecute.mockResolvedValue(undefined);
    mockPush.mockResolvedValue({ commitSha: 'c1', fileCount: 3 });
});

describe('handleImportStorefrontZip', () => {
    it('asks for the file when none is given, and answers cancelled when the picker is dismissed', async () => {
        mockOpen.mockResolvedValue(undefined);
        const result = await handleImportStorefrontZip(ctx(), {});
        expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ filters: { 'Zip file': ['zip'] } }));
        expect(result).toEqual({ success: true, result: { cancelled: true } });
        expect(repoOperations.createEmptyRepository).not.toHaveBeenCalled();
    });

    it('creates a public repository named after the zip in the SC\'s own account, pushes, flags it a template, and answers owner/repo', async () => {
        const result = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip' });

        expect(mockOpen).not.toHaveBeenCalled();
        expect(repoOperations.createEmptyRepository).toHaveBeenCalledWith('citisignal-b2b-summit', false);
        expect(repoOperations.waitForContent).toHaveBeenCalledWith('steve', 'citisignal-b2b-summit');
        expect(mockPush).toHaveBeenCalledWith(fileOperations, 'steve', 'citisignal-b2b-summit', STOREFRONT, 'Add storefront from a zip file', expect.anything(), expect.any(Function));
        expect(repoOperations.setTemplateFlag).toHaveBeenCalledWith('steve', 'citisignal-b2b-summit', true);
        expect(result).toEqual({
            success: true,
            result: { owner: 'steve', repo: 'citisignal-b2b-summit', fullName: 'steve/citisignal-b2b-summit', fileCount: 3, dropped: 7, isPrivate: false },
        });
    });

    it('says plainly when the account already has a repository by that name, and names it so the dialog can offer it', async () => {
        // Measured 2026-09-14: GitHub answers a 422 whose message the dialog showed raw, JSON and docs link included.
        repoOperations.createEmptyRepository.mockRejectedValue(
            new Error('Repository creation failed.: {"resource":"Repository","code":"custom","field":"name","message":"name already exists on this account"} - https://docs.github.com/rest/repos/repos#create-a-repository-for-the-authenticated-user'),
        );

        const result = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip' });

        expect(result).toStrictEqual({
            success: false,
            code: 'REPO_EXISTS',
            error: 'Your GitHub account already has a repository named citisignal-b2b-summit.',
            existing: { owner: 'steve', repo: 'citisignal-b2b-summit' },
        });
        expect(mockPush).not.toHaveBeenCalled();
    });

    it('turns any other GitHub refusal into one sentence, without the JSON or the docs link', async () => {
        repoOperations.createEmptyRepository.mockRejectedValue(
            new Error('Repository creation failed.: {"message":"Repository creation failed: quota reached"} - https://docs.github.com/rest'),
        );

        const result = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip' });

        expect(result).toStrictEqual({
            success: false,
            error: "GitHub didn't create citisignal-b2b-summit: Repository creation failed: quota reached.",
        });
    });

    it("tells the dialog each step as it runs, on the 'storefront-zip-progress' channel", async () => {
        const context = ctx();

        await handleImportStorefrontZip(context, { zipPath: '/tmp/summit.zip' });

        const steps = (context.sendMessage as jest.Mock).mock.calls.filter(([type]) => type === 'storefront-zip-progress').map(([, payload]) => payload);
        expect(steps[0]).toStrictEqual({ message: 'Reading the zip', detail: 'summit.zip' });
        expect(steps[1]).toStrictEqual({ message: 'Creating the repository', detail: 'citisignal-b2b-summit · 3 files · 7 left out' });
    });

    it('takes a name and private visibility when asked', async () => {
        repoOperations.createEmptyRepository.mockResolvedValue({ fullName: 'steve/summit-demo', name: 'summit-demo' });
        await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip', repoName: 'summit-demo', isPrivate: true });
        expect(repoOperations.createEmptyRepository).toHaveBeenCalledWith('summit-demo', true);
    });

    it('refuses a zip that is not a storefront, naming what is missing, before creating anything', async () => {
        mockRead.mockReturnValue({ files: new Map([['README.md', Buffer.from('hi')]]), rootName: 'notes', dropped: 0 });
        const result = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/notes.zip' });
        expect(result).toEqual({ success: false, error: 'This zip is not an Edge Delivery storefront: it has no scripts/scripts.js, scripts/delayed.js, head.html.' });
        expect(repoOperations.createEmptyRepository).not.toHaveBeenCalled();
    });

    it('refuses an unreadable zip and a bad repository name in words', async () => {
        mockRead.mockImplementation(() => { throw new Error('Invalid or unsupported zip format'); });
        expect(await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/x.zip' })).toEqual({
            success: false,
            error: 'The zip file could not be read: Invalid or unsupported zip format',
        });

        mockRead.mockReturnValue({ files: STOREFRONT, rootName: 'ok', dropped: 0 });
        const bad = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/x.zip', repoName: '-bad name!' });
        expect(bad.success).toBe(false);
        expect(bad.error).toMatch(/Repository name/);
    });

    it("passes a bundle's setup back so the dialog can offer to start from it", async () => {
        mockRead.mockReturnValue({ files: STOREFRONT, rootName: 'bodea-demo-bundle', dropped: 0, setup: SETUP });
        const result = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/bodea-demo-bundle.zip' });
        expect(result.result).toMatchObject({ owner: 'steve', setup: SETUP });
    });
});

describe('handleUseBundleSetup', () => {
    it("closes the wizard and reopens it pre-filled from the bundle's setup, on the card", async () => {
        const dispose = jest.spyOn(BaseWebviewCommand, 'disposePanel').mockImplementation(() => undefined);
        const demo = { kind: 'demo' as const, version: 1, name: 'Bodea', source: { owner: 'steve', repo: 'summit', branch: 'main' }, storefrontKind: 'eds' as const };

        const result = await handleUseBundleSetup(ctx(), { setup: SETUP, demo });

        expect(dispose).toHaveBeenCalledWith('demoBuilderWizard');
        expect(mockExecute).toHaveBeenCalledWith('demoBuilder.createProject', {
            importedSettings: expect.objectContaining({ demo, selectedPackage: 'added:steve/summit', selectedStack: 'eds-accs' }),
            sourceDescription: 'the demo bundle',
        });
        expect((mockExecute.mock.calls[0][1] as { importedSettings: { edsConfig?: unknown } }).importedSettings.edsConfig).toBeUndefined();
        expect(result).toEqual({ success: true });
        dispose.mockRestore();
    });

    it('refuses without the setup or the demo', async () => {
        expect((await handleUseBundleSetup(ctx(), undefined)).success).toBe(false);
    });
});

describe('importDemoBundle', () => {
    it('with storefront and setup: creates the repository, remembers the card from the description, and opens the wizard pre-filled on it', async () => {
        const files = new Map(STOREFRONT);
        files.set('demo.demo-builder.json', Buffer.from('{"kind":"demo","version":1,"name":"Bodea"}'));
        mockRead.mockReturnValue({ files, rootName: 'bodea-demo-bundle', dropped: 0, setup: SETUP });
        repoOperations.createEmptyRepository.mockResolvedValue({ fullName: 'steve/bodea', name: 'bodea', defaultBranch: 'main' });

        const result = await importDemoBundle(ctx(), '/x/bodea-demo-bundle.zip');

        expect(repoOperations.createEmptyRepository).toHaveBeenCalledWith('bodea', false);
        const card = { kind: 'demo', version: 1, name: 'Bodea', source: { owner: 'steve', repo: 'bodea', branch: 'main' }, storefrontKind: 'eds' };
        expect(mockRemember).toHaveBeenCalledWith(card);
        expect(mockExecute).toHaveBeenCalledWith('demoBuilder.createProject', {
            importedSettings: expect.objectContaining({ demo: card, selectedPackage: 'added:steve/bodea' }),
            sourceDescription: expect.any(String),
        });
        expect(result).toMatchObject({ success: true, data: { success: true } });
    });

    it('with setup alone opens the wizard from the setup as a settings file would; with neither, refuses in words', async () => {
        mockRead.mockReturnValue({ files: new Map(), rootName: 'b', dropped: 0, setup: SETUP });
        await importDemoBundle(ctx(), '/x/setup-only.zip');
        expect(repoOperations.createEmptyRepository).not.toHaveBeenCalled();
        expect(mockExecute).toHaveBeenCalledWith('demoBuilder.createProject', expect.objectContaining({ importedSettings: SETUP }));

        mockRead.mockReturnValue({ files: new Map([['README.md', Buffer.from('x')]]), rootName: 'notes', dropped: 0 });
        expect(await importDemoBundle(ctx(), '/x/notes.zip')).toEqual({
            success: true,
            data: { success: false, error: 'This zip is neither a demo bundle nor an Edge Delivery storefront.' },
        });
    });

    it("says when the bundle's setup file cannot be read, before creating anything", async () => {
        mockRead.mockReturnValue({ files: STOREFRONT, rootName: 'b', dropped: 0, setupError: 'Missing required field: version' });
        const result = await importDemoBundle(ctx(), '/x/bad.zip');
        expect(result).toEqual({ success: true, data: { success: false, error: "The bundle's setup file could not be read: Missing required field: version" } });
        expect(repoOperations.createEmptyRepository).not.toHaveBeenCalled();
    });
});
