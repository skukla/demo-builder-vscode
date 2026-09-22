/**
 * componentApiPicks — per-integration Adobe API attribution (the keyed store).
 *
 * A project holds N integrations; each may need its own Adobe APIs; they are
 * subscribed as ONE union on the single App Builder workspace. So a pick has to
 * remember WHICH integration wanted it — otherwise nothing can tell whether an
 * API is safe to drop, or say whose requirement a locked row belongs to.
 *
 * The wizard already knows this: `selectedConsoleApis` is
 * `Record<componentId, string[]>` (`types/webview.ts`). The attribution is lost
 * at the persist boundary, where `wizardHelpers` unions the record into a flat
 * `project.additionalConsoleApis`. This module is the keyed store that ends the
 * flattening, plus {@link resolveDesiredApis} — the read-time union that
 * replaces it.
 *
 * **Why not an existing per-component store.** `componentConfigs[id]` is not
 * per-component: `resolveEnvVarValue` iterates EVERY component's config for a
 * key and `String()`s the hit into `.env` (deliberate cross-boundary sharing) —
 * unattributed by design, and destined for a file these codes have no business
 * in. `appBuilderComponents[id]` is the deploy-outcome record, written by every
 * deploy path; intent parked there survives only as long as each writer spreads
 * correctly, and a dropped spread would silently shrink the union and
 * UNSUBSCRIBE live APIs. This store has exactly one writer.
 *
 * @module core/state/componentApiPicks
 */

/**
 * The narrow shape these helpers read. Deliberately NOT `Project`: callers like
 * `ensureMeshApiSubscribed` hold a purpose-built subset, and demanding a whole
 * project would force them to fabricate fields they have no business carrying.
 */
export interface ApiPickSource {
    componentApiPicks?: Record<string, string[]>;
    /** LEGACY — pre-attribution picks; read only when no keyed map exists. */
    additionalConsoleApis?: string[];
    /** Which owners have a workspace of their own (AB-23), and so are not the project's. */
    appBuilderComponents?: Record<string, { workspace?: unknown }>;
}

/** Whether an owner's picks belong to a workspace of its own rather than the project's. */
function hasOwnWorkspace(project: ApiPickSource, owner: string): boolean {
    return Boolean(project.appBuilderComponents?.[owner]?.workspace);
}

/**
 * Owner key for picks that predate attribution. Migrated projects' flat
 * `additionalConsoleApis` land here because their real owner is unrecoverable —
 * no owner is guessed. Mirrors the wizard's `RESERVED_EXISTING_KEY`, which
 * models the same "we already lost this once" case in edit-mode seeding.
 */
export const UNATTRIBUTED_PICKS_KEY = '__existing__';

/**
 * The `desired` extras handed to `subscribeRequiredApis`, which adds the baseline
 * and the catalog `requiredApis` on top.
 *
 * WITHOUT a component id this is the PROJECT workspace's list: every owner's picks
 * except those of an integration with a workspace of its own, whose APIs belong there
 * (found 2026-09-21 — Production was being handed them). WITH one it is that
 * component's picks — because under AB-23 a component has a workspace of its own
 * and subscribing the project's union there would entitle its credential to APIs
 * belonging to integrations that do not live in it. Each of those is a product
 * profile attached to a credential nothing in that workspace uses.
 *
 * UNATTRIBUTED picks ride along with every component, deliberately. Their owner
 * is unrecoverable by construction ({@link UNATTRIBUTED_PICKS_KEY}), so leaving
 * them out of a NEW workspace would silently drop an API an SC added by hand,
 * and there is no way to tell which component wanted it.
 *
 * Falls back to the legacy flat field when no keyed map exists, so a project
 * loaded by a path that has not migrated still reports its real set.
 *
 * This used to warn that "the subscribe PUT sets extras to EXACTLY this list, so
 * an empty union unsubscribes everything". That stopped being true on 2026-09-19,
 * when the subscriber began merging, and the claim is checkable rather than taken
 * on trust: `buildSubscriptionList` keeps every current subscription whose code is
 * not in `removing` and only ADDS from the needed list, `reconcileCredential` is
 * the single PUT site and is shared by both credential paths, and
 * `subscriptionList.test.ts` pins the exact case the old warning described —
 * "drops only what is being removed" passes an EMPTY needed list and ACCS-REST-API
 * survives with its profile. Narrowing this list adds fewer, never removes.
 *
 * @param project - the project to read (keyed map wins over the legacy field)
 * @param componentId - narrow to this component's picks plus the unattributed ones
 * @returns deduped sdk codes; empty when nothing is picked
 */
