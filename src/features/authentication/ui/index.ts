/**
 * Authentication Feature - UI Exports
 */

// Steps
export { AdobeAuthStep } from './steps/AdobeAuthStep';

// Inline pickers (folded into the Integrations Mesh tile)
export { AdobeProjectPicker } from './components/AdobeProjectPicker';
export { AdobeWorkspacePicker } from './components/AdobeWorkspacePicker';

// Hooks re-exported from core/ui/hooks for backward compatibility
export { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
export type { UseSelectionStepOptions, UseSelectionStepResult } from '@/core/ui/hooks/useSelectionStep';
