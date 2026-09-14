/**
 * The zip door: pick, unpack, refuse what is not a storefront, create the
 * repository in the SC's own account, push, flag, answer owner/repo. The zip
 * reader, the GitHub services and the picker are the boundaries.
 */

import * as vscode from 'vscode';
import { handleImportStorefrontZip } from '@/features/eds/handlers/importStorefrontZipHandler';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { pushFiles } from '@/features/eds/services/github/githubTreePush';
import { readStorefrontZip } from '@/features/eds/services/storefront/zipStorefrontImport';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({ getGitHubServices: jest.fn() }));
jest.mock('@/features/eds/services/github/githubTreePush', () => ({ pushFiles: jest.fn() }));
jest.mock('@/features/eds/services/storefront/zipStorefrontImport', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/zipStorefrontImport'),
    readStorefrontZip: jest.fn(),
}));

const mockServices = getGitHubServices as jest.Mock;
const mockPush = pushFiles as jest.Mock;
const mockRead = readStorefrontZip as jest.Mock;
const mockOpen = vscode.window.showOpenDialog as jest.Mock;

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
    mockServices.mockReturnValue({ repoOperations, fileOperations });
    mockRead.mockReturnValue({ files: STOREFRONT, rootName: 'citisignal-b2b-summit-main', dropped: 7 });
    repoOperations.createEmptyRepository.mockResolvedValue({ fullName: 'steve/citisignal-b2b-summit', name: 'citisignal-b2b-summit' });
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

    it('creates a private repository named after the zip in the SC\'s own account, pushes, flags it a template, and answers owner/repo', async () => {
        const result = await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip' });

        expect(mockOpen).not.toHaveBeenCalled();
        expect(repoOperations.createEmptyRepository).toHaveBeenCalledWith('citisignal-b2b-summit', true);
        expect(repoOperations.waitForContent).toHaveBeenCalledWith('steve', 'citisignal-b2b-summit');
        expect(mockPush).toHaveBeenCalledWith(fileOperations, 'steve', 'citisignal-b2b-summit', STOREFRONT, 'Add storefront from a zip file', expect.anything());
        expect(repoOperations.setTemplateFlag).toHaveBeenCalledWith('steve', 'citisignal-b2b-summit', true);
        expect(result).toEqual({
            success: true,
            result: { owner: 'steve', repo: 'citisignal-b2b-summit', fullName: 'steve/citisignal-b2b-summit', fileCount: 3, dropped: 7, isPrivate: true },
        });
    });

    it('takes a name and public visibility when asked', async () => {
        repoOperations.createEmptyRepository.mockResolvedValue({ fullName: 'steve/summit-demo', name: 'summit-demo' });
        await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip', repoName: 'summit-demo', isPrivate: false });
        expect(repoOperations.createEmptyRepository).toHaveBeenCalledWith('summit-demo', false);
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

    it("passes GitHub's refusal through (a name already taken)", async () => {
        repoOperations.createEmptyRepository.mockRejectedValue(new Error('Repository name already exists'));
        expect(await handleImportStorefrontZip(ctx(), { zipPath: '/tmp/summit.zip' })).toEqual({ success: false, error: 'Repository name already exists' });
        expect(mockPush).not.toHaveBeenCalled();
    });
});
