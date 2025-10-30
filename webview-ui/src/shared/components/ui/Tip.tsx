import React from 'react';
import { View, Text, Flex } from '@adobe/react-spectrum';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';

export interface TipProps {
    /** The tip content - can be a string or React node */
    children: React.ReactNode;
    /** Optional icon to show (defaults to 💡) */
    icon?: React.ReactNode;
    /** Visual variant */
    variant?: 'default' | 'info' | 'success';
}

/**
 * Tip component for displaying helpful hints and information to users.
 * Consistent styling across all wizard steps.
 */
export function Tip({ children, icon = '💡', variant = 'default' }: TipProps) {
    const getBackgroundColor = () => {
        switch (variant) {
            case 'info':
                return 'rgba(20, 115, 230, 0.08)'; // Blue tint
            case 'success':
                return 'rgba(75, 175, 79, 0.08)'; // Green tint
            default:
                return 'var(--spectrum-global-color-gray-75)'; // Neutral
        }
    };

    const getBorderColor = () => {
        switch (variant) {
            case 'info':
                return 'rgba(20, 115, 230, 0.2)';
            case 'success':
                return 'rgba(75, 175, 79, 0.2)';
            default:
                return 'var(--spectrum-global-color-gray-200)';
        }
    };

    return (
        <View
            padding="size-200"
            UNSAFE_style={{
                backgroundColor: getBackgroundColor(),
                borderRadius: '6px',
                border: `1px solid ${getBorderColor()}`
            }}
        >
            <Flex gap="size-100" alignItems="start">
                {typeof icon === 'string' ? (
                    <Text UNSAFE_style={{ fontSize: '16px', lineHeight: '20px', flexShrink: 0 }}>
                        {icon}
                    </Text>
                ) : (
                    <div style={{ flexShrink: 0, paddingTop: '2px' }}>
                        {icon}
                    </div>
                )}
                <Text UNSAFE_style={{ 
                    fontSize: '14px', 
                    color: 'var(--spectrum-global-color-gray-700)',
                    lineHeight: '20px'
                }}>
                    {children}
                </Text>
            </Flex>
        </View>
    );
}

