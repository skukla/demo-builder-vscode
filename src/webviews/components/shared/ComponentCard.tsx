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

interface ComponentCardProps {
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
            UNSAFE_style={{
                textAlign: 'left',
                padding: 0,
                height: 'auto',
                minHeight: '120px'
            }}
        >
            <View
                backgroundColor={selected ? 'blue-100' : 'gray-75'}
                borderRadius="medium"
                padding="size-300"
                width="100%"
                UNSAFE_style={{
                    border: selected 
                        ? '2px solid var(--spectrum-global-color-blue-500)' 
                        : '1px solid var(--spectrum-global-color-gray-300)',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                }}
            >
                {selected && (
                    <View
                        UNSAFE_style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px'
                        }}
                    >
                        <CheckmarkCircle 
                            size="S" 
                            UNSAFE_style={{ 
                                color: 'var(--spectrum-global-color-blue-600)' 
                            }} 
                        />
                    </View>
                )}

                <Flex direction="column" gap="size-100">
                    <Flex alignItems="center" gap="size-100">
                        {icon && (
                            <View 
                                width="size-400" 
                                height="size-400"
                                UNSAFE_style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: selected 
                                        ? 'var(--spectrum-global-color-blue-600)'
                                        : 'var(--spectrum-global-color-gray-700)'
                                }}
                            >
                                {icon}
                            </View>
                        )}
                        <Flex direction="column" gap="size-50" flex>
                            <Flex alignItems="center" gap="size-100">
                                <Heading 
                                    level={4} 
                                    UNSAFE_style={{ 
                                        fontSize: '14px',
                                        margin: 0,
                                        fontWeight: selected ? 600 : 500
                                    }}
                                >
                                    {name}
                                </Heading>
                                {recommended && (
                                    <Badge variant="positive" UNSAFE_style={{ fontSize: '10px' }}>
                                        Recommended
                                    </Badge>
                                )}
                            </Flex>
                            <Text UNSAFE_style={{ 
                                fontSize: '12px', 
                                color: 'var(--spectrum-global-color-gray-600)',
                                marginTop: '2px'
                            }}>
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
                                    UNSAFE_style={{ 
                                        fontSize: '10px',
                                        padding: '2px 6px'
                                    }}
                                >
                                    {feature}
                                </Badge>
                            ))}
                            {features.length > 3 && (
                                <Badge 
                                    variant="neutral"
                                    UNSAFE_style={{ 
                                        fontSize: '10px',
                                        padding: '2px 6px'
                                    }}
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