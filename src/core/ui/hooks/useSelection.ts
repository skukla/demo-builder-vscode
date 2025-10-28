import { useState, useCallback } from 'react';

interface UseSelectionOptions<T> {
  /** Initial selected item */
  initialSelection?: T | null;
  /** Callback when selection changes */
  onChange?: (item: T | null) => void;
  /** Function to get unique key from item */
  getKey?: (item: T) => string | number;
  /** Allow deselection by clicking selected item */
  allowDeselect?: boolean;
}

interface UseSelectionReturn<T> {
  /** Currently selected item */
  selectedItem: T | null;
  /** ID of selected item (if getKey was provided) */
  selectedKey: string | number | null;
  /** Select an item */
  select: (item: T) => void;
  /** Clear selection */
  clearSelection: () => void;
  /** Check if item is selected */
  isSelected: (item: T) => boolean;
  /** Toggle selection of an item */
  toggle: (item: T) => void;
}

/**
 * Hook for managing single-item selection
 *
 * Provides selection state and helper functions for common selection patterns.
 * Extracted from AdobeProjectStep and AdobeWorkspaceStep.
 *
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { selectedItem, select, isSelected } = useSelection<Project>({
 *   getKey: (p) => p.id,
 *   onChange: (project) => console.log('Selected:', project)
 * });
 *
 * return (
 *   <ListView
 *     items={projects}
 *     selectedKeys={selectedItem ? [selectedItem.id] : []}
 *     onSelectionChange={(keys) => {
 *       const id = Array.from(keys)[0];
 *       const project = projects.find(p => p.id === id);
 *       if (project) select(project);
 *     }}
 *   />
 * );
 * ```
 */
export function useSelection<T>(
  options: UseSelectionOptions<T> = {}
): UseSelectionReturn<T> {
  const {
    initialSelection = null,
    onChange,
    getKey,
    allowDeselect = false
  } = options;

  const [selectedItem, setSelectedItem] = useState<T | null>(initialSelection);

  const select = useCallback(
    (item: T) => {
      setSelectedItem(item);
      if (onChange) {
        onChange(item);
      }
    },
    [onChange]
  );

  const clearSelection = useCallback(() => {
    setSelectedItem(null);
    if (onChange) {
      onChange(null);
    }
  }, [onChange]);

  const isSelected = useCallback(
    (item: T): boolean => {
      if (!selectedItem) return false;

      if (getKey) {
        return getKey(selectedItem) === getKey(item);
      }

      // Fallback to reference equality
      return selectedItem === item;
    },
    [selectedItem, getKey]
  );

  const toggle = useCallback(
    (item: T) => {
      if (isSelected(item)) {
        if (allowDeselect) {
          clearSelection();
        }
      } else {
        select(item);
      }
    },
    [isSelected, select, clearSelection, allowDeselect]
  );

  const selectedKey = selectedItem && getKey ? getKey(selectedItem) : null;

  return {
    selectedItem,
    selectedKey,
    select,
    clearSelection,
    isSelected,
    toggle
  };
}
