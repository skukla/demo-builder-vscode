/**
 * A website or store view by its name in the store, for the engine's sentences (owner, 2026-11-15).
 * Its own file so the engine keeps to installing.
 *
 * @module features/data-installer/services/demoBuilderEngine/storeNames
 */

import type { DemoBuilderEngineDeps } from './engineDeps';
/**
 * A website or store view by its name in the store, as the Admin shows it (owner, 2026-11-15); the
 * code when the store no longer lists it or cannot be read. Read only here, where a pack is found
 * installed elsewhere, so an install that goes ahead reads nothing more.
 */
export async function nameInStore(deps: Pick<DemoBuilderEngineDeps, 'commerce'>, list: 'store/websites' | 'store/storeViews', code: string): Promise<string> {
    try {
        const commerce = await deps.commerce();
        if ('refusal' in commerce) return code;
        const read = await commerce.get(list);
        const items = Array.isArray(read) ? (read as Array<{ code?: unknown; name?: unknown }>) : [];
        const name = items.find((item) => item.code === code)?.name;
        return typeof name === 'string' && name.trim() !== '' ? name.trim() : code;
    } catch {
        return code;
    }
}
