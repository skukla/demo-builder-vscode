/**
 * The Datapacks command, built the one way both its suites need (`showDataInstaller.test.ts`,
 * `showDataInstaller-clear.test.ts`): a real command over a state manager fake whose current
 * project each suite chooses. The suites' `jest.mock` lines stay in each suite, since a mock only
 * hoists above the imports of the file it is written in.
 */

import type * as vscode from 'vscode';
import { ShowDataInstallerCommand } from '@/features/data-installer/commands/showDataInstaller';
import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';
import type { DataInstallerInitialData } from '@/types/webviewPayloads';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export interface BuiltDataInstallerCommand {
    command: ShowDataInstallerCommand;
    stateManager: ReturnType<typeof createMockStateManager>;
}

/**
 * @param mode - `library` for the Datapack Library; a project's Datapacks by default
 * @param project - the current project; none by default
 * @param context - the extension context; a fresh fake by default
 */
export function makeDataInstallerCommand(
    mode?: DataInstallerInitialData['mode'],
    project?: Project,
    context: vscode.ExtensionContext = createMockExtensionContext()
): BuiltDataInstallerCommand {
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project ?? null),
    });
    const command = new ShowDataInstallerCommand(
        context,
        stateManager as unknown as StateManager,
        createMockLogger(),
        mode
    );
    return { command, stateManager };
}
