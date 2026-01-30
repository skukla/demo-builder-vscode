/**
 * useSmartFieldFocusScroll Hook
 *
 * Smart scroll logic that scrolls to section headers when the first
 * field in a new section receives focus. Prevents redundant scrolling
 * when moving between fields within the same section.
 *
 * @module features/dashboard/ui/configure/hooks/useSmartFieldFocusScroll
 */

import { useState, useCallback, useRef, RefObject } from 'react';

/**
 * Options for useSmartFieldFocusScroll hook
 */
export interface UseSmartFieldFocusScrollOptions {
    /** Reference to the scroll container */
    containerRef: RefObject<HTMLElement | null>;
    /** Scroll behavior (default: 'smooth') */
    scrollBehavior?: ScrollBehavior;
    /** Block position for scrollIntoView (default: 'start') */
    blockPosition?: ScrollLogicalPosition;
    /** Whether scrolling is enabled (default: true) */
    enabled?: boolean;
}

/**
 * Return type for useSmartFieldFocusScroll hook
 */
export interface UseSmartFieldFocusScrollReturn {
    /** Handle field focus event */
    onFieldFocus: (sectionId: string, fieldId: string) => void;
    /** Currently focused section ID */
    currentSectionId: string | null;
    /** Reset section tracking (allows re-scroll to same section) */
    reset: () => void;
}

/**
 * Hook for smart section scrolling on field focus
 *
 * Scrolls to section header when focus moves to a field in a new section.
 * Does not scroll when moving between fields in the same section.
 *
 * @param options - Scroll configuration
 * @returns Focus handler and section tracking
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { onFieldFocus, currentSectionId } = useSmartFieldFocusScroll({
 *     containerRef,
 * });
 *
 * return (
 *     <div ref={containerRef}>
 *         <Section data-section="section-1">
 *             <Input onFocus={() => onFieldFocus('section-1', 'field-1')} />
 *         </Section>
 *     </div>
 * );
 * ```
 */
export function useSmartFieldFocusScroll({
    containerRef,
    scrollBehavior = 'smooth',
    blockPosition = 'start',
    enabled = true,
}: UseSmartFieldFocusScrollOptions): UseSmartFieldFocusScrollReturn {
    const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
    // Use ref for comparison to avoid callback recreation
    const currentSectionRef = useRef<string | null>(null);

    const onFieldFocus = useCallback((sectionId: string, _fieldId: string) => {
        // Check if new section before updating
        const isNewSection = sectionId !== currentSectionRef.current;

        // Always track current section (both ref and state)
        currentSectionRef.current = sectionId;
        setCurrentSectionId(sectionId);

        // Don't scroll if disabled
        if (!enabled) return;

        // Don't scroll if same section
        if (!isNewSection) return;

        // Don't scroll if no container
        const container = containerRef.current;
        if (!container) return;

        // Find section header element
        const sectionHeader = container.querySelector(`[data-section="${sectionId}"]`);
        if (!sectionHeader) return;

        // Scroll section header into view
        sectionHeader.scrollIntoView({
            behavior: scrollBehavior,
            block: blockPosition,
        });
    }, [containerRef, scrollBehavior, blockPosition, enabled]);

    const reset = useCallback(() => {
        currentSectionRef.current = null;
        setCurrentSectionId(null);
    }, []);

    return {
        onFieldFocus,
        currentSectionId,
        reset,
    };
}
