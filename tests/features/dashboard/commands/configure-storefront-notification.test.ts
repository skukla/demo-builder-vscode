/**
 * Regression: the storefront republish flow must reset the once-per-session
 * notification flag after a successful republish, so a SUBSEQUENT storefront
 * config change re-prompts to republish — mirroring the mesh flow
 * (deployMesh -> meshActionTaken) and restart flow (startDemo -> restartActionTaken).
 *
 * Bug: republishStorefront() never called demoBuilder._internal.storefrontActionTaken,
 * so `storefrontNotificationShown` latched true after the first republish prompt and
 * every later storefront change silently showed "Configuration saved" with no
 * republish prompt — leaving the live storefront stale (e.g. switching store views
 * to "Main Website" prompted + republished, but switching back to CitiSignal did not).
 */

import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import * as vscode from 'vscode';
import { Logger } from '@/core/logging';
import { StateManager } from '@/core/state';
import type { Project } from '@/types';

jest.mock('vscode');
jest.mock('@/core/state');
jest.mock('@/core/logging', () => ({
    getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
}));

const mockRepublishStorefrontConfig = jest.fn();
jest.mock('@/features/eds', () => ({
    isEdsProject: jest.fn(() => true),
    detectStorefrontChanges: jest.fn(() => ({ hasChanges: false })),
    republishStorefrontConfig: (...args: unknown[]) => mockRepublishStorefrontConfig(...args),
}));

jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        refreshStatus: jest.fn().mockResolvedValue(undefined),
    },
}));

const STOREFRONT_ACTION_TAKEN = 'demoBuilder._internal.storefrontActionTaken';

function makeProject(): Project {
    return { name: 'Test Project', path: '/test/project', componentConfigs: {} } as unknown as Project;
}

describe('ConfigureProjectWebviewCommand - storefront republish resets notification flag', () => {
    let command: ConfigureProjectWebviewCommand;

    beforeEach(() => {
        jest.clearAllMocks();
        const mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension/path',
            extensionUri: vscode.Uri.file('/test/extension/path'),
            secrets: { get: jest.fn(), store: jest.fn() },
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as vscode.ExtensionContext;
        const mockStateManager = {
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as StateManager;
        const mockLogger = {
            debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        } as unknown as Logger;
        command = new ConfigureProjectWebviewCommand(mockContext, mockStateManager, mockLogger);
    });

    it('resets the storefront notification flag after a successful republish', async () => {
        mockRepublishStorefrontConfig.mockResolvedValue({ success: true });

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(makeProject());

        // The reset lets the NEXT storefront change re-prompt to republish.
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(STOREFRONT_ACTION_TAKEN);
    });

    it('does NOT reset the flag when republish fails (storefront still stale)', async () => {
        mockRepublishStorefrontConfig.mockResolvedValue({ success: false, error: 'boom' });

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(makeProject());

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(STOREFRONT_ACTION_TAKEN);
    });
});
