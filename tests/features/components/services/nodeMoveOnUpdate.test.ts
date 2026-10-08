/**
 * When the Node move runs (PR-1a step 9): only when this release's Node differs from
 * the last activation's, never on an ordinary start, and what the SC is shown.
 */

jest.mock('@/features/components/services/nodeMigration', () => ({
    moveInstalledComponentsToNode: jest.fn(),
}));
jest.mock('@/features/components/services/nodeMigrationDeps', () => ({
    createNodeMigrationDeps: jest.fn(),
}));

import * as vscode from 'vscode';
import { moveInstalledComponentsToNode } from '@/features/components/services/nodeMigration';
import { createNodeMigrationDeps } from '@/features/components/services/nodeMigrationDeps';
import { LAST_PREPARED_NODE_KEY, moveToNodeIfItMoved } from '@/features/components/services/nodeMoveOnUpdate';
import { demoBuilderNode } from '@/features/components/services/nodeRequirements';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext, createStatefulGlobalState } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const move = moveInstalledComponentsToNode as jest.Mock;
const createDeps = createNodeMigrationDeps as jest.Mock;
const logger = createMockLogger();
const stateManager = createMockStateManager();
const commandManager = createMockCommandExecutor();

function contextWith(last: string | undefined) {
    const { globalState } = createStatefulGlobalState(last === undefined ? {} : { [LAST_PREPARED_NODE_KEY]: last });
    return createMockExtensionContext({ globalState });
}

const ok = { moved: [], failed: [], running: [] };

beforeEach(() => {
    jest.clearAllMocks();
    createDeps.mockReturnValue({ knownProjects: jest.fn(async () => [{ name: 'p' }]) });
    move.mockResolvedValue(ok);
});

describe('moveToNodeIfItMoved', () => {
    it('does nothing on an ordinary start, when the Node has not changed', async () => {
        await moveToNodeIfItMoved(contextWith(demoBuilderNode()), stateManager, commandManager, logger);

        expect(move).not.toHaveBeenCalled();
        expect(vscode.window.withProgress).not.toHaveBeenCalled();
    });

    it('only records the Node on a first activation with no projects (the prerequisites prepare it)', async () => {
        createDeps.mockReturnValue({ knownProjects: jest.fn(async () => []) });
        const context = contextWith(undefined);

        await moveToNodeIfItMoved(context, stateManager, commandManager, logger);

        expect(move).not.toHaveBeenCalled();
        expect(context.globalState.update).toHaveBeenCalledWith(LAST_PREPARED_NODE_KEY, demoBuilderNode());
    });

    it('moves to the new Node behind a progress notification, then records it', async () => {
        const context = contextWith('20');

        await moveToNodeIfItMoved(context, stateManager, commandManager, logger);

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: `Updating Demo Builder's Node to ${demoBuilderNode()}` }),
            expect.any(Function),
        );
        expect(move).toHaveBeenCalledWith(demoBuilderNode(), expect.anything());
        expect(context.globalState.update).toHaveBeenCalledWith(LAST_PREPARED_NODE_KEY, demoBuilderNode());
        expect(vscode.window.setStatusBarMessage).toHaveBeenCalled();
    });

    it('records nothing when the Node could not be prepared, so the next start tries again', async () => {
        move.mockResolvedValue({ ...ok, nodeError: 'offline' });
        const context = contextWith('20');

        await moveToNodeIfItMoved(context, stateManager, commandManager, logger);

        expect(context.globalState.update).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining(`could not prepare Node ${demoBuilderNode()}`),
        );
    });

    it('names a component that could not move, and says it still runs', async () => {
        move.mockResolvedValue({ ...ok, failed: [{ component: 'citisignal: headless', error: 'npm ERR!' }] });

        await moveToNodeIfItMoved(contextWith('20'), stateManager, commandManager, logger);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Could not move citisignal: headless'),
        );
    });
});
