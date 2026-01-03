/**
 * Helper functions for ConfigurationSummary component (SOP 3, 5 compliance)
 */
import React from 'react';
import { Flex, Text } from '@/core/ui/components/aria';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import { WizardState, WizardStep } from '@/types/webview';

// Re-export pure helpers from separate file for testability
export { getStepStatus } from './stepStatusHelpers';

/**
 * Props for renderApiMeshStatus helper
 */
export interface ApiMeshStatusProps {
    state: WizardState;
    currentStepIndex: number;
    stepOrder: string[];
    completedSteps: WizardStep[];
    isStepCompleted: (stepId: string) => boolean;
}

/**
 * Render API Mesh status section based on wizard state (SOP 5 compliance)
 *
 * Handles 8 different display states:
 * 1. No workspace selected
 * 2. Before mesh step, never visited
 * 3. Before mesh step, previously visited (waiting)
 * 4. Checking mesh status
 * 5. Mesh exists and deployed/error/pending
 * 6. API enabled but no mesh (ready for creation)
 * 7. API not enabled
 * 8. Default/pending state
 */
export function renderApiMeshStatus({
    state,
    currentStepIndex,
    stepOrder,
    completedSteps,
    isStepCompleted,
}: ApiMeshStatusProps): React.ReactNode {
    const meshStepIndex = stepOrder.indexOf('api-mesh');
    const hasVisitedMesh = completedSteps.includes('api-mesh' as WizardStep);

    // No workspace selected
    if (!state.adobeWorkspace) {
        return <Text className="text-sm text-gray-600">Not selected</Text>;
    }

    // Before mesh step, never visited
    if (currentStepIndex < meshStepIndex && !hasVisitedMesh) {
        return <Text className="text-sm text-gray-600">Not selected</Text>;
    }

    // Before mesh step, previously visited (show waiting)
    if (currentStepIndex < meshStepIndex && hasVisitedMesh) {
        return (
            <Flex gap="size-100" alignItems="center">
                <Clock size="S" className="text-blue-600" />
                <Text className="text-sm text-gray-600">Waiting</Text>
            </Flex>
        );
    }

    // Currently checking
    if (state.apiMesh?.isChecking) {
        return (
            <Flex gap="size-100" alignItems="center">
                <Clock size="S" className="text-blue-600" />
                <Text className="text-sm text-gray-600">Checking...</Text>
            </Flex>
        );
    }

    // API enabled and mesh exists
    if (state.apiMesh?.apiEnabled && state.apiMesh?.meshExists) {
        return (
            <Flex gap="size-100" alignItems="center">
                {renderMeshStatusIcon(state.apiMesh.meshStatus)}
                <Text className="text-sm">
                    {getMeshStatusText(state.apiMesh.meshStatus)}
                </Text>
            </Flex>
        );
    }

    // API enabled but no mesh (ready for creation)
    if (state.apiMesh?.apiEnabled && !state.apiMesh?.meshExists) {
        return (
            <Flex gap="size-100" alignItems="center">
                {isStepCompleted('api-mesh') ? (
                    <CheckmarkCircle size="S" className="text-green-600" />
                ) : (
                    <Clock size="S" className="text-blue-600" />
                )}
                <Text className="text-sm text-gray-600">Ready for creation</Text>
            </Flex>
        );
    }

    // API not enabled
    if (state.apiMesh?.apiEnabled === false) {
        return (
            <Flex gap="size-100" alignItems="center">
                <AlertCircle size="S" className="text-red-600" />
                <Text className="text-sm text-red-600">Not enabled</Text>
            </Flex>
        );
    }

    // Default state
    return (
        <Flex gap="size-100" alignItems="center">
            <Clock size="S" className="text-blue-600" />
            <Text className="text-sm text-gray-600">Pending</Text>
        </Flex>
    );
}

/**
 * Render mesh status icon based on status
 */
function renderMeshStatusIcon(meshStatus: string | undefined): React.ReactNode {
    if (meshStatus === 'deployed') {
        return <CheckmarkCircle size="S" className="text-green-600" />;
    }
    if (meshStatus === 'error') {
        return <AlertCircle size="S" className="text-red-600" />;
    }
    return <Clock size="S" className="text-blue-600" />;
}

/**
 * Get mesh status display text
 */
function getMeshStatusText(meshStatus: string | undefined): string {
    if (meshStatus === 'deployed') return 'Mesh Deployed';
    if (meshStatus === 'error') return 'Mesh Error';
    return 'Mesh Pending';
}
