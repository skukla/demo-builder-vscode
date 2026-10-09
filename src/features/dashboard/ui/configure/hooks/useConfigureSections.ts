/**
 * useConfigureSections Hook
 *
 * Owns the Configure screen's sections and their verdicts: which section the rail is
 * on, the GLOBAL validation errors (every service group, not the one on screen), the
 * tabs the rail renders, and whether Save is allowed.
 *
 * Two of ConfigureScreen's invariants live here: validation walks every group, so an
 * error in a hidden section still disables Save; and `hasError` rides each section onto
 * its rail tab, so that error stays findable. A new section kind is added in
 * `buildConfigureSections`, not here.
 *
 * Moved out of ConfigureScreen (EDS-8) unchanged.
 *
 * @module features/dashboard/ui/configure/hooks/useConfigureSections
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { validateServiceGroups } from '../configureFieldValidation';
import {
    buildConfigureSections,
    toStepRailTabs,
    type ConfigureSection,
} from '../configureSections';
import type { ServiceGroup, UniqueField } from '../configureTypes';
import type { StepTab } from '@/core/ui/components/navigation/StepRail';
import { hasEntries } from '@/types/typeGuards';

export interface UseConfigureSectionsProps {
    /** Service groups, filtered and ordered by `useServiceGroups`. */
    serviceGroups: ServiceGroup[];
    /** The raw stored value, ignoring defaults — what validation judges. */
    getValueFromConfigs: (field: UniqueField) => string | number | boolean | undefined;
    /** Whether a field currently holds a value. */
    isFieldComplete: (field: UniqueField) => boolean;
    /** EDS project — gates the Authoring section. */
    isEds: boolean;
    /** The project-name field's error, if any. */
    projectNameError: string | undefined;
}

export interface UseConfigureSectionsReturn {
    /** Validation errors across EVERY section, keyed by field. */
    validationErrors: Record<string, string>;
    /** The section on screen (falls back to the first when the stored id is stale). */
    activeSection: ConfigureSection;
    /** The rail's tabs. */
    railTabs: StepTab[];
    /** Switch the rail to a section. */
    setActiveSectionId: (id: string) => void;
    /** No validation error anywhere and a valid project name. */
    canSave: boolean;
}

/**
 * Manage the Configure screen's sections, validation and rail.
 *
 * @param props - the service groups, the field reads and the project-name error
 * @returns the active section, the rail tabs, the errors and whether Save is allowed
 */
export function useConfigureSections({
    serviceGroups,
    getValueFromConfigs,
    isFieldComplete,
    isEds,
    projectNameError,
}: UseConfigureSectionsProps): UseConfigureSectionsReturn {
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    // Which section the rail is on. Re-opening Configure re-sends `init` WITHOUT
    // remounting React (baseWebviewCommand.createOrRevealPanel), so this deliberately
    // survives a re-open and puts the user back where they were — matching
    // `retainContextWhenHidden`, which already preserves it across a tab-away.
    // `componentConfigs` does reset on that init; the asymmetry is accepted.
    const [activeSectionId, setActiveSectionId] = useState('project-info');

    // GLOBAL validation: every service group, not the one on screen. An error the user
    // cannot see must still block Save, and its rail tab is what points them at it.
    useEffect(() => {
        setValidationErrors(validateServiceGroups(serviceGroups, getValueFromConfigs));
    }, [serviceGroups, getValueFromConfigs]);

    const fieldHasError = useCallback(
        (field: UniqueField): boolean => validationErrors[field.key] !== undefined,
        [validationErrors],
    );

    // Validate project name — `projectNameError` is useProjectNameField's; the rail reads it too.
    const sections = useMemo(
        () =>
            buildConfigureSections({
                serviceGroups,
                isFieldComplete,
                fieldHasError,
                isEds,
                isProjectNameValid: !projectNameError,
            }),
        [serviceGroups, isFieldComplete, fieldHasError, isEds, projectNameError],
    );

    // Sections come and go as components are configured, so the stored id can go stale;
    // fall back to the first tab (Project, which is always present) rather than a blank view.
    const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

    const railTabs = useMemo(
        () => toStepRailTabs(sections, activeSection.id),
        [sections, activeSection.id],
    );

    // Can save if no validation errors (env vars and project name). This walks EVERY
    // group's errors, not the rendered one's — a hidden section can still block Save,
    // and its rail tab carries `hasError` so the user can reach it.
    const canSave = !hasEntries(validationErrors) && !projectNameError;

    return { validationErrors, activeSection, railTabs, setActiveSectionId, canSave };
}
