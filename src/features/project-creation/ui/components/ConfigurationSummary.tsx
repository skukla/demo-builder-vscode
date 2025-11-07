import { View, Heading, Text, Flex, Divider } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import React from 'react';
import { WizardState, WizardStep } from '@/webview-ui/shared/types';
import { cn } from '@/webview-ui/shared/utils/classNames';

interface ConfigurationSummaryProps {
    state: WizardState;
    completedSteps?: WizardStep[];
    currentStep?: WizardStep;
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
    return (
        <View height="100%">
            <Heading level={3} marginBottom="size-300">
                Configuration Summary
            </Heading>

            {/* Authentication Status */}
            <View marginTop="size-200" marginBottom="size-200">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                    Organization
                </Text>
                <View marginTop="size-100">
                    {state.adobeAuth.isAuthenticated ? (
                        state.adobeOrg ? (
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-sm">
                                    {state.adobeOrg.name}
                                </Text>
                            </Flex>
                        ) : state.adobeAuth.isChecking ? (
                            <Flex gap="size-100" alignItems="center">
                                <Clock size="S" UNSAFE_className="text-blue-600" />
                                <Text UNSAFE_className="text-sm text-gray-600">Switching...</Text>
                            </Flex>
                        ) : (
                            <Text UNSAFE_className="text-sm text-gray-600">No organization selected</Text>
                        )
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">Not authenticated</Text>
                    )}
                </View>
            </View>

            <Divider size="S" />

            {/* Project Selection */}
            <View marginTop="size-200" marginBottom="size-200">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                    Project
                </Text>
                <View marginTop="size-100">
                    {state.adobeProject ? (
                        <Flex gap="size-100" alignItems="center">
                            {isStepCompleted('adobe-project') ? (
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            ) : (
                                <Clock size="S" UNSAFE_className="text-blue-600" />
                            )}
                            <View>
                                <Text UNSAFE_className="text-sm">
                                    {state.adobeProject.title || state.adobeProject.name}
                                </Text>
                                {state.adobeProject.description && (
                                    <Text UNSAFE_className="text-xs text-gray-600">
                                        {state.adobeProject.description}
                                    </Text>
                                )}
                            </View>
                        </Flex>
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>
                    )}
                </View>
            </View>

            <Divider size="S" />

            {/* Workspace Selection */}
            <View marginTop="size-200" marginBottom="size-200">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                    Workspace
                </Text>
                <View marginTop="size-100">
                    {state.adobeWorkspace ? (
                        <Flex gap="size-100" alignItems="center">
                            {isStepCompleted('adobe-workspace') ? (
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            ) : (
                                <Clock size="S" UNSAFE_className="text-blue-600" />
                            )}
                            <View>
                                <Text UNSAFE_className="text-sm">
                                    {state.adobeWorkspace.title || state.adobeWorkspace.name}
                                </Text>
                            </View>
                        </Flex>
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>
                    )}
                </View>
            </View>

            <Divider size="S" />

            {/* API Mesh */}
            <View marginTop="size-200" marginBottom="size-200">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                    API Mesh
                </Text>
                <View marginTop="size-100">
                    {!state.adobeWorkspace ? (
                        <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>
                    ) : getCurrentStepIndex() < stepOrder.indexOf('api-mesh') && !completedSteps.includes('api-mesh') ? (
                        // Never been to api-mesh step yet - show "Not selected"
                        <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>
                    ) : getCurrentStepIndex() < stepOrder.indexOf('api-mesh') && completedSteps.includes('api-mesh') ? (
                        // We've been there before, but now we're before it - show "Waiting"
                        <Flex gap="size-100" alignItems="center">
                            <Clock size="S" UNSAFE_className="text-blue-600" />
                            <Text UNSAFE_className="text-sm text-gray-600">Waiting</Text>
                        </Flex>
                    ) : state.apiMesh?.isChecking ? (
                        <Flex gap="size-100" alignItems="center">
                            <Clock size="S" UNSAFE_className="text-blue-600" />
                            <Text UNSAFE_className="text-sm text-gray-600">Checking...</Text>
                        </Flex>
                    ) : state.apiMesh?.apiEnabled && state.apiMesh?.meshExists ? (
                        <Flex gap="size-100" alignItems="center">
                            {state.apiMesh?.meshStatus === 'deployed' || state.apiMesh?.meshStatus === 'success' ? (
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            ) : state.apiMesh?.meshStatus === 'error' ? (
                                <AlertCircle size="S" UNSAFE_className="text-red-600" />
                            ) : (
                                <Clock size="S" UNSAFE_className="text-blue-600" />
                            )}
                            <Text UNSAFE_className="text-sm">
                                {state.apiMesh?.meshStatus === 'deployed' || state.apiMesh?.meshStatus === 'success' ? 'Mesh Deployed' :
                                 state.apiMesh?.meshStatus === 'error' ? 'Mesh Error' :
                                 'Mesh Pending'}
                            </Text>
                        </Flex>
                    ) : state.apiMesh?.apiEnabled && !state.apiMesh?.meshExists ? (
                        <Flex gap="size-100" alignItems="center">
                            {isStepCompleted('api-mesh') ? (
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            ) : (
                                <Clock size="S" UNSAFE_className="text-blue-600" />
                            )}
                            <Text UNSAFE_className="text-sm text-gray-600">Ready for creation</Text>
                        </Flex>
                    ) : state.apiMesh?.apiEnabled === false ? (
                        <Flex gap="size-100" alignItems="center">
                            <AlertCircle size="S" UNSAFE_className="text-red-600" />
                            <Text UNSAFE_className="text-sm text-red-600">Not enabled</Text>
                        </Flex>
                    ) : (
                        <Flex gap="size-100" alignItems="center">
                            <Clock size="S" UNSAFE_className="text-blue-600" />
                            <Text UNSAFE_className="text-sm text-gray-600">Pending</Text>
                        </Flex>
                    )}
                </View>
            </View>

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