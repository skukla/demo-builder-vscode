import { View, Heading, Divider } from '@adobe/react-spectrum';
import React from 'react';
import { getStepStatus } from './configurationSummaryHelpers';
import { StatusSection, type StatusSectionProps } from './StatusSection';
import { WizardState, WizardStep } from '@/types/webview';

interface ConfigurationSummaryProps {
    state: WizardState;
    completedSteps?: WizardStep[];
}

export function ConfigurationSummary({ state, completedSteps = [] }: ConfigurationSummaryProps) {
    const isStepCompleted = (step: WizardStep) => completedSteps.includes(step);

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
