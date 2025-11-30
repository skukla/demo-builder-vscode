/**
 * Custom React Hooks
 *
 * This file exports all custom hooks used throughout the webview application.
 */

// VS Code Communication Hooks
export { useVSCodeMessage } from './useVSCodeMessage';
export { useVSCodeRequest } from './useVSCodeRequest';

// State Management Hooks
export { useLoadingState } from './useLoadingState';
export { useSelection } from './useSelection';
export { useAsyncData } from './useAsyncData';
export { useAsyncOperation } from './useAsyncOperation';
export type { UseAsyncOperationOptions, UseAsyncOperationReturn } from './useAsyncOperation';

// UI Interaction Hooks
export { useAutoScroll } from './useAutoScroll';
export { useSearchFilter } from './useSearchFilter';
export { useFocusTrap, FOCUSABLE_SELECTOR } from './useFocusTrap';
export { useFocusOnMount } from './useFocusOnMount';

// General Purpose Hooks
export { useSelectableDefault, useSelectableDefaultWhen } from './useSelectableDefault';

// Utility Hooks
export { useDebouncedLoading } from './useDebouncedLoading';
export { useDebouncedValue } from './useDebouncedValue';
export { useMinimumLoadingTime } from './useMinimumLoadingTime';
export { useIsMounted } from './useIsMounted';
export { useSetToggle } from './useSetToggle';
