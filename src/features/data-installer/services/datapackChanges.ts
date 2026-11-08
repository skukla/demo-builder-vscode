/**
 * "The packs changed": one signal every open Datapacks screen follows (owner, 2026-11-07, F66).
 *
 * The Datapack Library and a project's Datapacks can be open at once, beside the wizard's Datapacks
 * step. Each read its list again only after its own actions, so a rename in the library did not
 * show in the project's screen, nor a save there in the library, nor anything an agent did while a
 * screen was open. Every pack change now announces itself here, and every screen showing packs
 * listens and reads its list again (`DATAPACK_LIST_CHANGED_MESSAGE`), as it already did for a
 * settings change.
 *
 * Changes are announced where they happen: the import map's changing actions
 * (`announcingChanges`, wrapped where the map is built, so the panel and the agent tools are one
 * path) and an import or removal job when it ends (`importJobWatch`).
 *
 * @module features/data-installer/services/datapackChanges
 */

import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';

type Listener = () => void;

/** Who is following: one per open Datapacks screen and wizard. */
const listeners = new Set<Listener>();

/**
 * Follow pack changes until disposed.
 *
 * @returns what stops following, for the panel's disposables
 */
export function onDatapacksChanged(listener: Listener): { dispose: () => void } {
    listeners.add(listener);
    return { dispose: () => void listeners.delete(listener) };
}

/** The packs changed: tell everyone following. One listener failing does not stop the rest. */
export function announceDatapacksChanged(): void {
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch {
            // A closed screen's send can fail; the others still need to hear.
        }
    }
}

/**
 * The map with these actions announcing a change once they succeed. A refusal (`success: false`)
 * changed nothing, so it announces nothing.
 *
 * @param keys - the actions that change packs or which pack a project holds
 */
export function announcingChanges<M extends HandlerMap>(
    map: M,
    keys: readonly (keyof M & string)[],
): M {
    const wrapped: HandlerMap = { ...map };
    for (const key of keys) {
        const handler = map[key];
        // A key the map lacks is a typo, and would announce nothing for the action it meant.
        if (typeof handler !== 'function') throw new Error(`announcingChanges: the map has no ${key}`);
        wrapped[key] = async (
            context: HandlerContext,
            payload?: unknown,
        ): Promise<HandlerResponse> => {
            const result: HandlerResponse = await handler(context, payload);
            if (result?.success !== false) announceDatapacksChanged();
            return result;
        };
    }
    return wrapped as M;
}
