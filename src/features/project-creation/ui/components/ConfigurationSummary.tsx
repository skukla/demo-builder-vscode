import { View, Heading, Text, Flex, Divider } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import React from 'react';
import { WizardState, WizardStep } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';
import { getStepStatus } from './configurationSummaryHelpers';

interface ConfigurationSummaryProps {
    state: WizardState;
    completedSteps?: WizardStep[];
    currentStep?: WizardStep;
}

/**
 * StatusSection - Reusable status display section
 *
 * Displays a labeled section with icon indicating status (completed/pending/checking)
 */
interface StatusSectionProps {
    label: string;
    value?: string;
    description?: string;
    status: 'completed' | 'pending' | 'checking' | 'empty' | 'error';
    emptyText?: string;
    statusText?: string;
}

function StatusSection({ label, value, description, status, emptyText = 'Not selected', statusText }: StatusSectionProps) {
    const renderIcon = () => {
        switch (status) {
            case 'completed':
                return <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />;
            case 'checking':
            case 'pending':
                return <Clock size="S" UNSAFE_className="text-blue-600" />;
            case 'error':
                return <AlertCircle size="S" UNSAFE_className="text-red-600" />;
            default:
                return null;
        }
    };

    /**
     * Render status content based on current status
     * Extracts 3-branch nested ternary per SOP §5
     */
    const renderStatusContent = (): React.ReactNode => {
        if (status === 'empty') {
            return <Text UNSAFE_className="text-sm text-gray-600">{emptyText}</Text>;
        }

        if (status === 'checking') {
            return (
                <Flex gap="size-100" alignItems="center">
                    {renderIcon()}
                    <Text UNSAFE_className="text-sm text-gray-600">{statusText || 'Checking...'}</Text>
                </Flex>
            );
        }

        return (
            <Flex gap="size-100" alignItems="center">
                {renderIcon()}
                <View>
                    <Text UNSAFE_className={status === 'error' ? 'text-sm text-red-600' : 'text-sm'}>
                        {statusText || value}
                    </Text>
                    {description && (
                        <Text UNSAFE_className="text-xs text-gray-600">{description}</Text>
                    )}
                </View>
            </Flex>
        );
    };

    return (
        <View marginTop="size-200" marginBottom="size-200">
            <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                {label}
            </Text>
            <View marginTop="size-100">
                {renderStatusContent()}
            </View>
        </View>
    );
}

export function ConfigurationSummary({ state, completedSteps = [], currentStep }: ConfigurationSummaryProps) {
    // Define step order for determining if a step is "ahead" of current step
    const stepOrder: WizardStep[] = [
        'welcome',
        'component-selection',
        'prerequisites',
        'adobe-auth',
        'adobe-project',
        'adobe-workspace',
        'api-mesh',
        'settings',
        'review',
        'project-creation',
    ];
    
    const getCurrentStepIndex = () => {
        if (!currentStep) return -1;
        return stepOrder.indexOf(currentStep);
    };
    
    const isStepCompleted = (step: WizardStep) => {
        const currentIndex = getCurrentStepIndex();
        const stepIndex = stepOrder.indexOf(step);
        
        // If we're before this step, it's pending (not completed)
        if (currentIndex >= 0 && stepIndex > currentIndex) {
            return false;
        }
        
        // Otherwise, check completedSteps array
        return completedSteps.includes(step);
    };
    // Helper to determine organization status
    const getOrgStatus = (): StatusSectionProps['status'] => {
        if (!state.adobeAuth.isAuthenticated) return 'empty';
        if (state.adobeAuth.isChecking) return 'checking';
        if (state.adobeOrg) return 'completed';
        return 'empty';
    };

    const getOrgEmptyText = () => {
        if (!state.adobeAuth.isAuthenticated) return 'Not authenticated';
        return 'No organization selected';
    };

    return (
        <View height="100%">
            <Heading level={3} marginBottom="size-300">
                Configuration Summary
            </Heading>

            {/* Authentication Status */}
            <StatusSection
                label="Organization"
                value={state.adobeOrg?.name}
                status={getOrgStatus()}
                emptyText={getOrgEmptyText()}
                statusText={state.adobeAuth.isChecking ? 'Switching...' : undefined}
            />

            <Divider size="S" />

            {/* Project Selection */}
            <StatusSection
                label="Project"
                value={state.adobeProject?.title || state.adobeProject?.name}
                description={state.adobeProject?.description}
                status={getStepStatus(!!state.adobeProject, isStepCompleted('adobe-project'))}
            />

            <Divider size="S" />

            {/* Workspace Selection */}
            <StatusSection
                label="Workspace"
                value={state.adobeWorkspace?.title || state.adobeWorkspace?.name}
                status={getStepStatus(!!state.adobeWorkspace, isStepCompleted('adobe-workspace'))}
            />

            {/* Note: API Mesh section removed - mesh is now deployed automatically during project creation */}

            <style>{`
                .text-uppercase {
                    text-transform: uppercase;
                }
                
                .letter-spacing-05 {
                    letter-spacing: 0.05em;
                }
                
                .font-semibold { font-weight: 600; }
                .font-medium { font-weight: 500; }
                
                .text-xs {
                    font-size: 0.75rem;
                }
                
                .text-sm {
                    font-size: 0.875rem;
                }
                
                .text-gray-600 {
                    color: var(--spectrum-global-color-gray-600);
                }
                
                .text-gray-700 {
                    color: var(--spectrum-global-color-gray-700);
                }
                
                .text-green-600 {
                    color: var(--spectrum-global-color-green-600);
                }
 
                .text-orange-600 { color: var(--spectrum-global-color-orange-600); }
                
             `}</style>
        </View>
    );
}