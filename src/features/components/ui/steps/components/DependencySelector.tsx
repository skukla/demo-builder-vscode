import React from 'react';
import { Text, View, Checkbox, Flex } from '@adobe/react-spectrum';
import { cn } from '@/core/ui/utils/classNames';

interface SystemOption {
    id: string;
    name: string;
    description: string;
}

interface DependencySelectorProps {
    integrationsOptions: SystemOption[];
    appBuilderOptions: SystemOption[];
    selectedIntegrations: Set<string>;
    selectedAppBuilder: Set<string>;
    onIntegrationsChange: (id: string, selected: boolean) => void;
    onAppBuilderChange: (id: string, selected: boolean) => void;
}

export function DependencySelector({
    integrationsOptions,
    appBuilderOptions,
    selectedIntegrations,
    selectedAppBuilder,
    onIntegrationsChange,
    onAppBuilderChange,
}: DependencySelectorProps) {
    return (
        <>
            {/* External Systems Section */}
            <View flex="1" minWidth="300px">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                    External Systems
                </Text>

                <View UNSAFE_className={cn('border', 'rounded', 'bg-gray-50', 'p-3')}>
                    {integrationsOptions.map((system) => (
                        <Checkbox
                            key={system.id}
                            isSelected={selectedIntegrations.has(system.id)}
                            onChange={(isSelected) => onIntegrationsChange(system.id, isSelected)}
                            aria-label={system.name}
                            UNSAFE_className="mb-2"
                        >
                            <Flex direction="column" gap="size-50">
                                <Text UNSAFE_className={cn('text-md', 'font-medium', 'block')}>
                                    {system.name}
                                </Text>
                                <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'block')}>
                                    {system.description}
                                </Text>
                            </Flex>
                        </Checkbox>
                    ))}
                </View>
            </View>

            {/* App Builder Apps Section */}
            <View flex="1" minWidth="300px">
                <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                    App Builder Apps
                </Text>

                <View UNSAFE_className={cn('border', 'rounded', 'bg-gray-50', 'p-3')}>
                    {appBuilderOptions.map((app) => (
                        <Checkbox
                            key={app.id}
                            isSelected={selectedAppBuilder.has(app.id)}
                            onChange={(isSelected) => onAppBuilderChange(app.id, isSelected)}
                            aria-label={app.name}
                            UNSAFE_className="mb-2"
                        >
                            <Flex direction="column" gap="size-50">
                                <Text UNSAFE_className={cn('text-md', 'font-medium', 'block')}>
                                    {app.name}
                                </Text>
                                <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'block')}>
                                    {app.description}
                                </Text>
                            </Flex>
                        </Checkbox>
                    ))}
                </View>
            </View>
        </>
    );
}
