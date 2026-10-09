/**
 * CheckUpdatesCommand — integration pairs with newer code reach the picker, and a
 * picked row runs the pair update (AB-73).
 *
 * The integration picker module is mocked: this suite pins what the command hands
 * it (every loaded project, the current one, the context that can run deploys) and
 * what it does with its rows. The detection and the update are each other suites.
 */

import {
    CheckUpdatesCommand,
    loadProjects,
    projectWithAddons,
    setupDefaultMocks,
} from './checkUpdates.testUtils';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import {
    detectIntegrationUpdateItems,
    integrationPairUpdater,
    performIntegrationUpdates,
} from '@/features/updates/commands/integrationUpdatePicker';
import type { IntegrationUpdateItem } from '@/features/updates/commands/updateTypes';
import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const updater = jest.fn();
jest.mock('@/features/updates/commands/integrationUpdatePicker', () => ({
    detectIntegrationUpdateItems: jest.fn(async () => []),
    integrationPairUpdater: jest.fn(() => updater),
    performIntegrationUpdates: jest.fn(),
}));
jest.mock('@/features/updates/commands/updateExecutor');
jest.mock('@/features/updates/services/adobeMcpUpdateChecker');
jest.mock('@/core/utils/sleep');

const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
const detectMock = detectIntegrationUpdateItems as jest.Mock;
const performMock = performIntegrationUpdates as jest.Mock;

function row(project: Project): IntegrationUpdateItem {
    return {
        label: project.name,
        detail: '    ERP Integration and Justrite ERP  update available',
        update: {
            project,
            componentId: 'demo-erp',
            members: ['demo-erp'],
            label: 'ERP Integration and Justrite ERP',
            otherOrg: false,
        },
        isIntegrationUpdate: true,
    };
}

describe('CheckUpdatesCommand — integrations', () => {
    let harness: ReturnType<typeof setupDefaultMocks>;
    let justrite: Project;
    let bodea: Project;

    beforeEach(() => {
        jest.clearAllMocks();
        ServiceLocator.setCommandExecutor(createMockCommandExecutor());
        harness = setupDefaultMocks();
        (AdobeMcpUpdateChecker as jest.MockedClass<typeof AdobeMcpUpdateChecker>).prototype.checkForUpdates =
            jest.fn().mockResolvedValue(null);
        justrite = projectWithAddons({ name: 'Justrite', path: '/projects/justrite' });
        bodea = projectWithAddons({ name: 'Bodea', path: '/projects/bodea' });
        loadProjects(harness.mockStateManager, justrite, bodea);
        harness.mockStateManager.getCurrentProject.mockResolvedValue(bodea);
        showQuickPickMock.mockResolvedValue([]);
    });

    async function run(): Promise<void> {
        const command = new CheckUpdatesCommand(harness.mockContext, harness.mockStateManager, harness.mockLogger);
        await command.execute();
    }

    it('checks every loaded project, naming the current one', async () => {
        await run();

        expect(detectMock).toHaveBeenCalledTimes(1);
        expect(detectMock).toHaveBeenCalledWith(
            expect.objectContaining({ stateManager: harness.mockStateManager, logger: harness.mockLogger }),
            [justrite, bodea],
            bodea,
        );
    });

    it('a pair with newer code is a row in the picker, counted in its title', async () => {
        const item = row(justrite);
        detectMock.mockResolvedValue([item]);

        await run();

        expect(showQuickPickMock).toHaveBeenCalledTimes(1);
        const [items, options] = showQuickPickMock.mock.calls[0];
        expect(items).toContain(item);
        expect(options.title).toBe('Updates Available (1 project, 1 integration)');
    });

    it('picking the row IS the confirmation: the pair update runs with the context that can run it', async () => {
        const item = row(justrite);
        detectMock.mockResolvedValue([item]);
        showQuickPickMock.mockResolvedValue([item]);

        await run();

        expect(integrationPairUpdater).toHaveBeenCalledWith(
            expect.objectContaining({ stateManager: harness.mockStateManager }),
        );
        expect(performMock).toHaveBeenCalledTimes(1);
        expect(performMock).toHaveBeenCalledWith([item], expect.objectContaining({ updateIntegrationPair: updater }));
    });

    it('nothing picked: no pair update runs', async () => {
        detectMock.mockResolvedValue([row(justrite)]);

        await run();

        expect(performMock).not.toHaveBeenCalled();
    });
});
