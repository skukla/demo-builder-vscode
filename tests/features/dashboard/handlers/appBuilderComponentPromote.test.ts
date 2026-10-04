/**
 * The human doors for saving a blank-starter app to GitHub and for the undo
 * (AB-1c): nothing reaches GitHub without the modal's yes, the modal names the
 * public repository and what is left out, and the project is saved with the new
 * source only after the push landed. The core runs for real against faked
 * GitHub operations and a real folder.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    CREATE_REPOSITORY,
    DELETE_REPOSITORY,
    handlePromoteAppBuilderComponent,
    handleUnpromoteAppBuilderComponent,
} from '@/features/dashboard/handlers/appBuilderComponentPromote';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const validateToken = jest.fn();
const getUserOrgs = jest.fn();
const createEmptyRepository = jest.fn();
const waitForContent = jest.fn();
const deleteRepository = jest.fn();
const fileOperations = {
    getBranchInfo: jest.fn(),
    createBlob: jest.fn(),
    createTree: jest.fn(),
    createCommit: jest.fn(),
    updateBranchRef: jest.fn(),
};
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({
        tokenService: { validateToken, getUserOrgs },
        repoOperations: { createEmptyRepository, waitForContent, deleteRepository },
        fileOperations,
    }),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentPush', () => ({
    postComponentsSnapshot: jest.fn(),
}));

const SHELL = { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' };
const warn = vscode.window.showWarningMessage as jest.Mock;
const input = vscode.window.showInputBox as jest.Mock;
const pick = vscode.window.showQuickPick as jest.Mock;

function appFolder(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-handler-'));
    fs.writeFileSync(path.join(root, 'app.config.yaml'), 'application: {}');
    fs.writeFileSync(path.join(root, '.env'), 'AIO_RUNTIME_AUTH=secret');
    return root;
}

function setup(state: Partial<AppBuilderComponentState> = {}) {
    const project: Project = createMockProject({
        appBuilderComponents: {
            'my-app': {
                kind: 'integration',
                status: 'deployed',
                name: 'Order Sync',
                source: { ...SHELL },
                ...state,
            },
        },
        componentInstances: {
            'my-app': { id: 'my-app', name: 'Order Sync', status: 'ready', path: appFolder() },
        },
    });
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    const context = createMockHandlerContext({
        logger: createMockLogger(),
        stateManager,
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
    return { project, stateManager, context };
}

beforeEach(() => {
    jest.clearAllMocks();
    validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
    getUserOrgs.mockResolvedValue([]);
    input.mockResolvedValue('order-sync');
    createEmptyRepository.mockResolvedValue({
        id: 1,
        name: 'order-sync',
        fullName: 'steve/order-sync',
        htmlUrl: 'https://github.com/steve/order-sync',
        cloneUrl: 'https://github.com/steve/order-sync.git',
        defaultBranch: 'main',
    });
    waitForContent.mockResolvedValue(true);
    fileOperations.getBranchInfo.mockResolvedValue({ commitSha: 'head', treeSha: 't0' });
    fileOperations.createTree.mockResolvedValue('tree-1');
    fileOperations.createCommit.mockResolvedValue('c1');
    deleteRepository.mockResolvedValue(undefined);
});

describe('handlePromoteAppBuilderComponent', () => {
    it('confirms naming the public repository and what is left out, then creates, pushes and saves', async () => {
        const { project, stateManager, context } = setup();
        warn.mockResolvedValueOnce(CREATE_REPOSITORY);

        const result = await handlePromoteAppBuilderComponent(context, { id: 'my-app' });

        const [message, options] = warn.mock.calls[0];
        expect(message).toBe('Create the public GitHub repository steve/order-sync?');
        expect(options.modal).toBe(true);
        expect(options.detail).toMatch(
            /pushes 1 files of "Order Sync".*1 are left out: secret files \(\.env\)/
        );
        expect(createEmptyRepository).toHaveBeenCalledWith('order-sync', false, undefined);
        expect(result).toEqual({
            success: true,
            repository: {
                owner: 'steve',
                repo: 'order-sync',
                url: 'https://github.com/steve/order-sync',
                fileCount: 1,
            },
        });
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(project.appBuilderComponents?.['my-app']?.source).toEqual({
            owner: 'steve',
            repo: 'order-sync',
            branch: 'main',
        });
    });

    it('creates nothing when the SC says no', async () => {
        const { stateManager, context } = setup();
        warn.mockResolvedValueOnce(undefined);

        const result = await handlePromoteAppBuilderComponent(context, { id: 'my-app' });

        expect(result).toEqual({ success: true, cancelled: true });
        expect(createEmptyRepository).not.toHaveBeenCalled();
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('offers the organisations and creates under the one picked', async () => {
        const { context } = setup();
        getUserOrgs.mockResolvedValue(['acme']);
        pick.mockResolvedValueOnce({ label: 'acme' });
        warn.mockResolvedValueOnce(CREATE_REPOSITORY);

        await handlePromoteAppBuilderComponent(context, { id: 'my-app' });

        expect(warn.mock.calls[0][0]).toBe('Create the public GitHub repository acme/order-sync?');
        expect(createEmptyRepository).toHaveBeenCalledWith('order-sync', false, 'acme');
    });

    it('asks for a GitHub sign-in rather than opening one, and refuses an app that already has a repository', async () => {
        validateToken.mockResolvedValueOnce({ valid: false, reason: 'no-token' });
        const signedOut = await handlePromoteAppBuilderComponent(setup().context, { id: 'my-app' });
        expect(signedOut).toMatchObject({
            success: false,
            error: expect.stringMatching(/Sign in to GitHub/),
        });

        const imported = await handlePromoteAppBuilderComponent(
            setup({ source: { owner: 'acme', repo: 'sync' } }).context,
            { id: 'my-app' }
        );
        expect(imported).toMatchObject({
            success: false,
            error: expect.stringMatching(/own repository/),
        });
        expect(warn).not.toHaveBeenCalled();
        expect(createEmptyRepository).not.toHaveBeenCalled();
    });

    it('saves nothing when the push fails, and says the repository was created', async () => {
        const { stateManager, context } = setup();
        warn.mockResolvedValueOnce(CREATE_REPOSITORY);
        fileOperations.createTree.mockRejectedValueOnce(new Error('rate limited'));

        const result = await handlePromoteAppBuilderComponent(context, { id: 'my-app' });

        expect(result).toMatchObject({
            success: false,
            error: expect.stringMatching(/was created but the files did not reach it/),
        });
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });
});

describe('handleUnpromoteAppBuilderComponent', () => {
    const PROMOTED = {
        source: { owner: 'steve', repo: 'order-sync', branch: 'main' },
        promotion: { from: { ...SHELL }, at: '2026-10-05T00:00:00.000Z' },
    };

    it('deletes only after the modal yes, and makes it a blank-starter app again', async () => {
        const { project, stateManager, context } = setup(PROMOTED);
        warn.mockResolvedValueOnce(DELETE_REPOSITORY);

        const result = await handleUnpromoteAppBuilderComponent(context, { id: 'my-app' });

        expect(warn.mock.calls[0][0]).toBe(
            'Delete steve/order-sync from GitHub? This cannot be undone.'
        );
        expect(deleteRepository).toHaveBeenCalledWith('steve', 'order-sync');
        expect(result).toEqual({ success: true, deleted: 'steve/order-sync' });
        expect(project.appBuilderComponents?.['my-app']?.source).toEqual(SHELL);
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('deletes nothing when the SC says no, or when Demo Builder did not make the repository', async () => {
        warn.mockResolvedValueOnce(undefined);
        expect(
            await handleUnpromoteAppBuilderComponent(setup(PROMOTED).context, { id: 'my-app' })
        ).toEqual({
            success: true,
            cancelled: true,
        });
        expect(
            await handleUnpromoteAppBuilderComponent(setup().context, { id: 'my-app' })
        ).toMatchObject({
            success: false,
            error: expect.stringMatching(/was not saved/),
        });
        expect(deleteRepository).not.toHaveBeenCalled();
    });
});
