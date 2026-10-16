/**
 * The project creations running in this window, by project path, and a signal when
 * one starts or ends.
 *
 * The projects list shows a project being created from the moment its creation
 * starts (PL-82). The project's file cannot say so: a project's status is never
 * written to it (the loader sets `stopped` or `running`), and for an Edge Delivery
 * project the file does not exist until the storefront is set up, minutes in. So
 * the list reads this, and reloads when it changes.
 *
 * Counted, not a set: an agent's creation is listed for its whole run and the
 * creation step inside it lists the same path again; the inner end must not unlist
 * the outer run. In memory on purpose: a window that closes takes its creations
 * with it.
 *
 * @module core/state/creationsRunning
 */

const running = new Map<string, number>();
const listeners = new Set<() => void>();

function changed(): void {
    for (const listener of listeners) listener();
}

/**
 * Run a creation, listed as running until it settles, success or failure.
 *
 * @param projectPath - the project being created
 * @param create - the creation itself
 * @returns whatever the creation resolves to
 */
export async function whileCreating<T>(projectPath: string, create: () => Promise<T>): Promise<T> {
    running.set(projectPath, (running.get(projectPath) ?? 0) + 1);
    changed();
    try {
        return await create();
    } finally {
        const left = (running.get(projectPath) ?? 1) - 1;
        if (left > 0) running.set(projectPath, left);
        else running.delete(projectPath);
        changed();
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

/** The paths of every creation running in this window. */
export function runningCreations(): string[] {
    return [...running.keys()];
}

/**
 * Be told whenever a creation starts or ends.
 *
 * @param listener - called on every change
 * @returns a disposable that stops the calls
 */
export function onCreationsChanged(listener: () => void): { dispose: () => void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
}
