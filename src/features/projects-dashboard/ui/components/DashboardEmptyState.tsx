/**
 * DashboardEmptyState Component
 *
 * Displays an empty state for the Projects Dashboard with a CTA to create a demo.
 */

import React, { useEffect, useRef } from 'react';
import { Flex, Text, Button, Well } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';

export interface DashboardEmptyStateProps {
    /** Callback when the create button is clicked */
    onCreate: () => void;
    /** Custom title (defaults to "No projects yet") */
    title?: string;
    /** Custom button text (defaults to "Create Demo") */
    buttonText?: string;
    /** Whether to auto-focus the button */
    autoFocus?: boolean;
}

/**
 * DashboardEmptyState - Shows empty state with CTA for first-time users
 */
export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({
    onCreate,
    title = 'No projects yet',
    buttonText = 'Create Demo',
    autoFocus = false,
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (autoFocus && buttonRef.current) {
            buttonRef.current.focus();
        }
    }, [autoFocus]);

    return (
        <Flex
            justifyContent="center"
            alignItems="center"
            height="100%"
            minHeight="350px"
        >
            <Well UNSAFE_style={{ maxWidth: '400px', textAlign: 'center' }}>
                <Flex
                    direction="column"
                    alignItems="center"
                    gap="size-300"
                >
                    <Text UNSAFE_className="text-lg">
                        <strong>{title}</strong>
                    </Text>
                    <Text UNSAFE_className="text-sm text-gray-600">
                        Get started by creating your first demo project.
                    </Text>
                    <Button
                        ref={buttonRef as any}
                        variant="cta"
                        onPress={onCreate}
                    >
                        <Add />
                        <Text>{buttonText}</Text>
                    </Button>
                </Flex>
            </Well>
        </Flex>
    );
};
