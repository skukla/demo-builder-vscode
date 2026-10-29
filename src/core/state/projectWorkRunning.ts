/**
 * The creations, resets and republishes running on each project in this window, by
 * project path, and a signal when one starts or ends.
 *
 * The projects list shows a project being created from the moment its creation
 * starts (PL-82), and a project being reset or republished for as long as that runs. The
 * project's file cannot say so: a project's status is never written to it (the
 * loader sets `stopped` or `running`), and for an Edge Delivery project the file
 * does not exist until the storefront is set up, minutes in. So the list reads this,
 * and reloads when it changes. Resets were missing until 2026-10-28: a reset set the
 * status on its own in-memory copy of the project, which the list never sees, so
 * three cards resetting at once all still said "Needs reset".
 *
 * Counted, not a set: an agent's creation is listed for its whole run and the
 * creation step inside it lists the same path again; the inner end must not unlist
 * the outer run. In memory on purpose: a window that closes takes its work with it.
 *
 * @module core/state/projectWorkRunning
 */

/**
 * What can be running on a project, largest job first: a reset republishes as one of
 * its steps, so it is the one named. All three are `ProjectStatus` values.
 */
const WORK_ORDER = ['creating', 'resetting', 'republishing'] as const;
export type ProjectWork = (typeof WORK_ORDER)[number];

const running = new Map<string, Map<ProjectWork, number>>();
const listeners = new Set<() => void>();

function changed(): void {
    for (const listener of listeners) listener();
}

function adjust(projectPath: string, work: ProjectWork, by: 1 | -1): void {
    const counts = running.get(projectPath) ?? new Map<ProjectWork, number>();
    const left = (counts.get(work) ?? 0) + by;
    if (left > 0) counts.set(work, left);
    else counts.delete(work);
    if (counts.size > 0) running.set(projectPath, counts);
    else running.delete(projectPath);
    changed();
}

/**
 * Run a creation, reset or republish, listed as running until it settles, success or failure.
 *
 * @param projectPath - the project being worked on
 * @param work - what is being done to it
 * @param run - the work itself
 * @returns whatever the work resolves to
 */
export async function whileRunning<T>(
    projectPath: string,
    work: ProjectWork,
    run: () => Promise<T>,
): Promise<T> {
    adjust(projectPath, work, 1);
    try {
        return await run();
    } finally {
        adjust(projectPath, work, -1);
    }
}

/**
 * What is running on a project in this window, the largest job when several are
 * (a creation, then a reset, then a republish).
 *
 * @param projectPath - the project's path
 * @returns the work running, or undefined when none is
 */
export function runningWork(projectPath: string): ProjectWork | undefined {
    const counts = running.get(projectPath);
    return counts ? WORK_ORDER.find((work) => counts.has(work)) : undefined;
}

/** The paths of every creation running in this window. */
export function runningCreations(): string[] {
    return [...running].filter(([, counts]) => counts.has('creating')).map(([p]) => p);
}

/**
 * Be told whenever a creation, reset or republish starts or ends.
 *
 * @param listener - called on every change
 * @returns a disposable that stops the calls
 */
export function onWorkChanged(listener: () => void): { dispose: () => void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
}
