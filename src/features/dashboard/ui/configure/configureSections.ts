/**
 * Configure Section Model
 *
 * ONE ordered list of everything the Configure screen renders. Before this, sections
 * came from three unrelated sources — the service groups (`useServiceGroups`), two
 * hardcoded blocks in `ConfigureScreen` ("Project" and the EDS-only "Authoring"), and
 * one per App Builder catalog entry (`AppBuilderComponentFieldsSection`) — and only the
 * service groups reached the nav. The "Sections" sidebar was therefore not the list of
 * sections on screen. A rail has to show every section, so they had to become one list.
 *
 * Pure: no React, no DOM. The service groups arrive ALREADY filtered and sorted by
 * `useServiceGroups` (empty groups dropped, API Mesh dropped when no mesh component is
 * selected); this module preserves that order and adds nothing to it.
 *
 * @module features/dashboard/ui/configure/configureSections
 */

import type { AppBuilderComponentFieldGroup } from './appBuilderComponentFieldModel';
import type { ServiceGroup, UniqueField } from './configureTypes';
import type { StepTab } from '@/core/ui/components/navigation/StepRail';
import {
    filterGroupsForSection,
    isConnectionGroup,
    type ConnectStoreSection,
} from '@/features/components/config/storeFieldHelpers';

/** Which of the four sources a section came from. Callers should not need to care. */
export type ConfigureSectionKind = 'project' | 'serviceGroup' | 'appBuilderComponent' | 'authoring';

/** One configurable section of the Configure screen, whatever its source. */
export interface ConfigureSection {
    /** The existing anchor id (`project-info`, `<group.id>`, `appBuilderComponent-<id>`, `authoring-experience`). */
    id: string;
    /** Tab / heading label. */
    label: string;
    /** Source of this section. */
    kind: ConfigureSectionKind;
    /** Every required field in the section is complete (vacuously true when there are none). */
    isComplete: boolean;
    /** How many REQUIRED fields the section has (optional fields are not counted). */
    requiredTotal: number;
    /** How many of those required fields are complete. */
    requiredComplete: number;
    /**
     * At least one field in this section carries a validation error, so Save is blocked
     * by something in HERE. Distinct from `!isComplete`: a field can hold a value and
     * still be invalid (a malformed URL). Only this flag reaches the rail, because with
     * one section on screen the offending field is otherwise unfindable.
     */
    hasError: boolean;
}

export interface BuildConfigureSectionsInput {
    /** Service groups, already filtered and ordered by `useServiceGroups`. */
    serviceGroups: ServiceGroup[];
    /** Whether a field currently holds a value (ConfigureScreen's `isFieldComplete`). */
    isFieldComplete: (field: UniqueField) => boolean;
    /** Whether a field currently carries a validation error (keys of `validationErrors`). */
    fieldHasError: (field: UniqueField) => boolean;
    /** App Builder render groups from `buildAppBuilderComponentFieldGroups`. */
    appBuilderGroups: AppBuilderComponentFieldGroup[];
    /** EDS project — gates the Authoring section. */
    isEds: boolean;
    /** The project name is set and passes validation. */
    isProjectNameValid: boolean;
}

/** A section with no required fields of its own — complete by construction. */
function unvalidatedSection(
    id: string,
    label: string,
    kind: ConfigureSectionKind,
): ConfigureSection {
    return {
        id,
        label,
        kind,
        isComplete: true,
        requiredTotal: 0,
        requiredComplete: 0,
        hasError: false,
    };
}

/**
 * Convert one service group into a section, counting only its REQUIRED fields.
 *
 * This is the completeness rule formerly carried by `toNavigationSection`, which was
 * retired: it existed three times over. Moved here so there is one copy.
 *
 * `hasError` covers ALL the group's fields, not just the required ones — an optional URL
 * that is malformed blocks Save exactly as a required one does.
 *
 * @param group - The service group
 * @param isFieldComplete - Whether a field currently holds a value
 * @param fieldHasError - Whether a field currently carries a validation error
 * @returns The section for that group
 */
function toServiceGroupSection(
    group: ServiceGroup,
    isFieldComplete: (field: UniqueField) => boolean,
    fieldHasError: (field: UniqueField) => boolean,
): ConfigureSection {
    const requiredFields = group.fields.filter(f => f.required);
    const requiredComplete = requiredFields.filter(f => isFieldComplete(f)).length;

    return {
        id: group.id,
        label: group.label,
        kind: 'serviceGroup',
        isComplete: requiredComplete === requiredFields.length,
        requiredTotal: requiredFields.length,
        requiredComplete,
        hasError: group.fields.some(f => fieldHasError(f)),
    };
}

/**
 * The rail section id for one slice of a connection group.
 *
 * `connection` keeps the bare group id, so every existing anchor, test and
 * remembered tab selection still resolves. Only the new slice is suffixed.
 */
export function slicedSectionId(groupId: string, section: ConnectStoreSection): string {
    return section === 'connection' ? groupId : `${groupId}:${section}`;
}

