/**
 * Custom React Hooks
 *
 * This file exports all custom hooks used throughout the application.
 *
 * Import hooks using the @ alias:
 * import { useVSCodeMessage, useSelection } from '@/core/ui/hooks';
 */

// VS Code Communication Hooks
export { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
export { useVSCodeRequest } from '@/core/ui/hooks/useVSCodeRequest';

// State Management Hooks
export { useLoadingState } from '@/core/ui/hooks/useLoadingState';
export { useSelection } from '@/core/ui/hooks/useSelection';
export { useAsyncData } from '@/core/ui/hooks/useAsyncData';

// UI Interaction Hooks
export { useAutoScroll } from '@/core/ui/hooks/useAutoScroll';
export { useSearchFilter } from '@/core/ui/hooks/useSearchFilter';
export { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';

// General Purpose Hooks
export { useSelectableDefault, useSelectableDefaultWhen } from '@/core/ui/hooks/useSelectableDefault';
