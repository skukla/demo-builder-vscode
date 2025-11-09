import React from 'react';
import {
    View,
    Flex,
    Text,
    Checkbox,
    Badge
} from '@adobe/react-spectrum';
import Info from '@spectrum-icons/workflow/Info';
import { cn } from '../../utils/classNames';

export interface DependencyItemProps {
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
            UNSAFE_className="dependency-item-container"
        >
            <Checkbox
                isSelected={selected}
                isDisabled={required}
                onChange={(isSelected) => onToggle?.(id, isSelected)}
                UNSAFE_className="w-full"
            >
                <Flex direction="column" gap="size-50" width="100%">
                    <Flex alignItems="center" gap="size-100">
                        <Text UNSAFE_className="dependency-item-title">
                            {name}
                        </Text>
                        <Flex gap="size-75">
                            {required && (
                                <Badge variant="neutral" UNSAFE_className="text-xs">
                                    Required
                                </Badge>
                            )}
                            {impact && (
                                <Badge 
                                    variant={impactColors[impact] as any}
                                    UNSAFE_className="text-xs"
                                >
                                    {impact} impact
                                </Badge>
                            )}
                        </Flex>
                    </Flex>
                    <Text UNSAFE_className={cn('dependency-item-description', 'ml-5')}>
                        {description}
                    </Text>
                </Flex>
            </Checkbox>
        </View>
    );
};