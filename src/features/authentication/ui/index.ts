/**
 * Authentication Feature - UI Exports
 */

// Steps
export { AdobeAuthStep } from './steps/AdobeAuthStep';
export { AdobeProjectStep } from './steps/AdobeProjectStep';
export { AdobeWorkspaceStep } from './steps/AdobeWorkspaceStep';

// Hooks re-exported from core/ui/hooks for backward compatibility
export { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
export type { UseSelectionStepOptions, UseSelectionStepResult } from '@/core/ui/hooks/useSelectionStep';
