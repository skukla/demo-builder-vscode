/**
 * ProjectDashboardWebviewCommand — opening the dashboard with the storefront report
 * showing (EDS-64). A dashboard already open is PUSHED `showStorefrontReport`; one about
 * to be created cannot hear a push yet, so the request is held and its webview takes it
 * on mount through `takeStorefrontReportRequest`.
 */

import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { handleTakeStorefrontReportRequest } from '@/features/dashboard/handlers/storefrontReportHandlers';
import type { Project } from '@/types/base';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('fs/promises', () => ({
    access: jest.fn().mockRejectedValue(new Error('ENOENT')),
}));
jest.mock('@/features/dashboard/services/onOpenChecks/orchestrator', () => ({
    armOnOpenChecks: jest.fn(),
}));

function commandFor(project: Project): ProjectDashboardWebviewCommand {
    const stateManager = createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) });
    const command = new ProjectDashboardWebviewCommand(
        createMockExtensionContext({}, '/mock/extension/path'),
        stateManager,
        createMockLogger(),
    );
    internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(undefined);
    internals(command).initializeCommunication = jest.fn().mockResolvedValue(undefined);
    return command;
}

/** Whether a dashboard mounting now would be told to open the report (and clears it). */
async function heldRequest(): Promise<boolean> {
    const response = await handleTakeStorefrontReportRequest(createMockHandlerContext());
    return response.success && response.data.show;
}

beforeEach(async () => {
    jest.clearAllMocks();
    await heldRequest();
});

describe('ProjectDashboardWebviewCommand - showStorefrontReport', () => {
    it('holds the request for a dashboard about to be created, and pushes nothing', async () => {
        const command = commandFor(createMockProject());

        await command.execute({ showStorefrontReport: true });

        await expect(heldRequest()).resolves.toBe(true);
    });

    it('pushes showStorefrontReport to a dashboard already open, holding nothing', async () => {
        const command = commandFor(createMockProject());
        const sendMessage = jest.fn().mockResolvedValue(undefined);
        internals(command).communicationManager = { sendMessage };

        await command.execute({ showStorefrontReport: true });

        expect(sendMessage).toHaveBeenCalledWith('showStorefrontReport', undefined);
        await expect(heldRequest()).resolves.toBe(false);
    });

    it('opens neither when the dashboard is opened for something else', async () => {
        const command = commandFor(createMockProject());
        const sendMessage = jest.fn().mockResolvedValue(undefined);
        internals(command).communicationManager = { sendMessage };

        await command.execute();

        expect(sendMessage).not.toHaveBeenCalledWith('showStorefrontReport', undefined);
        await expect(heldRequest()).resolves.toBe(false);
    });
});
