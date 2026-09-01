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

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';


const mockRepublishStorefrontConfig = jest.fn();
// The '@/features/eds' barrel was retired under ADR-022, so these names are mocked
// at the modules that declare them. isEdsProject is a type guard and lives in
// @/types/typeGuards, whose other guards stay real.
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(() => true),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    detectStorefrontChanges: jest.fn(() => ({ hasChanges: false })),
}));
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
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
        const mockContext = createMockExtensionContext();
        const mockStateManager = createMockStateManager();
        const mockLogger = createMockLogger() as unknown as Logger;
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
