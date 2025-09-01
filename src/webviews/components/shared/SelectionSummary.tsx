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
import { cn } from '../../utils/classNames';

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
            UNSAFE_className="selection-summary-container"
        >
            <Heading level={3} marginBottom="size-300">
                Your Configuration
            </Heading>

            {/* Frontend Selection */}
            <View marginBottom="size-250">
                <Text UNSAFE_className="selection-summary-label">
                    Frontend
                </Text>
                {frontend ? (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />
                        <Text UNSAFE_className="selection-summary-value">
                            {frontend.name}
                        </Text>
                    </Flex>
                ) : (
                    <Text UNSAFE_className="selection-summary-placeholder">
                        Not selected
                    </Text>
                )}
            </View>

            <Divider size="S" />

            {/* Backend Selection */}
            <View marginTop="size-250" marginBottom="size-250">
                <Text UNSAFE_className="selection-summary-label">
                    Backend
                </Text>
                {backend ? (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />
                        <Text UNSAFE_className="selection-summary-value">
                            {backend.name}
                        </Text>
                    </Flex>
                ) : (
                    <Text UNSAFE_className="selection-summary-placeholder">
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
                            <Text UNSAFE_className={cn('text-sm', 'font-medium')}>
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
                        <Text UNSAFE_className="text-xs">
                            Estimated setup: ~5 minutes
                        </Text>
                    </Flex>
                </Well>
            )}
        </View>
    );
};