import React, { useEffect } from 'react';
import { 
    View, 
    Heading, 
    Text, 
    Well, 
    Flex, 
    Divider,
    Content 
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Globe from '@spectrum-icons/workflow/Globe';
import User from '@spectrum-icons/workflow/User';
import Folder from '@spectrum-icons/workflow/Folder';
import Link from '@spectrum-icons/workflow/Link';
import Settings from '@spectrum-icons/workflow/Settings';
import { WizardState } from '../../types';

interface ReviewStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function ReviewStep({ state, setCanProceed }: ReviewStepProps) {
    useEffect(() => {
        // Can proceed if we have all required data
        const canProceed = !!(
            state.projectName &&
            state.adobeOrg?.id &&
            state.adobeProject?.id &&
            state.commerceConfig?.url &&
            state.commerceConfig?.adminUser &&
            state.commerceConfig?.adminPassword
        );
        setCanProceed(canProceed);
    }, [state, setCanProceed]);

    return (
        <View padding="size-400" maxWidth="size-6000">
            <Heading level={2} marginBottom="size-300">
                Review Configuration
            </Heading>
            
            <Text marginBottom="size-400">
                Please review your configuration before creating the demo project. Click "Create Project" to proceed.
            </Text>

            {/* Project Details */}
            <Well marginBottom="size-300">
                <Flex direction="column" gap="size-200">
                    <Flex gap="size-200" alignItems="center">
                        <Globe />
                        <Text><strong>Project Details</strong></Text>
                    </Flex>
                    <Divider size="S" />
                    <View paddingStart="size-400">
                        <Flex direction="column" gap="size-100">
                            <Flex justifyContent="space-between">
                                <Text color="gray-700">Name:</Text>
                                <Text><strong>{state.projectName || 'Not set'}</strong></Text>
                            </Flex>
                            <Flex justifyContent="space-between">
                                <Text color="gray-700">Template:</Text>
                                <Text>{state.projectTemplate || 'commerce-paas'}</Text>
                            </Flex>
                        </Flex>
                    </View>
                </Flex>
            </Well>

            {/* Adobe Configuration */}
            <Well marginBottom="size-300">
                <Flex direction="column" gap="size-200">
                    <Flex gap="size-200" alignItems="center">
                        <User />
                        <Text><strong>Adobe Configuration</strong></Text>
                    </Flex>
                    <Divider size="S" />
                    <View paddingStart="size-400">
                        <Flex direction="column" gap="size-100">
                            {state.adobeAuth?.email && (
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">Authenticated as:</Text>
                                    <Text>{state.adobeAuth.email}</Text>
                                </Flex>
                            )}
                            {state.adobeOrg && (
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">Organization:</Text>
                                    <Text><strong>{state.adobeOrg.name}</strong></Text>
                                </Flex>
                            )}
                            {state.adobeProject && (
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">Project:</Text>
                                    <Text><strong>{state.adobeProject.title}</strong></Text>
                                </Flex>
                            )}
                        </Flex>
                    </View>
                </Flex>
            </Well>

            {/* Commerce Configuration */}
            {state.commerceConfig && (
                <Well marginBottom="size-300">
                    <Flex direction="column" gap="size-200">
                        <Flex gap="size-200" alignItems="center">
                            <Link />
                            <Text><strong>Commerce Configuration</strong></Text>
                        </Flex>
                        <Divider size="S" />
                        <View paddingStart="size-400">
                            <Flex direction="column" gap="size-100">
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">URL:</Text>
                                    <Text><strong>{state.commerceConfig.url}</strong></Text>
                                </Flex>
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">Environment:</Text>
                                    <Text>{state.commerceConfig.environment || 'staging'}</Text>
                                </Flex>
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">Admin User:</Text>
                                    <Text>{state.commerceConfig.adminUser}</Text>
                                </Flex>
                                <Flex justifyContent="space-between">
                                    <Text color="gray-700">Sample Data:</Text>
                                    <Text>{state.commerceConfig.sampleData ? 'Yes' : 'No'}</Text>
                                </Flex>
                            </Flex>
                        </View>
                    </Flex>
                </Well>
            )}

            {/* Ready to Create */}
            <Well backgroundColor="green-100">
                <Flex gap="size-200" alignItems="center">
                    <CheckmarkCircle color="positive" />
                    <Content>
                        <Text>
                            <strong>Ready to create your demo project!</strong>
                        </Text>
                        <Text elementType="small" color="gray-700">
                            Click "Create Project" to start the setup process. This may take several minutes.
                        </Text>
                    </Content>
                </Flex>
            </Well>
        </View>
    );
}