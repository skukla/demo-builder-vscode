"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSelection = useSelection;
const react_1 = require("react");
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
function useSelection(options = {}) {
    const { initialSelection = null, onChange, getKey, allowDeselect = false } = options;
    const [selectedItem, setSelectedItem] = (0, react_1.useState)(initialSelection);
    const select = (0, react_1.useCallback)((item) => {
        setSelectedItem(item);
        if (onChange) {
            onChange(item);
        }
    }, [onChange]);
    const clearSelection = (0, react_1.useCallback)(() => {
        setSelectedItem(null);
        if (onChange) {
            onChange(null);
        }
    }, [onChange]);
    const isSelected = (0, react_1.useCallback)((item) => {
        if (!selectedItem)
            return false;
        if (getKey) {
            return getKey(selectedItem) === getKey(item);
        }
        // Fallback to reference equality
        return selectedItem === item;
    }, [selectedItem, getKey]);
    const toggle = (0, react_1.useCallback)((item) => {
        if (isSelected(item)) {
            if (allowDeselect) {
                clearSelection();
            }
        }
        else {
            select(item);
        }
    }, [isSelected, select, clearSelection, allowDeselect]);
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
//# sourceMappingURL=useSelection.js.map