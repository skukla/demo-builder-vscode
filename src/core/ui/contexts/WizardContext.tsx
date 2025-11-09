import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export interface WizardStep {
    id: string;
    label: string;
    isOptional?: boolean;
}

interface WizardContextValue {
    /** Current step index */
    currentStep: number;
    /** All wizard steps */
    steps: WizardStep[];
    /** Navigate to a specific step */
    goToStep: (stepIndex: number) => void;
    /** Go to next step */
    goNext: () => void;
    /** Go to previous step */
    goBack: () => void;
    /** Check if can proceed to next step */
    canProceed: boolean;
    /** Set whether user can proceed */
    setCanProceed: (can: boolean) => void;
    /** Check if on first step */
    isFirstStep: boolean;
    /** Check if on last step */
    isLastStep: boolean;
}

const WizardContext = createContext<WizardContextValue | undefined>(undefined);

export interface WizardProviderProps {
    children: ReactNode;
    /** Array of wizard steps */
    steps: WizardStep[];
    /** Initial step index (default: 0) */
    initialStep?: number;
}

/**
 * Context Provider: Wizard
 *
 * Manages wizard navigation and step progression.
 * Handles step tracking, navigation, and validation state.
 *
 * @example
 * ```tsx
 * const steps = [
 *   { id: 'welcome', label: 'Welcome' },
 *   { id: 'config', label: 'Configuration' },
 *   { id: 'review', label: 'Review' }
 * ];
 *
 * <WizardProvider steps={steps}>
 *   <WizardUI />
 * </WizardProvider>
 * ```
 */
export const WizardProvider: React.FC<WizardProviderProps> = ({
    children,
    steps,
    initialStep = 0
}) => {
    const [currentStep, setCurrentStep] = useState(initialStep);
    const [canProceed, setCanProceed] = useState(false);

    const goToStep = useCallback((stepIndex: number) => {
        if (stepIndex >= 0 && stepIndex < steps.length) {
            setCurrentStep(stepIndex);
            setCanProceed(false); // Reset proceed state on navigation
        }
    }, [steps.length]);

    const goNext = useCallback(() => {
        if (currentStep < steps.length - 1 && canProceed) {
            setCurrentStep(prev => prev + 1);
            setCanProceed(false); // Reset for next step
        }
    }, [currentStep, steps.length, canProceed]);

    const goBack = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
            setCanProceed(true); // Can always proceed back
        }
    }, [currentStep]);

    const value: WizardContextValue = {
        currentStep,
        steps,
        goToStep,
        goNext,
        goBack,
        canProceed,
        setCanProceed,
        isFirstStep: currentStep === 0,
        isLastStep: currentStep === steps.length - 1
    };

    return (
        <WizardContext.Provider value={value}>
            {children}
        </WizardContext.Provider>
    );
};

/**
 * Hook: useWizard
 *
 * Access wizard state and navigation controls.
 * Must be used within a WizardProvider.
 *
 * @example
 * ```tsx
 * const { currentStep, goNext, goBack, canProceed, setCanProceed } = useWizard();
 *
 * useEffect(() => {
 *   // Enable next button when form is valid
 *   setCanProceed(isFormValid);
 * }, [isFormValid]);
 *
 * return (
 *   <div>
 *     <button onClick={goBack} disabled={isFirstStep}>Back</button>
 *     <button onClick={goNext} disabled={!canProceed}>Next</button>
 *   </div>
 * );
 * ```
 */
export const useWizard = (): WizardContextValue => {
    const context = useContext(WizardContext);
    if (!context) {
        throw new Error('useWizard must be used within a WizardProvider');
    }
    return context;
};
