/**
 * Wires the Node move (`nodeMigration.ts`, PR-1a step 9) to the real collaborators:
 * every project Demo Builder knows, read without opening any; the one ensure call;
 * the component installer; and a save that keeps the open project's memory and disk
 * in agreement.
 *
 * @module features/components/services/nodeMigrationDeps
 */

import { ComponentManager } from './componentManager';
import { ComponentRegistryManager } from './ComponentRegistryManager';
import { ensureNode } from './nodeEnsure';
import type { NodeMigrationDeps } from './nodeMigration';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { ComponentInstance, Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** A component the catalog does not define (an App Builder one): it needs only its packages. */
function bareDefinition(componentId: string, component: ComponentInstance): TransformedComponentDefinition {
    return { id: componentId, name: component.name || componentId, type: 'app-builder' };
}

/** The parts of the state manager the move uses. */
export type NodeMigrationState = Pick<
    StateManager,
    'getAllProjects' | 'getRecentProjects' | 'readProject' | 'getCurrentProject' | 'saveProject' | 'saveProjectConfigOnly'
>;

/** Every project path Demo Builder knows: the projects folder and the recent list (an import can live elsewhere). */
async function knownProjectPaths(stateManager: NodeMigrationState): Promise<string[]> {
    const inFolder = (await stateManager.getAllProjects()).map((p) => p.path);
    const recent = (await stateManager.getRecentProjects()).map((p) => p.path);
    return [...new Set([...inFolder, ...recent])];
}

/** Persist without opening: the open project goes through saveProject so memory and disk agree. */
async function saveWithoutOpening(stateManager: NodeMigrationState, project: Project): Promise<void> {
    const current = await stateManager.getCurrentProject();
    if (current?.path === project.path) {
        await stateManager.saveProject(project);
    } else {
        await stateManager.saveProjectConfigOnly(project);
    }
}

export function createNodeMigrationDeps(
    stateManager: NodeMigrationState,
    commandManager: CommandExecutor,
    extensionPath: string,
    logger: Logger,
    report: (line: string) => void,
): NodeMigrationDeps {
    const installer = new ComponentManager(logger, commandManager);
    const registry = new ComponentRegistryManager(extensionPath);
    return {
        knownProjects: async () => {
            const read = await Promise.all((await knownProjectPaths(stateManager)).map((p) => stateManager.readProject(p)));
            return read.filter((project): project is Project => project !== null);
        },
        ensureNode: (major) => ensureNode(commandManager, { major, adobeCli: true }, logger),
        reinstall: async (_project, componentId, component, major) => {
            if (!component.path) return 'it has no folder on disk';
            // The catalog's definition carries its build step.
            const definition = (await registry.getComponentById(componentId)) ?? bareDefinition(componentId, component);
            const result = await installer.installNpmDependencies(component.path, definition, major);
            return result.success ? undefined : (result.error ?? 'the reinstall failed');
        },
        saveProject: (project) => saveWithoutOpening(stateManager, project),
        report,
    };
}
