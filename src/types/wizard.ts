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

/**
 * Condition for showing a wizard step
 */
export interface StepCondition {
    /**
     * Stack property that must be truthy for this step to be shown.
     * Maps to Stack properties like 'requiresGitHub' or 'requiresDaLive'.
     */
    stackRequires?: 'requiresGitHub' | 'requiresDaLive';

    /**
     * Array of stack properties where at least ONE must be truthy.
     * Used for combined steps that should show when GitHub OR DA.live is required.
     */
    stackRequiresAny?: Array<'requiresGitHub' | 'requiresDaLive'>;

    /**
     * If true, this step is only shown when NO predefined stack is selected.
     * Used for steps like Component Selection that are hidden when a stack
     * already determines the components, but should appear for a future
     * "Custom" option where users manually select components.
     *
     * NOTE: This condition is deliberately kept for future extensibility.
     * When a "Custom" brand option is added, it won't set selectedStack,
     * allowing this step to appear for manual component configuration.
     */
    showWhenNoStack?: boolean;

    /**
     * If true, this step is only shown in create mode (not edit mode).
     * Used for steps like EDS preflight that create external resources
     * which already exist for existing projects.
     */
    createModeOnly?: boolean;
}

/**
 * One entry of wizard-steps.json — THE step-definition shape, shared by the
 * producer (createProject reads and validates the config) and every consumer
 * (StepLogger, the wizard bundle's init data, wizardHelpers' filters). This
 * was declared four times with subtly different fields before; producer and
 * consumer must check against this one declaration.
 */
export interface WizardStepConfigWithRequirements {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    /** Optional: Component IDs that must ALL be selected for this step to appear (AND logic) */
    requiredComponents?: string[];
    /** Optional: Component IDs where ANY selection makes this step appear (OR logic) */
    requiredAny?: string[];
    /** Optional: Condition for stack/auth-based filtering. */
    condition?: StepCondition;
}