/**
 * One rail section for a slice of a connection group.
 *
 * Completion and error counts come from the slice's OWN fields. Counting the whole
 * group in both tabs would show "1 of 4" on a tab holding one field, and would put
 * an error badge on a tab where the offending field cannot be seen — the exact
 * unfindability the `hasError` flag exists to prevent.
 */
function toSlicedSection(
    group: ServiceGroup,
    section: ConnectStoreSection,
    label: string,
    isFieldComplete: (field: UniqueField) => boolean,
    fieldHasError: (field: UniqueField) => boolean,
): ConfigureSection {
    // `connection` carries its credentials, matching what its body renders.
    const sections: ConnectStoreSection[] =
        section === 'connection' ? ['connection', 'credentials'] : [section];
    const fields = sections.flatMap((s) => filterGroupsForSection([group], s)[0]?.fields ?? []);

    const requiredFields = fields.filter((f) => f.required);
    const requiredComplete = requiredFields.filter((f) => isFieldComplete(f)).length;

    return {
        id: slicedSectionId(group.id, section),
        label,
        kind: 'serviceGroup',
        isComplete: requiredComplete === requiredFields.length,
        requiredTotal: requiredFields.length,
        requiredComplete,
        hasError: fields.some((f) => fieldHasError(f)),
    };
}

/**
 * Build the ordered list of every section the Configure screen renders.
 *
 * Order matches the render order: Project → service groups → App Builder components →
 * Authoring.
 *
 * @param input - The four sources plus the two flags that gate them
 * @returns Ordered sections; always at least the Project section
 */
export function buildConfigureSections({
    serviceGroups,
    isFieldComplete,
    fieldHasError,
    appBuilderGroups,
    isEds,
    isProjectNameValid,
}: BuildConfigureSectionsInput): ConfigureSection[] {
    // The project name is the section's one required field: it is always populated, so
    // "complete" here means "valid" (a duplicate or malformed name is what makes it not).
    const sections: ConfigureSection[] = [
        {
            id: 'project-info',
            label: 'Project',
            kind: 'project',
            isComplete: isProjectNameValid,
            requiredTotal: 1,
            requiredComplete: isProjectNameValid ? 1 : 0,
            hasError: !isProjectNameValid,
        },
    ];

    for (const group of serviceGroups) {
        if (isConnectionGroup(group.id)) {
            // The Commerce group is TWO jobs — reaching the instance, and choosing
            // the scope within it — and they now get a rail tab each. Accounting is
            // split with them, or a tab's badge would count the other tab's fields.
            //
            // NEITHER tab locks. The earlier decision here preferred sub-sections
            // precisely because "two tabs would have to borrow the wizard's gating,
            // which is what deadlocked PaaS" — that gating is what must not come
            // along, not the tabs. On Configure every tab stays reachable, so a
            // required field can always be got at.
            sections.push(
                toSlicedSection(group, 'connection', group.label, isFieldComplete, fieldHasError),
            );
            // Only when there is a scope to choose. A connection group without the
            // store-code cascade — a partial catalog, or a backend that has none —
            // would otherwise get a permanently empty tab, which reads as a feature
            // that is broken rather than one that does not apply.
            if (filterGroupsForSection([group], 'business-structure').length > 0) {
                sections.push(
                    toSlicedSection(
                        group,
                        'business-structure',
                        'Business Structure',
                        isFieldComplete,
                        fieldHasError,
                    ),
                );
            }
            continue;
        }
        sections.push(toServiceGroupSection(group, isFieldComplete, fieldHasError));
    }

    // App Builder inputs are not validated anywhere today — `canSave` walks the service
    // groups only, so no App Builder field can block Save. Reporting these sections
    // complete keeps the rail honest about what the app actually enforces; inventing a
    // gate here would mark tabs incomplete that Save cheerfully ignores.
    for (const group of appBuilderGroups) {
        sections.push(
            unvalidatedSection(`appBuilderComponent-${group.id}`, group.label, 'appBuilderComponent'),
        );
    }

    // Authoring is a single radio that always carries a value, so it has no required
    // field to be incomplete about. Zero counts here are the model, not an oversight.
    if (isEds) {
        sections.push(unvalidatedSection('authoring-experience', 'Authoring', 'authoring'));
    }

    return sections;
}

/**
 * Map sections onto the rail's tabs.
 *
 * Every section is REACHABLE: the Configure screen is not a linear wizard, so a user may
 * jump to any section at any time. `StepRail` only makes `done` / `current` tabs
 * clickable, so every non-active section is `done` — nothing is ever `upcoming` or
 * `locked` here.
 *
 * `hasError` rides along so a blocking error in an off-screen section is findable.
 *
 * @param sections - The ordered sections
 * @param activeId - The section currently on screen
 * @returns Tabs for `StepRail`
 */
export function toStepRailTabs(sections: ConfigureSection[], activeId: string): StepTab[] {
    return sections.map(section => ({
        id: section.id,
        title: section.label,
        status: section.id === activeId ? 'current' : 'done',
        hasError: section.hasError,
    }));
}
