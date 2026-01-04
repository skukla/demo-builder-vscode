/**
 * DashboardEmptyState Component
 *
 * Displays an empty state for the Projects Dashboard with CTAs to create or import a project.
 */

import Add from '@spectrum-icons/workflow/Add';
import Import from '@spectrum-icons/workflow/Import';
import React, { useEffect, useRef } from 'react';
import { Flex, Text, Heading, Button } from '@/core/ui/components/aria';

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
            style={{ height: '100%', minHeight: '350px' }}
        >
            <Flex
                direction="column"
                alignItems="center"
                gap="size-300"
                className="centered-content-narrow"
            >
                <Heading level={3} marginBottom="size-100">
                    {title}
                </Heading>
                <Text className="text-gray-600">
                    Get started by creating your first demo project.
                </Text>
                <Flex gap="size-200" alignItems="center">
                    <Button
                        ref={buttonRef}
                        variant="cta"
                        onPress={onCreate}
                    >
                        <Add size="S" />
                        <Text>{buttonText}</Text>
                    </Button>

                    {/* Import option for users with exported settings */}
                    {onImportFromFile && (
                        <Button
                            variant="secondary"
                            onPress={onImportFromFile}
                        >
                            <Import size="S" />
                            <Text>Import</Text>
                        </Button>
                    )}
                </Flex>
            </Flex>
        </Flex>
    );
};
