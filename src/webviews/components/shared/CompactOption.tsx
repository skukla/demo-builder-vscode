import React from 'react';
import {
    View,
    Flex,
    Text,
    Radio,
    RadioGroup,
    Badge
} from '@adobe/react-spectrum';

interface CompactOptionProps {
    id: string;
    name: string;
    description: string;
    tags?: string[];
    icon?: React.ReactNode;
    recommended?: boolean;
}

export const CompactOption: React.FC<CompactOptionProps> = ({
    id,
    name,
    description,
    tags,
    icon,
    recommended
}) => {
    return (
        <Flex gap="size-200" alignItems="center">
            {icon && (
                <View 
                    width="size-400"
                    UNSAFE_style={{
                        color: 'var(--spectrum-global-color-gray-700)',
                        flexShrink: 0
                    }}
                >
                    {icon}
                </View>
            )}
            <View flex>
                <Flex alignItems="center" gap="size-100" marginBottom="size-50">
                    <Text UNSAFE_style={{ 
                        fontSize: '14px',
                        fontWeight: 500
                    }}>
                        {name}
                    </Text>
                    {recommended && (
                        <Badge variant="positive" UNSAFE_style={{ fontSize: '10px' }}>
                            Recommended
                        </Badge>
                    )}
                </Flex>
                <Text UNSAFE_style={{ 
                    fontSize: '12px',
                    color: 'var(--spectrum-global-color-gray-600)'
                }}>
                    {description}
                </Text>
                {tags && tags.length > 0 && (
                    <Flex gap="size-75" marginTop="size-75" wrap>
                        {tags.map(tag => (
                            <Text
                                key={tag}
                                UNSAFE_style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    backgroundColor: 'var(--spectrum-global-color-gray-200)',
                                    borderRadius: '4px',
                                    color: 'var(--spectrum-global-color-gray-700)'
                                }}
                            >
                                {tag}
                            </Text>
                        ))}
                    </Flex>
                )}
            </View>
        </Flex>
    );
};