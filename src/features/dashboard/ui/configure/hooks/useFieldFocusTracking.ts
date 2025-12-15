/**
 * useFieldFocusTracking Hook
 *
 * Extracts the field focus tracking logic from ConfigureScreen.
 * Handles scrolling to section headers when fields are focused.
 */

import { useEffect, useRef, Dispatch, SetStateAction } from 'react';
import type { ServiceGroup } from '../configureTypes';

interface UseFieldFocusTrackingProps {
    serviceGroups: ServiceGroup[];
    setActiveSection: Dispatch<SetStateAction<string | null>>;
    setActiveField: Dispatch<SetStateAction<string | null>>;
    setExpandedNavSections: Dispatch<SetStateAction<Set<string>>>;
}

interface UseFieldFocusTrackingReturn {
    lastFocusedSectionRef: React.MutableRefObject<string | null>;
    fieldCountInSectionRef: React.MutableRefObject<number>;
}

/**
 * Hook to handle field focus tracking and auto-scrolling
 */
export function useFieldFocusTracking({
    serviceGroups,
    setActiveSection,
    setActiveField,
    setExpandedNavSections,
}: UseFieldFocusTrackingProps): UseFieldFocusTrackingReturn {
    const lastFocusedSectionRef = useRef<string | null>(null);
    const fieldCountInSectionRef = useRef<number>(0);

    useEffect(() => {
        if (serviceGroups.length === 0) return;

        const handleFieldFocus = (event: FocusEvent) => {
            const target = event.target as HTMLElement;
            const fieldWrapper = target.closest('[id^="field-"]');
            if (!fieldWrapper) return;

            const fieldId = fieldWrapper.id.replace('field-', '');
            const section = serviceGroups.find(group =>
                group.fields.some(f => f.key === fieldId),
            );

            if (!section) return;

            setActiveField(fieldId);

            const isNewSection = lastFocusedSectionRef.current !== section.id;
            const fieldIndex = section.fields.findIndex(f => f.key === fieldId);
            const isFirstFieldInSection = fieldIndex === 0;
            const isBackwardNavigation = isNewSection && !isFirstFieldInSection;

            if (isNewSection) {
                fieldCountInSectionRef.current = isFirstFieldInSection ? 1 : fieldIndex + 1;
                lastFocusedSectionRef.current = section.id;
            } else {
                fieldCountInSectionRef.current += 1;
            }

            setActiveSection(section.id);
            setExpandedNavSections(prev => {
                const newSet = new Set(prev);
                newSet.add(section.id);
                return newSet;
            });

            const shouldScroll = isNewSection || (fieldCountInSectionRef.current % 3 === 0);

            if (shouldScroll) {
                const navSectionElement = document.getElementById(`nav-${section.id}`);
                if (navSectionElement) {
                    navSectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                if (isNewSection) {
                    if (isBackwardNavigation) {
                        fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        const sectionElement = document.getElementById(`section-${section.id}`);
                        if (sectionElement) {
                            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                } else {
                    fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                setTimeout(() => {
                    const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                    if (navFieldElement) {
                        navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 150);
            } else {
                const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                if (navFieldElement) {
                    navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        };

        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', handleFieldFocus as EventListener);
        });

        return () => {
            inputs.forEach(input => {
                input.removeEventListener('focus', handleFieldFocus as EventListener);
            });
        };
    }, [serviceGroups, setActiveSection, setActiveField, setExpandedNavSections]);

    return {
        lastFocusedSectionRef,
        fieldCountInSectionRef,
    };
}
