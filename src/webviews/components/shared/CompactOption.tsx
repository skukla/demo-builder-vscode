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
                    UNSAFE_className="compact-option-icon"
                >
                    {icon}
                </View>
            )}
            <View flex>
                <Flex alignItems="center" gap="size-100" marginBottom="size-50">
                    <Text UNSAFE_className="compact-option-title">
                        {name}
                    </Text>
                    {recommended && (
                        <Badge variant="positive">
                            Recommended
                        </Badge>
                    )}
                </Flex>
                <Text UNSAFE_className="compact-option-description">
                    {description}
                </Text>
                {tags && tags.length > 0 && (
                    <Flex gap="size-75" marginTop="size-75" wrap>
                        {tags.map(tag => (
                            <Text
                                key={tag}
                                UNSAFE_className="compact-option-tag"
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