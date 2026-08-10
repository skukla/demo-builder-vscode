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
