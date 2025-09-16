import React from 'react';
import { View, Heading, Text, Flex, Divider } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { WizardState } from '../../types';
import { cn } from '../../utils/classNames';

interface ConfigurationSummaryProps {
    state: WizardState;
}

export function ConfigurationSummary({ state }: ConfigurationSummaryProps) {
    return (
        <View height="100%">
            <Heading level={3} marginBottom="size-300">
                Configuration Summary
            </Heading>

            {/* Authentication Status */}
            <View marginBottom="size-200">
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
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
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
            <View marginTop="size-200">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                    Workspace
                </Text>
                <View marginTop="size-100">
                    {state.adobeWorkspace ? (
                        <Flex gap="size-100" alignItems="center">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            <Text UNSAFE_className="text-sm">
                                {state.adobeWorkspace.title || state.adobeWorkspace.name}
                            </Text>
                        </Flex>
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">Not selected</Text>
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
                
                .font-semibold {
                    font-weight: 600;
                }
                
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
            `}</style>
        </View>
    );
}