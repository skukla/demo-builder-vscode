/**
 * DeployAppCommand Tests
 *
 * The command owns UX only — the lock, the progress notification, the dashboard
 * status bridge, and the toasts. The deploy sequence lives in the shared, UI-free
 * `deployAppHeadless` core (covered by deployAppHeadless.test). These tests verify
 * the command delegates to the core and maps its result to the right dashboard
 * status + toasts, mirroring DeployMeshCommand.
 */

import * as vscode from 'vscode';
import { DeployAppCommand } from '@/features/app-builder/commands/deployApp';
import { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import type { DeployAppHeadlessResult } from '@/features/app-builder/services/deployAppHeadless';

jest.mock('vscode');

const mockDeployAppHeadless = jest.fn();
jest.mock('@/features/app-builder/services/deployAppHeadless', () => ({
    deployAppHeadless: (...args: unknown[]) => mockDeployAppHeadless(...args),
}));

const mockSendAppStatusUpdate = jest.fn().mockResolvedValue(undefined);
const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppStatusUpdate: mockSendAppStatusUpdate,
        refreshStatus: mockRefreshStatus,
    },
}));

function createTestProject(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { projectId: 'proj', organization: 'org', workspace: 'ws', authenticated: true },
        componentInstances: {},
        componentConfigs: {},
    } as unknown as Project;
}

describe('DeployAppCommand', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(createTestProject()),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<StateManager>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        mockDeployAppHeadless.mockResolvedValue({ success: true, url: 'https://app' });

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: unknown, task: (progress: unknown) => Promise<void>) =>
                task({ report: jest.fn() })
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    });

    function run(): Promise<void> {
        return new DeployAppCommand(mockContext, mockStateManager, mockLogger).execute();
    }

    it('aborts (no delegate) when there is no current project', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(undefined as never);
        await run();
        expect(mockDeployAppHeadless).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('delegates to deployAppHeadless with the project + deps', async () => {
        await run();
        expect(mockDeployAppHeadless).toHaveBeenCalledWith(
            expect.objectContaining({
                project: expect.objectContaining({ name: 'test-project' }),
                stateManager: mockStateManager,
                logger: mockLogger,
                extensionPath: '/test/extension',
            })
        );
    });

    it('on success shows no error toast', async () => {
        await run();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('bridges onStatus to the dashboard app-status update', async () => {
        await run();
        const deps = mockDeployAppHeadless.mock.calls[0][0] as {
            onStatus: (s: string, m?: string, u?: string) => void;
        };
        deps.onStatus('deployed', undefined, 'https://app');
        expect(mockSendAppStatusUpdate).toHaveBeenCalledWith('deployed', undefined, 'https://app');
    });

    it('maps blockedBy=no-app to a warning + dashboard refresh', async () => {
        mockDeployAppHeadless.mockResolvedValue({
            success: false,
            blockedBy: 'no-app',
        } as DeployAppHeadlessResult);
        await run();
        expect(mockRefreshStatus).toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('does not have an App Builder app')
        );
    });

    it('maps blockedBy=auth to an error toast (unless cancelled)', async () => {
        mockDeployAppHeadless.mockResolvedValue({
            success: false,
            blockedBy: 'auth',
        } as DeployAppHeadlessResult);
        await run();
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('does NOT toast when a blocked auth/org deploy was cancelled', async () => {
        mockDeployAppHeadless.mockResolvedValue({
            success: false,
            blockedBy: 'auth',
            cancelled: true,
        } as DeployAppHeadlessResult);
        await run();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('maps blockedBy=permission to an error toast', async () => {
        mockDeployAppHeadless.mockResolvedValue({
            success: false,
            blockedBy: 'permission',
            error: 'no role',
        } as DeployAppHeadlessResult);
        await run();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('no role');
    });

    it('maps a raw deploy failure to an error toast with the message', async () => {
        mockDeployAppHeadless.mockResolvedValue({
            success: false,
            error: 'boom',
        } as DeployAppHeadlessResult);
        await run();
        expect(mockRefreshStatus).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('boom');
    });
});
