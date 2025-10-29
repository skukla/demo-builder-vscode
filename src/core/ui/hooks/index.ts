/**
 * Custom React Hooks
 *
 * This file exports all custom hooks used throughout the application.
 *
 * Import hooks using the @ alias:
 * import { useVSCodeMessage, useSelection } from '@/core/ui/hooks';
 */

// VS Code Communication Hooks
export { useVSCodeMessage } from '@/webview-ui/shared/hooks/useVSCodeMessage';
export { useVSCodeRequest } from '@/webview-ui/shared/hooks/useVSCodeRequest';

// State Management Hooks
export { useLoadingState } from '@/webview-ui/shared/hooks/useLoadingState';
export { useSelection } from '@/webview-ui/shared/hooks/useSelection';
export { useAsyncData } from '@/webview-ui/shared/hooks/useAsyncData';

// UI Interaction Hooks
export { useAutoScroll } from '@/webview-ui/shared/hooks/useAutoScroll';
export { useSearchFilter } from '@/webview-ui/shared/hooks/useSearchFilter';
export { useFocusTrap } from '@/webview-ui/shared/hooks/useFocusTrap';

// General Purpose Hooks
export { useSelectableDefault, useSelectableDefaultWhen } from '@/webview-ui/shared/hooks/useSelectableDefault';
