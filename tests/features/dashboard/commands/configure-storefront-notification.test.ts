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
import { createMockProject } from '../../../helpers/projectFake';


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

const mockRunPendingBlockLibraryWork = jest.fn();
jest.mock('@/features/dashboard/commands/configureBlockLibraryExecutor', () => ({
    runPendingBlockLibraryWork: (...args: unknown[]) => mockRunPendingBlockLibraryWork(...args),
}));

jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        refreshStatus: jest.fn().mockResolvedValue(undefined),
    },
}));

const STOREFRONT_ACTION_TAKEN = 'demoBuilder._internal.storefrontActionTaken';

function makeProject(): Project {
    return createMockProject({ name: 'Test Project', path: '/test/project', componentConfigs: {} });
}

describe('ConfigureProjectWebviewCommand - storefront republish resets notification flag', () => {
    let command: ConfigureProjectWebviewCommand;
    let mockContext: ReturnType<typeof createMockExtensionContext>;
    let mockStateManager: ReturnType<typeof createMockStateManager>;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRunPendingBlockLibraryWork.mockResolvedValue([]);
        mockContext = createMockExtensionContext();
        mockStateManager = createMockStateManager();
        mockLogger = createMockLogger() as unknown as Logger;
        command = new ConfigureProjectWebviewCommand(mockContext, mockStateManager, mockLogger);
    });

    it('resets the storefront notification flag after a successful republish', async () => {
        mockRepublishStorefrontConfig.mockResolvedValue({ success: true });

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(makeProject());

        // The reset lets the NEXT storefront change re-prompt to republish.
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(STOREFRONT_ACTION_TAKEN);
    });

    it('runs the pending block library work first, then the republish it already ran (EDS-39)', async () => {
        const order: string[] = [];
        mockRunPendingBlockLibraryWork.mockImplementation(async () => {
            order.push('block libraries');
            return [];
        });
        mockRepublishStorefrontConfig.mockImplementation(async () => {
            order.push('republish');
            return { success: true };
        });
        const project = makeProject();

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(project);

        expect(order).toEqual(['block libraries', 'republish']);
        // The same project, and the parts the shell builds its collaborators from.
        const [handedProject, parts, report] = mockRunPendingBlockLibraryWork.mock.calls[0];
        expect(handedProject).toBe(project);
        expect(parts).toEqual({ context: mockContext, stateManager: mockStateManager, logger: mockLogger });
        expect(typeof report).toBe('function');
    });

    it('hands the republish a DA.live sign-in, which the CDN publish needs (PL-76)', async () => {
        mockRepublishStorefrontConfig.mockResolvedValue({ success: true });

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(makeProject());

        const [params] = mockRepublishStorefrontConfig.mock.calls[0];
        expect(typeof params.ensureDaLiveSession).toBe('function');
    });

    it('says the live storefront did not update when only GitHub took it (PL-76)', async () => {
        // It used to say "republished successfully" while the CDN kept the old config.
        mockRepublishStorefrontConfig.mockResolvedValue({
            success: true,
            cdnError: 'No DA.live session',
        });

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(makeProject());

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('still serves the previous one: No DA.live session'),
        );
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('republished successfully'),
            expect.anything(),
        );
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(STOREFRONT_ACTION_TAKEN);
    });

    it('does NOT reset the flag when republish fails (storefront still stale)', async () => {
        mockRepublishStorefrontConfig.mockResolvedValue({ success: false, error: 'boom' });

        await (command as unknown as { republishStorefront: (p: Project) => Promise<void> })
            .republishStorefront(makeProject());

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(STOREFRONT_ACTION_TAKEN);
    });
});
