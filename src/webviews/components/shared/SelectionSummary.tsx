import React from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Divider,
    Well
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import Settings from '@spectrum-icons/workflow/Settings';

interface SelectionSummaryProps {
    frontend?: {
        id: string;
        name: string;
    };
    backend?: {
        id: string;
        name: string;
    };
    dependencyCount?: number;
}

export const SelectionSummary: React.FC<SelectionSummaryProps> = ({
    frontend,
    backend,
    dependencyCount = 0
}) => {
    const isComplete = frontend && backend;

    return (
        <View
            backgroundColor="gray-50"
            borderRadius="medium"
            padding="size-300"
            height="100%"
            UNSAFE_style={{
                border: '1px solid var(--spectrum-global-color-gray-300)'
            }}
        >
            <Heading level={3} marginBottom="size-300">
                Your Configuration
            </Heading>

            {/* Frontend Selection */}
            <View marginBottom="size-250">
                <Text UNSAFE_style={{ 
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--spectrum-global-color-gray-600)',
                    marginBottom: '8px'
                }}>
                    Frontend
                </Text>
                {frontend ? (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle size="XS" UNSAFE_style={{ color: 'var(--spectrum-global-color-green-600)' }} />
                        <Text UNSAFE_style={{ fontSize: '13px', fontWeight: 500 }}>
                            {frontend.name}
                        </Text>
                    </Flex>
                ) : (
                    <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-500)' }}>
                        Not selected
                    </Text>
                )}
            </View>

            <Divider size="S" />

            {/* Backend Selection */}
            <View marginTop="size-250" marginBottom="size-250">
                <Text UNSAFE_style={{ 
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--spectrum-global-color-gray-600)',
                    marginBottom: '8px'
                }}>
                    Backend
                </Text>
                {backend ? (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle size="XS" UNSAFE_style={{ color: 'var(--spectrum-global-color-green-600)' }} />
                        <Text UNSAFE_style={{ fontSize: '13px', fontWeight: 500 }}>
                            {backend.name}
                        </Text>
                    </Flex>
                ) : (
                    <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-500)' }}>
                        Not selected
                    </Text>
                )}
            </View>

            {/* Dependencies Summary */}
            {isComplete && dependencyCount > 0 && (
                <>
                    <Divider size="S" />
                    <View marginTop="size-250">
                        <Flex alignItems="center" gap="size-100">
                            <Settings size="XS" />
                            <Text UNSAFE_style={{ fontSize: '12px', fontWeight: 500 }}>
                                {dependencyCount} {dependencyCount === 1 ? 'dependency' : 'dependencies'} selected
                            </Text>
                        </Flex>
                    </View>
                </>
            )}

            {/* Setup Info */}
            {isComplete && (
                <Well marginTop="size-400">
                    <Flex alignItems="center" gap="size-100">
                        <Clock size="XS" />
                        <Text UNSAFE_style={{ fontSize: '11px' }}>
                            Estimated setup: ~5 minutes
                        </Text>
                    </Flex>
                </Well>
            )}
        </View>
    );
};