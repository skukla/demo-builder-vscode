import React, { forwardRef } from 'react';
import { Text, Picker, Item, View, Checkbox, Flex } from '@adobe/react-spectrum';
import LockClosed from '@spectrum-icons/workflow/LockClosed';
import { cn } from '@/core/ui/utils/classNames';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';

interface ComponentOption {
    id: string;
    name: string;
    description: string;
}

interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}

interface FrontendSelectorProps {
    frontendOptions: ComponentOption[];
    frontendDependencies: DependencyOption[];
    selectedFrontend: string;
    selectedDependencies: Set<string>;
    onChange: (frontendId: string) => void;
    onDependencyToggle: (id: string, selected: boolean) => void;
}

export const FrontendSelector = forwardRef<HTMLDivElement, FrontendSelectorProps>(
    ({ frontendOptions, frontendDependencies, selectedFrontend, selectedDependencies, onChange, onDependencyToggle }, ref) => {
        return (
            <View flex="1" minWidth="300px">
                <div ref={ref}>
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        Frontend
                    </Text>

                    <ErrorBoundary
                        onError={(error) => {
                            console.error('[FrontendSelector] Picker error:', error);
                        }}
                    >
                        <Picker
                            width="100%"
                            selectedKey={selectedFrontend}
                            onSelectionChange={(key) => onChange(key as string)}
                            placeholder="Select frontend system"
                            aria-label="Select frontend system"
                            isQuiet={false}
                            align="start"
                            direction="bottom"
                            shouldFlip={false}
                            menuWidth="size-4600"
                            UNSAFE_className={cn('cursor-pointer')}
                        >
                            {frontendOptions.map((option) => (
                                <Item key={option.id} textValue={option.name}>
                                    <Text>{option.name}</Text>
                                    <Text slot="description">{option.description}</Text>
                                </Item>
                            ))}
                        </Picker>
                    </ErrorBoundary>

                    {/* Frontend Dependencies */}
                    {selectedFrontend && frontendDependencies.length > 0 && (
                        <View marginTop="size-150">
                            {frontendDependencies.map(dep => (
                                <Checkbox
                                    key={dep.id}
                                    isSelected={selectedDependencies.has(dep.id)}
                                    isDisabled={dep.required}
                                    onChange={(isSelected) => {
                                        // Guard against onChange firing on disabled checkboxes (test environment issue)
                                        if (!dep.required) {
                                            onDependencyToggle(dep.id, isSelected);
                                        }
                                    }}
                                    aria-label={dep.name}
                                    UNSAFE_className="mb-1"
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        {dep.required && (
                                            <LockClosed size="XS" UNSAFE_className="text-gray-600" />
                                        )}
                                        <Text UNSAFE_className="text-md">
                                            {dep.name}
                                        </Text>
                                    </Flex>
                                </Checkbox>
                            ))}
                        </View>
                    )}
                </div>
            </View>
        );
    }
);

FrontendSelector.displayName = 'FrontendSelector';
