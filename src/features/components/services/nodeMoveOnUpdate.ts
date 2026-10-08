/**
 * At activation, when this release runs on a different Node from the last activation,
 * prepare the new Node and move installed components to it (PR-1a step 9), in the
 * background behind one progress notification. Never on an ordinary start: the owner's
 * exception to PR-1 D14 covers only an update that changed the Node.
 *
 * What the SC sees (step 12): the progress notification, one line per step; a
 * status-bar line when done; a warning that names any component that could not move
 * (it keeps running on its old Node); every step in "Demo Builder: User Logs".
 *
 * @module features/components/services/nodeMoveOnUpdate
 */

import * as vscode from 'vscode';
import { moveInstalledComponentsToNode, type NodeMigrationResult } from './nodeMigration';
import { createNodeMigrationDeps, type NodeMigrationState } from './nodeMigrationDeps';
import { demoBuilderNode } from './nodeRequirements';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { withProgressRegister } from '@/core/vscode/progressRegister';
import type { Logger } from '@/types/logger';

/** The Node the last activation prepared; a release that changes it triggers the move. */
export const LAST_PREPARED_NODE_KEY = 'demoBuilder.node.lastPrepared';

function tell(result: NodeMigrationResult, node: string): void {
    if (result.nodeError) {
        void vscode.window.showWarningMessage(
            `Demo Builder could not prepare Node ${node}. It will try again the next time VS Code starts. `
                + 'Details are in "Demo Builder: User Logs".',
        );
        return;
    }
    vscode.window.setStatusBarMessage(`$(check) Demo Builder now runs on Node ${node}`, TIMEOUTS.STATUS_BAR_SUCCESS);
    if (result.failed.length > 0) {
        const names = result.failed.map((f) => f.component).join(', ');
        void vscode.window.showWarningMessage(
            `Could not move ${names} to Node ${node}. They still run on their old Node. `
                + 'Details are in "Demo Builder: User Logs".',
        );
    }
}

/**
 * Prepare Demo Builder's Node and move installed components to it, when it changed.
 * A first activation with no projects only records the Node: the prerequisites step
 * prepares it for a new SC.
 */
export async function moveToNodeIfItMoved(
    context: vscode.ExtensionContext,
    stateManager: NodeMigrationState,
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<void> {
    const node = demoBuilderNode();
    const last = context.globalState.get<string>(LAST_PREPARED_NODE_KEY);
    if (last === node) return;

    const quiet = createNodeMigrationDeps(stateManager, commandManager, context.extensionPath, logger, () => undefined);
    if (last === undefined && (await quiet.knownProjects()).length === 0) {
        await context.globalState.update(LAST_PREPARED_NODE_KEY, node);
        return;
    }

    // The shared progress notification: a fixed title, each step as its line.
    const result = await withProgressRegister({ title: `Updating Demo Builder's Node to ${node}` }, (report) =>
        moveInstalledComponentsToNode(
            node,
            createNodeMigrationDeps(stateManager, commandManager, context.extensionPath, logger, (line) => {
                report(line);
                logger.info(`[Node] ${line}`);
            }),
        ));
    // Only once the new Node is ready: a failed preparation tries again next activation.
    if (!result.nodeError) await context.globalState.update(LAST_PREPARED_NODE_KEY, node);
    tell(result, node);
}
