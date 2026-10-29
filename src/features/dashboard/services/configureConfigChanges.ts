/**
 * What a Configure save changes (PL-76).
 *
 * Configure used to send EVERY value it had loaded, and the extension replaced the
 * project's settings with that map. A window opened before another surface changed
 * the project (an agent's store scope, a rename, an integration removed) then put
 * the old values back on Save. Now the screen sends only the values that differ
 * from what it loaded, and the extension lays them over the settings as they are
 * when the save runs.
 *
 * Both halves are pure and `vscode`-free: the webview diffs, the extension applies.
 *
 * @module features/dashboard/services/configureConfigChanges
 */

import type { ComponentConfigs } from '@/types/webview';

/**
 * The values the SC changed since the screen loaded.
 *
 * A key that was loaded and is now missing counts as cleared (`''`), the way a
 * cleared field is written today.
 *
 * @param loaded - the values the screen was seeded with
 * @param current - the values it holds now
 * @returns per component, only the keys whose value differs
 */
export function diffConfigs(loaded: ComponentConfigs, current: ComponentConfigs): ComponentConfigs {
    const changes: ComponentConfigs = {};
    for (const componentId of new Set([...Object.keys(loaded), ...Object.keys(current)])) {
        const before = loaded[componentId] ?? {};
        const after = current[componentId] ?? {};
        const changed: ComponentConfigs[string] = {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
            const value = key in after ? after[key] : '';
            if (!sameValue(before[key], value)) changed[key] = value;
        }
        if (Object.keys(changed).length > 0) changes[componentId] = changed;
    }
    return changes;
}

/**
 * Lay a save's changes over the settings as they are now.
 *
 * @param base - the project's settings when the save runs (not mutated)
 * @param changes - what the SC changed
 * @returns a new map: `base` with each changed key replaced
 */
export function applyConfigChanges(
    base: ComponentConfigs,
    changes: ComponentConfigs,
): ComponentConfigs {
    const merged: ComponentConfigs = {};
    for (const [componentId, values] of Object.entries(base)) merged[componentId] = { ...values };
    for (const [componentId, values] of Object.entries(changes)) {
        merged[componentId] = { ...(merged[componentId] ?? {}), ...values };
    }
    return merged;
}

/** A loaded `'5'` and a typed `5` are the same value; `undefined` and `''` too. */
function sameValue(a: unknown, b: unknown): boolean {
    return String(a ?? '') === String(b ?? '');
}
