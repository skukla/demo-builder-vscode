/**
 * Wizard Step Types
 *
 * Contains base interfaces and types for wizard step components,
 * providing a single source of truth for step props patterns.
 */

import { WizardState, WizardStep } from './webview';

/**
 * Base props shared by all wizard step components.
 *
 * Every step receives at minimum:
 * - Current wizard state
 * - Function to update state
 * - Function to control navigation (Next button)
 *
 * @example
 * // For a step with no additional props:
 * type MyStepProps = BaseStepProps;
 *
 * // For a step with additional props:
 * interface MyStepProps extends BaseStepProps {
 *     additionalData?: SomeType;
 * }
 */
export interface BaseStepProps {
    /** Current wizard state */
    state: WizardState;
    /** Function to update wizard state */
    updateState: (updates: Partial<WizardState>) => void;
    /** Function to control Next button enablement */
    setCanProceed: (canProceed: boolean) => void;
}

/**
 * Extended step props with navigation callbacks.
 *
 * Used by steps that need direct navigation control
 * (e.g., PrerequisitesStep for auto-advance).
 */
export interface NavigableStepProps extends BaseStepProps {
    /** Navigate to next step */
    onNext?: () => void;
    /** Navigate to previous step */
    onBack?: () => void;
}

/**
 * Step props with completed steps tracking.
 *
 * Used by steps that need to know what steps have been completed
 * (e.g., for validation or summary display).
 */
export interface TrackableStepProps extends BaseStepProps {
    /** List of completed steps (for navigation restrictions) */
    completedSteps?: WizardStep[];
}
