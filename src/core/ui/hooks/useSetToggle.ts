import { useState, useCallback, Dispatch, SetStateAction } from 'react';

/**
 * Manages a Set with toggle functionality.
 * Useful for multi-select UIs where items can be independently toggled.
 *
 * @param initial - Initial Set or array of values
 * @returns Tuple of [set, toggle function, setState function]
 *
 * @example
 * const [selectedDependencies, toggleDependency, setSelectedDependencies] = useSetToggle<string>();
 *
 * // Toggle an item
 * toggleDependency('item-1', true);  // Add
 * toggleDependency('item-1', false); // Remove
 *
 * // Check if selected
 * selectedDependencies.has('item-1');
 *
 * // Reset
 * setSelectedDependencies(new Set());
 */
export function useSetToggle<T>(
    initial: Set<T> | T[] = []
): [Set<T>, (id: T, selected: boolean) => void, Dispatch<SetStateAction<Set<T>>>] {
    const [set, setSet] = useState<Set<T>>(
        initial instanceof Set ? initial : new Set(initial)
    );

    const toggle = useCallback((id: T, selected: boolean) => {
        setSet(prev => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    }, []);

    return [set, toggle, setSet];
}
