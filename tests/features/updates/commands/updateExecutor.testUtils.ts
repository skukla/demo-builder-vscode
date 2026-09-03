/**
 * The vscode shell and block-collection stub every updateExecutor suite builds.
 *
 * Identical in each, verbatim: a `withProgress` that runs its callback straight
 * through, the three message boxes, and the block-collection installer the
 * executor calls on its way past. Each suite adds its own third mock — the
 * Adobe MCP core, the sync path, a service class — so only the shared part
 * lives here.
 */

import * as vscode from 'vscode';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

/**
 * The REAL `UpdateContext`, with the two members the suites read back kept at
 * their mocked types — `stateManager.saveProject.mock.calls` and the logger's.
 * A parallel `UpdateContextForTest` shape would be the invented-type mistake.
 */
export type TestUpdateContext = UpdateContext & {
    stateManager: ReturnType<typeof createMockStateManager>;
    logger: ReturnType<typeof createMockLogger>;
};

/** A context production could produce: every member from its canonical builder. */
export function makeUpdateContext(
    stateOverrides: Parameters<typeof createMockStateManager>[0] = {},
): TestUpdateContext {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        commandManager: createMockCommandExecutor(),
        stateManager: createMockStateManager(stateOverrides),
        logger: createMockLogger(),
    };
}

/**
 * Run `withProgress` callbacks straight through and hand back the `report`
 * mock, so a suite can assert what the executor told the progress bar —
 * the message and the increment are arguments to a collaborator, and the
 * only place the per-item split (100 / n) is observable.
 */
export function captureProgress(): jest.Mock {
    const report = jest.fn();
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (_options: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
            task({ report }),
    );
    return report;
}
