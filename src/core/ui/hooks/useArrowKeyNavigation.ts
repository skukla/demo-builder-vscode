/**
 * useArrowKeyNavigation Hook
 *
 * Provides arrow key navigation for lists/grids of focusable items.
 * Supports wrapping navigation and Home/End shortcuts.
 *
 * @example
 * ```tsx
 * const { itemRefs, getItemProps } = useArrowKeyNavigation({
 *     itemCount: items.length,
 *     onSelect: (index) => handleSelect(items[index]),
 *     autoFocusFirst: true,
 * });
 *
 * return (
 *     <div role="listbox">
 *         {items.map((item, index) => (
 *             <div key={item.id} {...getItemProps(index)}>
 *                 {item.name}
 *             </div>
 *         ))}
 *     </div>
 * );
 * ```
 */

import { useRef, useCallback, useEffect } from 'react';

export interface UseArrowKeyNavigationOptions {
    /** Total number of items in the list */
    itemCount: number;
    /** Callback when an item is selected (Enter/Space pressed) */
    onSelect?: (index: number) => void;
    /** Whether to wrap navigation at boundaries (default: true) */
    wrap?: boolean;
    /** Auto-focus the first item on mount (default: false) */
    autoFocusFirst?: boolean;
    /** Delay before auto-focus in ms (default: 100) */
    autoFocusDelay?: number;
    /** Whether the navigation is vertical (default: true means up/down, false means left/right) */
    orientation?: 'vertical' | 'horizontal' | 'both';
}

export interface ArrowKeyNavigationItemProps {
    ref: (el: HTMLElement | null) => void;
    tabIndex: number;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

export interface UseArrowKeyNavigationResult {
    /** Refs array for all items */
    itemRefs: React.MutableRefObject<(HTMLElement | null)[]>;
    /** Get props to spread on each item */
    getItemProps: (index: number) => ArrowKeyNavigationItemProps;
    /** Programmatically focus an item by index */
    focusItem: (index: number) => void;
}

/**
 * Hook for arrow key navigation in lists/grids
 */
export function useArrowKeyNavigation(
    options: UseArrowKeyNavigationOptions,
): UseArrowKeyNavigationResult {
    const {
        itemCount,
        onSelect,
        wrap = true,
        autoFocusFirst = false,
        autoFocusDelay = 100,
        orientation = 'both',
    } = options;

    const itemRefs = useRef<(HTMLElement | null)[]>([]);

    // Auto-focus first item on mount if requested
    useEffect(() => {
        if (!autoFocusFirst || itemCount <= 0) {
            return;
        }
        const timer = setTimeout(() => {
            itemRefs.current[0]?.focus();
        }, autoFocusDelay);
        return () => clearTimeout(timer);
    }, [autoFocusFirst, autoFocusDelay, itemCount]);

    /**
     * Focus an item by index
     */
    const focusItem = useCallback((index: number) => {
        if (index >= 0 && index < itemCount) {
            itemRefs.current[index]?.focus();
        }
    }, [itemCount]);

    /**
     * Calculate the next index based on direction
     */
    const getNextIndex = useCallback(
        (currentIndex: number, direction: 'prev' | 'next' | 'first' | 'last'): number => {
            switch (direction) {
                case 'prev':
                    if (currentIndex > 0) return currentIndex - 1;
                    return wrap ? itemCount - 1 : currentIndex;
                case 'next':
                    if (currentIndex < itemCount - 1) return currentIndex + 1;
                    return wrap ? 0 : currentIndex;
                case 'first':
                    return 0;
                case 'last':
                    return itemCount - 1;
                default:
                    return currentIndex;
            }
        },
        [itemCount, wrap],
    );

    /**
     * Handle key down events for an item
     */
    const handleKeyDown = useCallback(
        (index: number, e: React.KeyboardEvent) => {
            let direction: 'prev' | 'next' | 'first' | 'last' | null = null;

            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    onSelect?.(index);
                    return;

                case 'ArrowUp':
                    if (orientation === 'vertical' || orientation === 'both') {
                        e.preventDefault();
                        direction = 'prev';
                    }
                    break;

                case 'ArrowDown':
                    if (orientation === 'vertical' || orientation === 'both') {
                        e.preventDefault();
                        direction = 'next';
                    }
                    break;

                case 'ArrowLeft':
                    if (orientation === 'horizontal' || orientation === 'both') {
                        e.preventDefault();
                        direction = 'prev';
                    }
                    break;

                case 'ArrowRight':
                    if (orientation === 'horizontal' || orientation === 'both') {
                        e.preventDefault();
                        direction = 'next';
                    }
                    break;

                case 'Home':
                    e.preventDefault();
                    direction = 'first';
                    break;

                case 'End':
                    e.preventDefault();
                    direction = 'last';
                    break;
            }

            if (direction !== null) {
                const nextIndex = getNextIndex(index, direction);
                focusItem(nextIndex);
            }
        },
        [orientation, onSelect, getNextIndex, focusItem],
    );

    /**
     * Get props to spread on each navigable item
     */
    const getItemProps = useCallback(
        (index: number): ArrowKeyNavigationItemProps => ({
            ref: (el: HTMLElement | null) => {
                itemRefs.current[index] = el;
            },
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(index, e),
        }),
        [handleKeyDown],
    );

    return {
        itemRefs,
        getItemProps,
        focusItem,
    };
}
