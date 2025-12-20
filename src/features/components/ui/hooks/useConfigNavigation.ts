import { useState, useEffect, useRef, useCallback } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { ServiceGroup, UniqueField } from './useComponentConfig';

interface UseConfigNavigationProps {
    serviceGroups: ServiceGroup[];
    isLoading: boolean;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
}

interface UseConfigNavigationReturn {
    expandedNavSections: Set<string>;
    activeSection: string | null;
    activeField: string | null;
    toggleNavSection: (sectionId: string) => void;
    navigateToSection: (sectionId: string) => void;
    navigateToField: (fieldKey: string) => void;
    getSectionCompletion: (group: ServiceGroup) => { total: number; completed: number; isComplete: boolean };
    isFieldComplete: (field: UniqueField) => boolean;
}

export function useConfigNavigation({
    serviceGroups,
    isLoading,
    getFieldValue,
}: UseConfigNavigationProps): UseConfigNavigationReturn {
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);
    const lastFocusedSectionRef = useRef<string | null>(null);
    const fieldCountInSectionRef = useRef<number>(0);
    const isInitialFocusRef = useRef<boolean>(true);

    // Track timeouts for cleanup on unmount
    const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            timeoutsRef.current.forEach(clearTimeout);
            timeoutsRef.current = [];
        };
    }, []);

    // Handle field focus to scroll section header into view when entering new section
    useEffect(() => {
        if (isLoading || serviceGroups.length === 0) return;

        const handleFieldFocus = (event: FocusEvent) => {
            const target = event.target as HTMLElement;

            // Find the field wrapper div
            const fieldWrapper = target.closest('[id^="field-"]');
            if (!fieldWrapper) return;

            const fieldId = fieldWrapper.id.replace('field-', '');

            // Find which section this field belongs to
            const section = serviceGroups.find(group =>
                group.fields.some(f => f.key === fieldId),
            );

            if (!section) return;

            // Track the active field for navigation highlighting
            setActiveField(fieldId);

            // Check if we're entering a different section
            const isNewSection = lastFocusedSectionRef.current !== section.id;

            // Determine if this is the first field in the section (forward navigation)
            // or a later field (backward navigation via Shift+Tab)
            const fieldIndex = section.fields.findIndex(f => f.key === fieldId);
            const isFirstFieldInSection = fieldIndex === 0;
            const isBackwardNavigation = isNewSection && !isFirstFieldInSection;

            // Reset field count when entering new section, increment when staying in same section
            if (isNewSection) {
                fieldCountInSectionRef.current = isFirstFieldInSection ? 1 : fieldIndex + 1;
                lastFocusedSectionRef.current = section.id;
            } else {
                fieldCountInSectionRef.current += 1;
            }

            // Update active section (for highlighting)
            setActiveSection(section.id);

            // Auto-expand the section in navigation
            setExpandedNavSections(prev => {
                const newSet = new Set(prev);
                newSet.add(section.id);
                return newSet;
            });

            // Skip auto-scroll on initial page load (user hasn't started navigating yet)
            if (isInitialFocusRef.current) {
                isInitialFocusRef.current = false;
                return;
            }

            // Scroll on: 1) New section OR 2) Every 3 fields within section
            const shouldScroll = isNewSection || (fieldCountInSectionRef.current % 3 === 0);

            if (shouldScroll) {
                const navSectionElement = document.getElementById(`nav-${section.id}`);
                if (navSectionElement) {
                    navSectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                // For new sections: scroll to section header (forward) or specific field (backward)
                // For field groups: scroll to current field
                if (isNewSection) {
                    if (isBackwardNavigation) {
                        // Backward navigation (Shift+Tab): scroll to the specific field
                        fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        // Forward navigation: scroll to section header
                        const sectionElement = document.getElementById(`section-${section.id}`);
                        if (sectionElement) {
                            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                } else {
                    // Every 3 fields, scroll the current field to the top to show the next 3 fields below it
                    fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                // Scroll the navigation field node into view
                const navScrollTimeout = setTimeout(() => {
                    const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                    if (navFieldElement) {
                        navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, FRONTEND_TIMEOUTS.SCROLL_ANIMATION);
                timeoutsRef.current.push(navScrollTimeout);
            } else {
                // Within same section, only update navigation highlighting (no scroll)
                const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                if (navFieldElement) {
                    navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        };

        // Add focus listeners to all input elements
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', handleFieldFocus as EventListener);
        });

        return () => {
            inputs.forEach(input => {
                input.removeEventListener('focus', handleFieldFocus as EventListener);
            });
        };
    }, [isLoading, serviceGroups]);

    // Auto-focus first editable field when component loads
    useEffect(() => {
        if (isLoading || serviceGroups.length === 0) return;

        // Find the first editable field (skip read-only fields like MESH_ENDPOINT)
        const firstEditableField = serviceGroups
            .flatMap(group => group.fields)
            .find(field => field.key !== 'MESH_ENDPOINT');

        let focusTimeout: NodeJS.Timeout | undefined;
        if (firstEditableField) {
            // Wait for DOM to be ready, then focus the first field
            focusTimeout = setTimeout(() => {
                const firstFieldElement = document.querySelector(`#field-${firstEditableField.key} input, #field-${firstEditableField.key} select`);
                if (firstFieldElement instanceof HTMLElement) {
                    // Prevent scroll on initial focus to keep page at top
                    firstFieldElement.focus({ preventScroll: true });
                }
            }, FRONTEND_TIMEOUTS.UI_UPDATE_DELAY);
            timeoutsRef.current.push(focusTimeout);
        }

        return () => {
            if (focusTimeout) {
                clearTimeout(focusTimeout);
                timeoutsRef.current = timeoutsRef.current.filter(t => t !== focusTimeout);
            }
        };
    }, [isLoading, serviceGroups]);

    const navigateToSection = useCallback((sectionId: string) => {
        const element = document.getElementById(`section-${sectionId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    const navigateToField = useCallback((fieldKey: string) => {
        const fieldElement = document.getElementById(`field-${fieldKey}`);
        if (!fieldElement) return;

        // Focus the input element (the focus listener will handle scrolling)
        const input = fieldElement.querySelector('input, select, textarea');
        if (input instanceof HTMLElement) {
            input.focus();
        }
    }, []);

    const toggleNavSection = useCallback((sectionId: string) => {
        setExpandedNavSections(prev => {
            const wasExpanded = prev.has(sectionId);
            const newSet = new Set(prev);
            if (wasExpanded) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }

            // Only scroll to section when EXPANDING, not when collapsing
            if (!wasExpanded) {
                // SOP §1: Zero delay defers to next microtask to allow React state updates before scroll
                const scrollTimeout = setTimeout(() => navigateToSection(sectionId), FRONTEND_TIMEOUTS.MICROTASK_DEFER);
                timeoutsRef.current.push(scrollTimeout);
            }

            return newSet;
        });
    }, [navigateToSection]);

    const isFieldComplete = useCallback((field: UniqueField): boolean => {
        if (field.key === 'MESH_ENDPOINT') return true; // Auto-populated
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    }, [getFieldValue]);

    const getSectionCompletion = useCallback((group: ServiceGroup) => {
        const requiredFields = group.fields.filter(f => f.required);

        const completedFields = requiredFields.filter(f => {
            // MESH_ENDPOINT is auto-filled later, so consider it complete if it's deferred
            if (f.key === 'MESH_ENDPOINT') {
                return true; // Mark as complete since it's auto-populated
            }

            const value = getFieldValue(f);
            return value !== undefined && value !== '';
        });

        return {
            total: requiredFields.length,
            completed: completedFields.length,
            isComplete: requiredFields.length === 0 || completedFields.length === requiredFields.length,
        };
    }, [getFieldValue]);

    return {
        expandedNavSections,
        activeSection,
        activeField,
        toggleNavSection,
        navigateToSection,
        navigateToField,
        getSectionCompletion,
        isFieldComplete,
    };
}
