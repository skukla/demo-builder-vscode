/**
 * The project creations running in this window, by project path.
 *
 * A new project is saved with status `creating` until creation finishes (PL-82).
 * The file alone cannot say whether that creation is still running: one that failed
 * or was cut off by a closed window leaves the same status behind. This list can,
 * so the projects list reads it to tell "being created" from "never finished".
 *
 * In memory on purpose: a window that closes takes its creations with it, which is
 * exactly when their projects stop being "being created".
 *
 * @module core/state/creationsRunning
 */

const running = new Set<string>();

/**
 * Run a creation, listed as running until it settles, success or failure.
 *
 * @param projectPath - the project being created
 * @param create - the creation itself
 * @returns whatever the creation resolves to
 */
export async function whileCreating<T>(projectPath: string, create: () => Promise<T>): Promise<T> {
    running.add(projectPath);
    try {
        return await create();
    } finally {
        running.delete(projectPath);
    }
}

/**
 * Whether a project's creation is running in this window.
 *
 * @param projectPath - the project's path
 * @returns true while its creation runs
 */
export function isCreationRunning(projectPath: string): boolean {
    return running.has(projectPath);
}
