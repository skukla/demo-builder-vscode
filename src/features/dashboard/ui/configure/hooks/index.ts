/**
 * Configure Screen Hooks
 *
 * Extracted hooks from ConfigureScreen.tsx for better maintainability:
 * - useSelectedComponents: Component selection resolution with dependencies
 * - useServiceGroups: Field deduplication and service group organization
 * - useFieldFocusTracking: Field focus and scroll behavior
 * - useFieldValidation: Field validation logic
 * - useConfigureFields: Field value management
 * - useConfigureNavigation: Navigation sections and field navigation
 * - useConfigureActions: Save and cancel operations
 */

export { useSelectedComponents } from './useSelectedComponents';
export type { SelectedComponent } from './useSelectedComponents';
export { useServiceGroups } from './useServiceGroups';
export { useFieldFocusTracking } from './useFieldFocusTracking';
export { useFieldValidation } from './useFieldValidation';
export { useConfigureFields } from './useConfigureFields';
export { useConfigureNavigation } from './useConfigureNavigation';
export { useConfigureActions } from './useConfigureActions';
