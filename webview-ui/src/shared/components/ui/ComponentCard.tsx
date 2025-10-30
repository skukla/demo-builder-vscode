import React from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Badge,
    ActionButton
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { cn } from '../../utils/classNames';

export interface ComponentCardProps {
    id: string;
    name: string;
    description: string;
    features?: string[];
    icon?: React.ReactNode;
    recommended?: boolean;
    selected: boolean;
    disabled?: boolean;
    onSelect: (id: string) => void;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({
    id,
    name,
    description,
    features,
    icon,
    recommended,
    selected,
    disabled,
    onSelect
}) => {
    return (
        <ActionButton
            onPress={() => !disabled && onSelect(id)}
            isQuiet
            width="100%"
            UNSAFE_className={cn('text-left', 'p-0', 'min-h-120')}
        >
            <View
                UNSAFE_style={{
                    backgroundColor: selected ? 'var(--spectrum-global-color-blue-100)' : 'var(--spectrum-global-color-gray-75)'
                }}
                borderRadius="medium"
                padding="size-300"
                width="100%"
                UNSAFE_className={cn(
                    'component-card',
                    selected && 'component-card-selected',
                    disabled && 'component-card-disabled',
                    'relative'
                )}
            >
                {selected && (
                    <View
                        UNSAFE_className={cn('absolute', 'top-2', 'right-2')}
                    >
                        <CheckmarkCircle 
                            size="S" 
                            UNSAFE_className="text-blue-600" 
                        />
                    </View>
                )}

                <Flex direction="column" gap="size-100">
                    <Flex alignItems="center" gap="size-100">
                        {icon && (
                            <View 
                                width="size-400" 
                                height="size-400"
                                UNSAFE_className={cn(
                                    'flex',
                                    'items-center',
                                    'justify-center',
                                    selected ? 'text-blue-600' : 'text-gray-700'
                                )}
                            >
                                {icon}
                            </View>
                        )}
                        <Flex direction="column" gap="size-50" flex>
                            <Flex alignItems="center" gap="size-100">
                                <Heading 
                                    level={4} 
                                    UNSAFE_className={cn(
                                        'text-md',
                                        'm-0',
                                        selected ? 'font-semibold' : 'font-medium'
                                    )}
                                >
                                    {name}
                                </Heading>
                                {recommended && (
                                    <Badge variant="positive" UNSAFE_className="text-xs">
                                        Recommended
                                    </Badge>
                                )}
                            </Flex>
                            <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'mt-1')}>
                                {description}
                            </Text>
                        </Flex>
                    </Flex>

                    {features && features.length > 0 && (
                        <Flex gap="size-75" wrap marginTop="size-100">
                            {features.slice(0, 3).map(feature => (
                                <Badge 
                                    key={feature} 
                                    variant="info"
                                    UNSAFE_className={cn('text-xs', 'p-badge')}
                                >
                                    {feature}
                                </Badge>
                            ))}
                            {features.length > 3 && (
                                <Badge 
                                    variant="neutral"
                                    UNSAFE_className={cn('text-xs', 'p-badge')}
                                >
                                    +{features.length - 3} more
                                </Badge>
                            )}
                        </Flex>
                    )}
                </Flex>
            </View>
        </ActionButton>
    );
};