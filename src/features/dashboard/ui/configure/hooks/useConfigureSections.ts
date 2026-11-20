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
import { validateServiceGroups, type StoredSecretCheck } from '../configureFieldValidation';
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
    /** Whether a field is a secret the project already holds; such a field counts as filled. */
    isStoredSecret: StoredSecretCheck;
    /** Whether a field currently holds a value. */
    isFieldComplete: (field: UniqueField) => boolean;
    /** EDS project — gates the Storefront section. */
    isEds: boolean;
}

export interface UseConfigureSectionsReturn {
    /** Validation errors across EVERY section, keyed by field. */
    validationErrors: Record<string, string>;
    /**
     * The section on screen (falls back to the first when the stored id is stale). Undefined for a
     * project with nothing to configure.
     */
    activeSection: ConfigureSection | undefined;
    /** The rail's tabs. */
    railTabs: StepTab[];
    /** Switch the rail to a section. */
    setActiveSectionId: (id: string) => void;
    /** Something to configure, and no validation error anywhere. */
    canSave: boolean;
}

/**
 * Manage the Configure screen's sections, validation and rail.
 *
 * @param props - the service groups and the field reads
 * @returns the active section, the rail tabs, the errors and whether Save is allowed
 */
export function useConfigureSections({
    serviceGroups,
    getValueFromConfigs,
    isStoredSecret,
    isFieldComplete,
    isEds,
}: UseConfigureSectionsProps): UseConfigureSectionsReturn {
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    // Which section the rail is on, none until one is chosen: the first shows. It survives a
    // tab-away (`retainContextWhenHidden`), and starts again when Configure is re-opened: the entry
    // remounts the screen on every `init`, so nothing from before the re-open is kept (PL-76).
    const [activeSectionId, setActiveSectionId] = useState<string>();

    // GLOBAL validation: every service group, not the one on screen. An error the user
    // cannot see must still block Save, and its rail tab is what points them at it.
    useEffect(() => {
        setValidationErrors(validateServiceGroups(serviceGroups, getValueFromConfigs, isStoredSecret));
    }, [serviceGroups, getValueFromConfigs, isStoredSecret]);

    const fieldHasError = useCallback(
        (field: UniqueField): boolean => validationErrors[field.key] !== undefined,
        [validationErrors],
    );

    const sections = useMemo(
        () =>
            buildConfigureSections({
                serviceGroups,
                isFieldComplete,
                fieldHasError,
                isEds,
            }),
        [serviceGroups, isFieldComplete, fieldHasError, isEds],
    );

    // Sections come and go as components are configured, so the stored id can go stale;
    // fall back to the first tab rather than a blank view.
    const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

    const railTabs = useMemo(
        () => toStepRailTabs(sections, activeSection?.id ?? ''),
        [sections, activeSection?.id],
    );

    // Can save if there is anything to save and no validation errors. This walks EVERY
    // group's errors, not the rendered one's — a hidden section can still block Save,
    // and its rail tab carries `hasError` so the user can reach it.
    const canSave = sections.length > 0 && !hasEntries(validationErrors);

    return { validationErrors, activeSection, railTabs, setActiveSectionId, canSave };
}
