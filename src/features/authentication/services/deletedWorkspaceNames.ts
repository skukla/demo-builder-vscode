/**
 * The workspace names a Console project gave up recently, kept so a new workspace
 * does not take one while Adobe is still deleting the old one.
 *
 * A workspace's machine name is the last part of its Runtime namespace
 * (`<org>-<project>-<workspace>`), so a workspace created under a name deleted
 * minutes ago gets a namespace with the SAME name as the one being torn down.
 * Measured on 2026-10-05: an ERP removed and added again three minutes later
 * deployed its actions and then failed on its timer, Adobe's alarms service
 * answering `401 "The supplied authentication is invalid"`; the same deploy an
 * hour later went through. Removing and adding again 36 minutes apart had worked
 * the same morning. Console's workspace list drops a deleted workspace at once, so
 * nothing else says the name is still busy.
 *
 * A name is held for {@link NAME_REST_MS}; until then the new workspace is
 * numbered (`JustriteERP1`) as for any taken name.
 *
 * @module features/authentication/services/deletedWorkspaceNames
 */

import type { SavedState } from './orgServicesSavedCatalog';

/** How long a deleted workspace's name is not given out again. */
export const NAME_REST_MS = 30 * 60_000;

interface DeletedName {
    name: string;
    deletedAt: number;
}

const storeKey = (projectId: string): string => `demoBuilder.deletedWorkspaceNames.${projectId}`;

/** A name as Adobe compares it: letters and digits, any case. */
const plain = (name: string): string => name.replace(/[^A-Za-z0-9]/g, '');

/** A store that lasts as long as the session, for a caller that has none. */
function memoryStore(): SavedState {
    const values = new Map<string, unknown>();
    return {
        get: <T>(key: string) => values.get(key) as T | undefined,
        update: (key, value) => {
            values.set(key, value);
            return Promise.resolve();
        },
    };
}

/** The recently deleted workspace names of each Console project. */
export class DeletedWorkspaceNames {
    constructor(
        private readonly store: SavedState = memoryStore(),
        private readonly now: () => number = Date.now,
    ) {}

    /** The names deleted in this project that are still resting. */
    resting(projectId: string): string[] {
        return this.fresh(projectId).map((entry) => entry.name);
    }

    /** Hold a deleted workspace's name, when it is known. A failed save costs only that. */
    async remember(projectId: string, name: string | undefined): Promise<void> {
        const held = plain(name ?? '');
        if (!held) return;
        const kept = this.fresh(projectId).filter((entry) => entry.name.toLowerCase() !== held.toLowerCase());
        try {
            await this.store.update(storeKey(projectId), [...kept, { name: held, deletedAt: this.now() }]);
        } catch {
            // The next add may then reuse the name; the deploy says so if Adobe refuses.
        }
    }

    private fresh(projectId: string): DeletedName[] {
        const saved = this.store.get<unknown>(storeKey(projectId));
        if (!Array.isArray(saved)) return [];
        const since = this.now() - NAME_REST_MS;
        return saved.filter(
            (entry): entry is DeletedName =>
                typeof entry?.name === 'string' &&
                typeof entry?.deletedAt === 'number' &&
                entry.deletedAt > since,
        );
    }
}
