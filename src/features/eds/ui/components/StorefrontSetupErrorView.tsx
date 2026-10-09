/**
 * The screen a storefront setup run ends on when it failed: what went wrong,
 * with Cancel and Retry.
 *
 * `StatusDisplay` does this job for most surfaces. This keeps its own markup
 * because moving it onto that component adds its fade and its fixed 350px box,
 * and the step's states centre in the whole pane (2026-10-07); that is a visual
 * change, not part of the split that created this file. Recorded on EDS-8 for a
 * decision.
 *
 * @module features/eds/ui/components/StorefrontSetupErrorView
 */

import { Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React from 'react';

interface StorefrontSetupErrorViewProps {
    error?: string;
    message: string;
    onCancel: () => void;
    onRetry: () => void;
}

/** Error state - show error message with recovery options */
export function StorefrontSetupErrorView({
    error,
    message,
    onCancel,
    onRetry,
}: StorefrontSetupErrorViewProps): React.ReactElement {
    return (
        <Flex direction="column" gap="size-200" alignItems="center" maxWidth="520px">
            <AlertCircle size="L" UNSAFE_className="text-red-600" />
            <Flex direction="column" gap="size-100" alignItems="center">
                <Text UNSAFE_className="text-xl font-medium">Storefront Setup Failed</Text>
                <Text UNSAFE_className="text-sm text-gray-600 text-center">
                    {error || message || 'An error occurred during setup.'}
                </Text>
            </Flex>
            <Flex gap="size-150" marginTop="size-300">
                <Button variant="secondary" onPress={onCancel}>
                    Cancel
                </Button>
                <Button variant="accent" onPress={onRetry}>
                    Retry
                </Button>
            </Flex>
        </Flex>
    );
}