export function resolveDesiredApis(project: ApiPickSource, componentId?: string): string[] {
    const keyed = project.componentApiPicks;
    if (keyed) {
        const owners = componentId
            ? [componentId, UNATTRIBUTED_PICKS_KEY]
            : Object.keys(keyed).filter((owner) => !hasOwnWorkspace(project, owner));
        return [...new Set(owners.flatMap((owner) => keyed[owner] ?? []))];
    }
    return [...new Set(project.additionalConsoleApis ?? [])];
}

/**
 * One-time migration: flat `additionalConsoleApis` → the keyed map, under
 * {@link UNATTRIBUTED_PICKS_KEY}.
 *
 * Pure — returns a new project rather than mutating, so a loader can migrate a
 * read without writing. A project that is already keyed, or that never had
 * picks, comes back unchanged (no empty `{}`, which would persist a meaningless
 * field into every manifest).
 *
 * @param project - the project to migrate
 * @returns the project, keyed
 */
export function migrateApiPicks<T extends ApiPickSource>(project: T): T {
    if (project.componentApiPicks) {
        return project;
    }
    const legacy = project.additionalConsoleApis;
    if (!legacy?.length) {
        return project;
    }
    return { ...project, componentApiPicks: { [UNATTRIBUTED_PICKS_KEY]: [...legacy] } };
}

/**
 * Reconcile a user-edited DESIRED union back onto the keyed map, preserving
 * attribution.
 *
 * Manage APIs shows the union of every integration's picks and Apply hands back
 * the whole edited set. The handler used to persist that as
 * `{ [UNATTRIBUTED_PICKS_KEY]: desired }`, which is correct about the union and
 * destroys everything else: after one Apply no code has an owner, so nothing can
 * answer "is this API still needed if I remove that integration?" — the question
 * this module exists for. It went unnoticed while nothing attributed picks; the
 * dashboard Add flow started doing so on 2026-08-04.
 *
 * The reconciliation:
 * - a code still desired keeps every owner that claimed it;
 * - a code no longer desired is dropped from ALL owners (a single owner keeping
 *   it would put it straight back into the next reconcile union, undoing the
 *   user's removal);
 * - a code with no prior owner lands in {@link UNATTRIBUTED_PICKS_KEY} — it was
 *   added from the union view, so there is genuinely no owner to infer, and
 *   guessing one is worse than recording that we do not know;
 * - an owner left with nothing is removed rather than kept as an empty key;
 * - an integration with a workspace of its own is not in the list being edited, so
 *   its picks are kept exactly as they are (AB-23).
 *
 * @param project - the project whose picks are being edited (legacy flat field migrates)
 * @param desired - the full desired extras set, exactly as the user left it
 * @returns the new keyed map (the caller assigns and saves)
 */
export function applyDesiredApis(
    project: ApiPickSource,
    desired: string[],
): Record<string, string[]> {
    const wanted = new Set(desired);
    const current = project.componentApiPicks ?? {
        [UNATTRIBUTED_PICKS_KEY]: [...new Set(project.additionalConsoleApis ?? [])],
    };

    const next: Record<string, string[]> = {};
    const claimed = new Set<string>();
    for (const [owner, codes] of Object.entries(current)) {
        // Not in the list being edited: its APIs live on its own workspace.
        if (hasOwnWorkspace(project, owner)) {
            next[owner] = codes;
            continue;
        }
        const kept = [...new Set(codes)].filter((code) => wanted.has(code));
        if (kept.length === 0) continue;
        next[owner] = kept;
        for (const code of kept) claimed.add(code);
    }

    const unowned = desired.filter((code) => !claimed.has(code));
    if (unowned.length > 0) {
        next[UNATTRIBUTED_PICKS_KEY] = [
            ...new Set([...(next[UNATTRIBUTED_PICKS_KEY] ?? []), ...unowned]),
        ];
    }
    return next;
}
