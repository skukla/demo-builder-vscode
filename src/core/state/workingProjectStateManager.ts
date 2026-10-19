/**
 * A StateManager view for one surface — a screen, or an agent session — that acts on
 * that surface's WORKING project instead of whichever project is current (AI-15).
 *
 * There is one current project, and a person's click and an agent's task both move it.
 * On 2026-10-09 an agent's create made a scratch project current while the Integrations
 * screen still showed JustRite, and the screen's next "Add another ERP" ran against the
 * scratch project. Every handler asks `getCurrentProject()`; this view answers it with the
 * surface's own project, so the 149 call sites need no change.
 *
 * - `getCurrentProject` loads the working project from disk, per call (`persistAfterLoad:
 *   false`: a read must not move the pointer). No working project: the current one.
 * - `saveProject` is today's save when the working project IS the current one, so the
 *   change event still fires and an open dashboard refreshes. When it is another
 *   project, it saves that project's manifest only (`saveProjectConfigOnly`): the real
 *   save makes the saved project current, which is the leak this view exists to stop.
 * - Everything else is the real manager's, called ON the real manager. The view this
 *   replaces (`scopedStateManager.ts`) inherited by prototype, so a method that assigns a
 *   field (`clearAll` replaces `this.state`) changed the copy and left the real one alone.
 *
 * @module core/state/workingProjectStateManager
 */

import type { Project } from '@/types/base';
import type { StateManager } from '@/types/state';

/**
 * Build the view.
 *
 * @param real - the real manager
 * @param workingPath - the surface's project directory now, or undefined to follow the
 *   current project. Read on every call, so a screen re-opened for another project, or an
 *   agent that picks one, moves the view with it.
 * @returns a StateManager answering for the working project
 */
export function createWorkingProjectStateManager(
    real: StateManager,
    workingPath: () => string | undefined,
): StateManager {
    const overrides: Partial<StateManager> = {
        getCurrentProject: async () => {
            const path = workingPath();
            if (!path) return real.getCurrentProject();
            const project = await real.loadProjectFromPath(path, undefined, { persistAfterLoad: false });
            return project ?? undefined;
        },
        saveProject: async (project: Project) => {
            if (await isCurrent(real, project.path)) return real.saveProject(project);
            return real.saveProjectConfigOnly(project);
        },
    };
    return new Proxy(real, {
        get(target, prop, receiver) {
            if (prop in overrides) return overrides[prop as keyof StateManager];
            const value: unknown = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

/** Is this the project the person has open now? */
async function isCurrent(real: StateManager, path: string): Promise<boolean> {
    const current = await real.getCurrentProject();
    return current?.path === path;
}
