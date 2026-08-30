/**
 * The ONE ComponentRegistryManager for the session.
 *
 * Same shape and same reason as `prerequisitesManagerInstance`. The manager
 * memoises `transformToGroupedStructure(rawRegistry)` in `transformedRegistry`,
 * and both context factories build it PER INCOMING MESSAGE — so the memo was
 * recomputed every time and never paid for itself.
 *
 * Worth being blunt about the history: this class was moved INTO those factories
 * on 2026-08-29 to end four files each constructing their own. That removed three
 * dynamic imports and an 18-suite module-mock wall, both real. It did nothing for
 * the memo — four-per-call became one-per-message, and neither shares. The
 * lifetime rule added the same day is what named it.
 *
 * Nothing here is per-project: the constructor takes only the extension path and
 * reads config shipped with the extension.
 *
 * @module features/components/services/componentRegistryInstance
 */

import { ComponentRegistryManager } from './ComponentRegistryManager';

let instance: ComponentRegistryManager | undefined;

/**
 * The session's ComponentRegistryManager, built on first use.
 *
 * @param extensionPath - identical on every call within a session, so the first
 *   caller's value wins.
 */
export function getComponentRegistryManager(extensionPath: string): ComponentRegistryManager {
    if (!instance) {
        instance = new ComponentRegistryManager(extensionPath);
    }
    return instance;
}

/** Drop the instance — tests, and the host-reload path. */
export function resetComponentRegistryManager(): void {
    instance = undefined;
}
