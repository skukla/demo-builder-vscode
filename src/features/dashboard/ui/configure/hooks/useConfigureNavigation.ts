/**
 * useConfigureNavigation Hook
 *
 * Extracts the navigation logic from ConfigureScreen.
 * Handles navigation sections and field navigation.
 */

import { useMemo, useCallback, Dispatch, SetStateAction } from 'react';
import { toNavigationSection } from '../configureHelpers';
import type { ServiceGroup, UniqueField } from '../configureTypes';
import { NavigationSection } from '@/core/ui/components/navigation';

interface UseConfigureNavigationProps {
    serviceGroups: ServiceGroup[];
    isFieldComplete: (field: UniqueField) => boolean;
    expandedNavSections: Set<string>;
    setExpandedNavSections: Dispatch<SetStateAction<Set<string>>>;
}

interface UseConfigureNavigationReturn {
    navigationSections: NavigationSection[];
    toggleNavSection: (sectionId: string) => void;
    navigateToField: (fieldKey: string) => void;
}

/**
 * Hook to manage navigation in the configure screen
 */
export function useConfigureNavigation({
    serviceGroups,
    isFieldComplete,
    expandedNavSections,
    setExpandedNavSections,
}: UseConfigureNavigationProps): UseConfigureNavigationReturn {
    // Navigation sections for NavigationPanel
    const navigationSections = useMemo<NavigationSection[]>(() => {
        return serviceGroups.map(group => toNavigationSection(group, isFieldComplete));
    }, [serviceGroups, isFieldComplete]);

    const toggleNavSection = useCallback((sectionId: string) => {
        const wasExpanded = expandedNavSections.has(sectionId);

        setExpandedNavSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });

        if (!wasExpanded) {
            const element = document.getElementById(`section-${sectionId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [expandedNavSections, setExpandedNavSections]);

    const navigateToField = useCallback((fieldKey: string) => {
        const fieldElement = document.getElementById(`field-${fieldKey}`);
        if (!fieldElement) return;

        const input = fieldElement.querySelector('input, select, textarea');
        if (input instanceof HTMLElement) {
            input.focus();
        }
    }, []);

    return {
        navigationSections,
        toggleNavSection,
        navigateToField,
    };
}
