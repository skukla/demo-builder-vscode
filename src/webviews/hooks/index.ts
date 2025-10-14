/**
 * Custom React Hooks
 *
 * This file exports all custom hooks used throughout the application.
 *
 * Import hooks using the @ alias:
 * import { useDebouncedLoading, useVSCodeMessage } from '@/hooks';
 */

// Legacy hooks (pre-refactor)
export { useSelectableDefault, useSelectableDefaultWhen } from './useSelectableDefault';
export { useDebouncedLoading } from './useDebouncedLoading';
export { useMinimumLoadingTime } from './useMinimumLoadingTime';

// VS Code Communication Hooks
export { useVSCodeMessage } from './useVSCodeMessage';
export { useVSCodeRequest } from './useVSCodeRequest';

// State Management Hooks
export { useLoadingState } from './useLoadingState';
export { useSelection } from './useSelection';
export { useAsyncData } from './useAsyncData';

// UI Interaction Hooks
export { useAutoScroll } from './useAutoScroll';
export { useSearchFilter } from './useSearchFilter';
export { useFocusTrap } from './useFocusTrap';

// Utility Hooks
export { useDebouncedValue } from './useDebouncedValue';
