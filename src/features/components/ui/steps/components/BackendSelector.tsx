import React from 'react';
import { Text, Picker, Item, View, Checkbox, Flex } from '@adobe/react-spectrum';
import LockClosed from '@spectrum-icons/workflow/LockClosed';
import { cn } from '@/core/ui/utils/classNames';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';

interface ComponentOption {
    id: string;
    name: string;
    description: string;
}

interface ServiceOption {
    id: string;
    name: string;
    required: boolean;
}

interface BackendSelectorProps {
    backendOptions: ComponentOption[];
    backendServices: ServiceOption[];
    selectedBackend: string;
    selectedServices: Set<string>;
    onChange: (backendId: string) => void;
    onServiceToggle: (id: string, selected: boolean) => void;
}

export function BackendSelector({
    backendOptions,
    backendServices,
    selectedBackend,
    selectedServices,
    onChange,
    onServiceToggle,
}: BackendSelectorProps) {
    return (
        <View flex="1" minWidth="300px">
            <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                Backend
            </Text>

            <ErrorBoundary
                onError={(error) => {
                    console.error('[BackendSelector] Picker error:', error);
                }}
            >
                <Picker
                    width="100%"
                    selectedKey={selectedBackend}
                    onSelectionChange={(key) => onChange(key as string)}
                    placeholder="Select backend system"
                    aria-label="Select backend system"
                    isQuiet={false}
                    align="start"
                    direction="bottom"
                    shouldFlip={false}
                    menuWidth="size-4600"
                    UNSAFE_className={cn('cursor-pointer')}
                >
                    {backendOptions.map((option) => (
                        <Item key={option.id} textValue={option.name}>
                            <Text>{option.name}</Text>
                            <Text slot="description">{option.description}</Text>
                        </Item>
                    ))}
                </Picker>
            </ErrorBoundary>

            {/* Backend Services */}
            {selectedBackend && backendServices.length > 0 && (
                <View marginTop="size-150">
                    {backendServices.map(service => (
                        <Checkbox
                            key={service.id}
                            isSelected={selectedServices.has(service.id)}
                            isDisabled={service.required}
                            onChange={(isSelected) => {
                                // Guard against onChange firing on disabled checkboxes (test environment issue)
                                if (!service.required) {
                                    onServiceToggle(service.id, isSelected);
                                }
                            }}
                            aria-label={service.name}
                            UNSAFE_className="mb-1"
                        >
                            <Flex alignItems="center" gap="size-50">
                                {service.required && (
                                    <LockClosed size="XS" UNSAFE_className="text-gray-600" />
                                )}
                                <Text UNSAFE_className="text-md">
                                    {service.name}
                                </Text>
                            </Flex>
                        </Checkbox>
                    ))}
                </View>
            )}
        </View>
    );
}
