/**
 * A connection-scoped view of the StateManager — the session directory's
 * project IS the current project, and the dashboard pointer is never touched.
 *
 * Two overrides, both load-bearing (see connectionScope.ts for the model):
 *
 * - `getCurrentProject` loads the scoped project FROM DISK per call
 *   (`persistAfterLoad: false` — a read must not move the pointer). Fresh per
 *   call on purpose: a scoped agent session can run for hours, and a cached
 *   project would miss every change the dashboard makes meanwhile.
 * - `saveProject` routes to `saveProjectConfigOnly`. The real saveProject
 *   SETS the global current-project pointer as a side effect — correct for
 *   the UI paths that own the pointer, and exactly the leak a scoped session
 *   must not have: an agent standing in project A must not flip the owner's
 *   dashboard to A by saving.
 *
 * Everything else delegates via the prototype chain, so the facade never
 * drifts from the real manager's surface.
 *
 * @module features/ai/server/scopedStateManager
 */

import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';

/**
 * Build the scoped facade.
 *
 * @param stateManager - the real manager (prototype-delegated for everything else)
 * @param projectDir - absolute path of the connection's scoped project
 * @returns a StateManager-shaped object with scoped current-project semantics
 */
export function createScopedStateManager(
    stateManager: StateManager,
    projectDir: string,
): StateManager {
    const scoped = Object.create(stateManager) as StateManager;

    scoped.getCurrentProject = async (): Promise<Project | undefined> => {
        const project = await stateManager.loadProjectFromPath(projectDir, undefined, {
            persistAfterLoad: false,
        });
        return project ?? undefined;
    };

    scoped.saveProject = async (project: Project): Promise<void> => {
        await stateManager.saveProjectConfigOnly(project);
    };

    return scoped;
}
