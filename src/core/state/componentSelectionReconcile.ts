/**
 * Keep `componentSelections` from disagreeing with what is actually installed.
 *
 * `componentSelections` records INTENT, but three consumers treat it as fact:
 * Configure builds its section rail from it (`useSelectedComponents`), the
 * dashboard's mesh check reads it (defensively, alongside the instances), and
 * `projectResetService` rebuilds the whole component list from it.
 *
 * Nothing on the live add path maintained it. The dashboard adds through
 * `appBuilderComponentRunner.addAppBuilderComponent`, which never touched
 * selections; the only code that did lived in a parallel add/remove service left
 * over from the singular model, which had no callers at all (deleted with this
 * fix).
 * So a mesh or integration added from the dashboard was installed, deployed and
 * recorded in the keyed map, while the selection lists stayed empty.
 *
 * The visible symptom was a missing "API Mesh" section in Configure. The costly
 * one is reset: its own comment promises to re-clone a dashboard-added app
 * "instead of dropping it", and an empty list is precisely what drops it.
 *
 * ADDITIVE ONLY, deliberately. "Installed implies selected" holds; the converse
 * does not — a mesh chosen in the wizard but not yet installed is a legitimate
 * mid-creation state, and an explicit removal already expresses itself by
 * deleting the component instance and its keyed entry (so there is nothing left
 * here to re-add).
 *
 * @module core/state/componentSelectionReconcile
 */

import { isMeshComponentId } from '@/core/constants';
import type { Project } from '@/types/base';

/** Append `id` to `list` when absent. Returns whether it was added. */
function ensureListed(list: string[], id: string): boolean {
    if (list.includes(id)) return false;
    list.push(id);
    return true;
}

/**
 * Fold everything actually installed into `project.componentSelections`, in place.
 *
 * - a component INSTANCE that is a mesh → `dependencies` (where the persisted
 *   mesh selection has always lived — ADR-011)
 * - a keyed `kind: 'integration'` entry → `appBuilder`
 *
 * @param project - mutated in place, like the other load-time migrations
 * @returns whether anything changed — lets a caller skip a pointless save
 */
export function reconcileComponentSelections(project: Project): boolean {
    const selections = project.componentSelections ?? {};
    const dependencies = [...(selections.dependencies ?? [])];
    const appBuilder = [...(selections.appBuilder ?? [])];
    let changed = false;

    for (const [id, instance] of Object.entries(project.componentInstances ?? {})) {
        if (instance?.subType === 'mesh' || isMeshComponentId(id)) {
            changed = ensureListed(dependencies, id) || changed;
        }
    }

    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        // Mesh entries are NOT listed here: the mesh rides `dependencies`, and
        // naming it in both would make reset clone it twice.
        if (state?.kind === 'integration') {
            changed = ensureListed(appBuilder, id) || changed;
        }
    }

    if (!changed) return false;

    project.componentSelections = { ...selections, dependencies, appBuilder };
    return true;
}
