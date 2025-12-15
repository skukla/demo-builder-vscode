/**
 * DashboardEmptyState Component
 *
 * Displays an empty state for the Projects Dashboard with CTAs to create or import a project.
 */

import { Flex, Text, Button } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Import from '@spectrum-icons/workflow/Import';
import React, { useEffect, useRef } from 'react';

export interface DashboardEmptyStateProps {
    /** Callback when the create button is clicked */
    onCreate: () => void;
    /** Callback when import from file is clicked */
    onImportFromFile?: () => void;
    /** Custom title (defaults to "No projects yet") */
    title?: string;
    /** Custom button text (defaults to "New") */
    buttonText?: string;
    /** Whether to auto-focus the button */
    autoFocus?: boolean;
}

/**
 * DashboardEmptyState - Shows empty state with CTA for first-time users
 */
export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({
    onCreate,
    onImportFromFile,
    title = 'No projects yet',
    buttonText = 'New',
    autoFocus = false,
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Note: Focus trap is handled by parent ProjectsDashboard component

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
            <Flex
                direction="column"
                alignItems="center"
                gap="size-300"
                UNSAFE_className="max-w-400 text-center"
            >
                <Text UNSAFE_className="text-lg">
                    <strong>{title}</strong>
                </Text>
                <Text UNSAFE_className="text-sm text-gray-600">
                    Get started by creating your first demo project.
                </Text>
                <Flex gap="size-200" alignItems="center">
                    <Button
                        ref={buttonRef as any}
                        variant="cta"
                        onPress={onCreate}
                    >
                        <Add />
                        <Text>{buttonText}</Text>
                    </Button>

                    {/* Import option for users with exported settings */}
                    {onImportFromFile && (
                        <Button
                            variant="secondary"
                            onPress={onImportFromFile}
                        >
                            <Import />
                            <Text>Import</Text>
                        </Button>
                    )}
                </Flex>
            </Flex>
        </Flex>
    );
};
