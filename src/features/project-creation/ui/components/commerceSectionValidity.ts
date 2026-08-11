/**
 * Which Commerce sub-step owns which fields, and whether each one is satisfied.
 *
 * The wizard's Commerce area renders ONE `ConnectStoreStepContent` over three
 * slices of the same service-group list. Rendering was already sliced here;
 * VALIDITY was not — `useComponentConfig` produced a single whole-form verdict
 * that became `commerceConnectValid`, and `commerceSections` used that one
 * boolean both to mark Connection done and to unlock Catalog.
 *
 * On PaaS that deadlocked: `ADOBE_CATALOG_API_KEY` and
 * `ADOBE_COMMERCE_ENVIRONMENT_ID` are required, have no default, are seeded by no
 * package, and render only in the Catalog sub-step — so they were empty, the
 * whole-form verdict was false, Connection never completed, and Catalog stayed
 * locked. A locked rail tab is not clickable and Continue reads the same boolean,
 * so the only place to fill them was unreachable.
 *
 * Each section now answers for its own fields. Scoping only the Connection gate
 * would have swapped the deadlock for silent data loss, because
 * `isCommerceStepComplete` returns `true` unconditionally for `catalog`.
 *
 * Slices the error map `useComponentConfig` already produces rather than
 * re-deriving required/URL/pattern rules — one validation implementation, sliced
 * two ways.
 *
 * @module features/project-creation/ui/components/commerceSectionValidity
 */

import {
    CONNECTION_FIELDS,
    STORE_GROUP_IDS,
    isStoreCodeField,
} from '@/features/components/config/storeFieldHelpers';
import type { ServiceGroup } from '@/features/components/ui/hooks/useComponentConfig';

/** Which slice of the commerce config a caller wants. */
export type ConnectStoreSection = 'connection' | 'business-structure' | 'catalog';

/** The two groups that carry the Commerce connection + store scope. */
const CONNECTION_GROUP_IDS: ReadonlySet<string> = new Set([
    STORE_GROUP_IDS.ACCS,
    STORE_GROUP_IDS.PAAS,
]);

/** Whether a group carries the Commerce connection + store scope. */
export function isConnectionGroup(groupId: string): boolean {
    return CONNECTION_GROUP_IDS.has(groupId);
}

/**
 * Filter the visible service groups down to one section's fields.
 *
 * The hooks stay fully mounted regardless of section — only what renders is
 * filtered, so store-discovery/config state persists across tab switches.
 *
 * - connection: connection groups, CONNECTION_FIELDS only (no store-code cascade)
 * - business-structure: connection groups, the store-code cascade only
 * - catalog: the non-connection groups (already gated on store selection upstream)
 *
 * @param groups - the full service-group list
 * @param section - the slice to keep
 * @returns groups containing only that section's fields, empties dropped
 */
export function filterGroupsForSection(
    groups: ServiceGroup[],
    section: ConnectStoreSection,
): ServiceGroup[] {
    if (section === 'catalog') {
        return groups.filter((group) => !CONNECTION_GROUP_IDS.has(group.id));
    }

    const keepField =
        section === 'connection'
            ? (key: string) => CONNECTION_FIELDS.has(key)
            : (key: string) => isStoreCodeField(key);

    return groups
        .filter((group) => CONNECTION_GROUP_IDS.has(group.id))
        .map((group) => ({
            ...group,
            fields: group.fields.filter((field) => keepField(field.key)),
        }))
        .filter((group) => group.fields.length > 0);
}

/** Per-section verdicts. A section with no fields is valid, not unfinished. */
export type CommerceSectionValidity = Record<ConnectStoreSection, boolean>;

const SECTIONS: ConnectStoreSection[] = ['connection', 'business-structure', 'catalog'];

/**
 * Decide, per sub-step, whether every field that sub-step RENDERS is satisfied.
 *
 * A field that no section renders is ignored rather than charged to a section.
 * Blocking on a field the user cannot reach is the exact defect this replaces —
 * only optional keys fall in that gap today (`ADOBE_COMMERCE_ADMIN_URL` is in a
 * connection group but is neither a connection field nor a store code).
 *
 * @param serviceGroups - the full group list from `useComponentConfig`
 * @param validationErrors - that hook's error map, keyed by field key
 * @returns one boolean per sub-step
 */
export function computeCommerceSectionValidity(
    serviceGroups: ServiceGroup[],
    validationErrors: Record<string, string>,
): CommerceSectionValidity {
    const validity = {} as CommerceSectionValidity;

    for (const section of SECTIONS) {
        const keys = filterGroupsForSection(serviceGroups, section).flatMap((group) =>
            group.fields.map((field) => field.key),
        );
        validity[section] = keys.every((key) => validationErrors[key] === undefined);
    }
    return validity;
}
