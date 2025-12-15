/**
 * PrerequisitesStep Hooks
 *
 * Extracted hooks from PrerequisitesStep.tsx for better maintainability:
 * - usePrerequisiteState: State management and message listeners
 * - usePrerequisiteAutoScroll: Scroll behavior management
 * - usePrerequisiteNavigation: Step navigation effects
 * - prerequisiteRenderers: Render helper functions
 */

export { usePrerequisiteState, isTerminalStatus, INITIAL_LOADING_STATE } from './usePrerequisiteState';
export type { PrerequisitesLoadedData } from './usePrerequisiteState';
export { usePrerequisiteAutoScroll } from './usePrerequisiteAutoScroll';
export { usePrerequisiteNavigation } from './usePrerequisiteNavigation';
export {
    shouldShowPluginDetails,
    getStatusIcon,
    renderPluginStatusIcon,
    getProgressValue,
    renderNodeVersionSuccess,
    renderAioCliErrorVersions,
    renderPrerequisiteMessage,
} from './prerequisiteRenderers';
