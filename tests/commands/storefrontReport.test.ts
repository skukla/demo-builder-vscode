/**
 * `Demo Builder: Storefront Report` (EDS-13f, EDS-64). The report is a window over the
 * project dashboard now; this pins what the command does: open the dashboard with the
 * window showing, and nothing else. It used to open a markdown document followed by an
 * offer of Demo Builder's fixes and a template merge.
 */

import * as vscode from 'vscode';
import { StorefrontReportCommand } from '@/commands/storefrontReport';
import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

function command(project: Project | undefined) {
    const stateManager = createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }) as unknown as StateManager;
    return new StorefrontReportCommand(createMockExtensionContext(), stateManager, createMockLogger() as unknown as Logger);
}

beforeEach(() => jest.clearAllMocks());

describe('StorefrontReportCommand', () => {
    it('opens the dashboard with the report window showing', async () => {
        await command(createMockProject({ name: 'justrite' })).execute();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard', {
            showStorefrontReport: true,
        });
    });

    it('asks nothing: no modal follows', async () => {
        await command(createMockProject({ name: 'justrite' })).execute();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('says so when there is no project, and opens nothing', async () => {
        await command(undefined).execute();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No project loaded.', 'OK');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});
