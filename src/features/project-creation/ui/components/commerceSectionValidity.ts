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
 * two ways. The SPLIT itself lives in `features/components/config/storeFieldHelpers`
 * so the Configure screen can use it too without one feature importing another.
 *
 * @module features/project-creation/ui/components/commerceSectionValidity
 */

import {
    filterGroupsForSection,
    type ConnectStoreSection,
} from '@/features/components/config/storeFieldHelpers';
import type { ServiceGroup } from '@/features/components/ui/hooks/useComponentConfig';

export {
    filterGroupsForSection,
    isConnectionGroup,
} from '@/features/components/config/storeFieldHelpers';
export type { ConnectStoreSection } from '@/features/components/config/storeFieldHelpers';

/** Per-section verdicts. A section with no fields is valid, not unfinished. */
export type CommerceSectionValidity = Record<ConnectStoreSection, boolean>;

// `credentials` is listed even though its fields are optional today. The rule this
// file exists to enforce is that every RENDERED field is charged to exactly one
// section — leaving a rendered section unlisted is how a required field ends up
// gating nothing, which is the inverse of the deadlock described above.
const SECTIONS: ConnectStoreSection[] = [
    'connection',
    'credentials',
    'business-structure',
    'catalog',
];

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
