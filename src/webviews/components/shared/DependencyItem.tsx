import React from 'react';
import {
    View,
    Flex,
    Text,
    Checkbox,
    Badge
} from '@adobe/react-spectrum';
import Info from '@spectrum-icons/workflow/Info';

interface DependencyItemProps {
    id: string;
    name: string;
    description: string;
    required: boolean;
    selected: boolean;
    impact?: 'minimal' | 'moderate' | 'significant';
    onToggle?: (id: string, selected: boolean) => void;
}

export const DependencyItem: React.FC<DependencyItemProps> = ({
    id,
    name,
    description,
    required,
    selected,
    impact,
    onToggle
}) => {
    const impactColors = {
        minimal: 'green',
        moderate: 'orange',
        significant: 'red'
    };

    return (
        <View
            padding="size-200"
            backgroundColor={selected ? 'gray-75' : 'transparent'}
            borderRadius="medium"
            UNSAFE_style={{
                border: '1px solid var(--spectrum-global-color-gray-200)',
                transition: 'all 0.2s ease'
            }}
        >
            <Checkbox
                isSelected={selected}
                isDisabled={required}
                onChange={(isSelected) => onToggle?.(id, isSelected)}
                UNSAFE_style={{ width: '100%' }}
            >
                <Flex direction="column" gap="size-50" width="100%">
                    <Flex alignItems="center" gap="size-100">
                        <Text UNSAFE_style={{ 
                            fontSize: '13px',
                            fontWeight: 500
                        }}>
                            {name}
                        </Text>
                        <Flex gap="size-75">
                            {required && (
                                <Badge variant="neutral" UNSAFE_style={{ fontSize: '10px' }}>
                                    Required
                                </Badge>
                            )}
                            {impact && (
                                <Badge 
                                    variant={impactColors[impact] as any}
                                    UNSAFE_style={{ fontSize: '10px' }}
                                >
                                    {impact} impact
                                </Badge>
                            )}
                        </Flex>
                    </Flex>
                    <Text UNSAFE_style={{ 
                        fontSize: '11px',
                        color: 'var(--spectrum-global-color-gray-600)',
                        marginLeft: '28px'
                    }}>
                        {description}
                    </Text>
                </Flex>
            </Checkbox>
        </View>
    );
};