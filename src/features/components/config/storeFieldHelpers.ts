/**
 * Store field classification helpers
 *
 * Shared predicates, constant sets and the Connection / Business Structure split
 * used by BOTH commerce surfaces — the wizard's ConnectStoreStepContent and the
 * dashboard's Configure screen — to decide how commerce store fields are grouped
 * and progressively disclosed.
 *
 * The split lives here rather than in either feature because both consume it and
 * features do not import each other (see src/features/CLAUDE.md).
 *
 * @module features/components/config/storeFieldHelpers
 */

import {
    PAAS_URL,
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_GRAPHQL_ENDPOINT as ACCS_ENDPOINT_KEY,
} from './envVarKeys';

/** Service group IDs for PaaS and ACCS commerce backends */
export const STORE_GROUP_IDS = {
    ACCS: 'accs',
    PAAS: 'adobe-commerce',
} as const;

/** Whether a field is a website code field (where store selection row appears) */
export const isWebsiteCodeField = (key: string): boolean =>
    key === PAAS_WEBSITE_CODE || key === ACCS_WEBSITE_CODE;

/** Whether a field is any store code field (website, store, or store view) */
export const isStoreCodeField = (key: string): boolean =>
    key === PAAS_WEBSITE_CODE || key === PAAS_STORE_CODE || key === PAAS_STORE_VIEW_CODE ||
    key === ACCS_WEBSITE_CODE || key === ACCS_STORE_CODE || key === ACCS_STORE_VIEW_CODE;

/**
 * Connection fields — always shown. Everything else is hidden until prerequisites are met.
 *
 * PAAS_GRAPHQL_ENDPOINT is included even though it's auto-derived from PAAS_URL: it belongs to
 * the 'adobe-commerce' store group, so without this it would stay hidden until credentials
 * complete autoDetectKey and then pop in BETWEEN the URL and admin fields — a layout jump.
 * Treating it as a connection field (like the ACCS endpoint) renders it in place from the start.
 */
export const CONNECTION_FIELDS = new Set<string>([
    ACCS_ENDPOINT_KEY, PAAS_URL, PAAS_GRAPHQL_ENDPOINT, PAAS_ADMIN_USERNAME, PAAS_ADMIN_PASSWORD,
]);

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
 * The minimum a group must look like to be sliced. Both surfaces' `ServiceGroup`
 * satisfy it structurally, which is what lets one splitter serve both without
 * either feature importing the other's types.
 */
interface SliceableGroup {
    id: string;
    fields: { key: string }[];
}

/**
 * Filter service groups down to one section's fields.
 *
 * - connection: connection groups, CONNECTION_FIELDS only (no store-code cascade)
 * - business-structure: connection groups, the store-code cascade only
 * - catalog: everything that is NOT a connection group
 *
 * A connection-group field that is neither a connection field nor a store code
 * belongs to `connection` — it is part of reaching the instance, and leaving it
 * unclaimed is how the wizard ends up rendering ADOBE_COMMERCE_ADMIN_URL nowhere.
 *
 * @param groups - the full service-group list
 * @param section - the slice to keep
 * @returns groups containing only that section's fields, empties dropped
 */
export function filterGroupsForSection<T extends SliceableGroup>(
    groups: T[],
    section: ConnectStoreSection,
): T[] {
    if (section === 'catalog') {
        return groups.filter((group) => !isConnectionGroup(group.id));
    }

    const keepField =
        section === 'connection'
            ? (key: string) => !isStoreCodeField(key)
            : (key: string) => isStoreCodeField(key);

    return groups
        .filter((group) => isConnectionGroup(group.id))
        .map((group) => ({ ...group, fields: group.fields.filter((f) => keepField(f.key)) }))
        .filter((group) => group.fields.length > 0);
}
