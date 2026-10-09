/**
 * The screen a storefront setup run ends on when it published, with or without
 * warnings about product pages.
 *
 * Kept off `StatusDisplay` for the same reason as `StorefrontSetupErrorView`:
 * its fade and fixed 350px box would change how the step centres in the pane.
 * Recorded on EDS-8 for a decision.
 *
 * @module features/eds/ui/components/StorefrontSetupCompletedView
 */

import { Text, Flex } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';

interface StorefrontSetupCompletedViewProps {
    /** Non-fatal reasons product detail pages will not work. */
    warnings?: string[];
}

/** Success state - show completion message */
export function StorefrontSetupCompletedView({
    warnings,
}: StorefrontSetupCompletedViewProps): React.ReactElement {
    return (
        <Flex direction="column" gap="size-200" alignItems="center" maxWidth="520px">
            {/* A storefront that cannot serve product pages is
                not the same outcome as one that can, and must
                not wear the same green checkmark. */}
            {warnings?.length ? (
                <AlertCircle size="L" UNSAFE_className="text-orange-600" />
            ) : (
                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
            )}
            <Flex direction="column" gap="size-100" alignItems="center">
                <Text UNSAFE_className="text-xl font-medium">
                    {warnings?.length ? 'Storefront Published, with warnings' : 'Storefront Published'}
                </Text>
                {warnings?.map((warning) => (
                    <Text key={warning} UNSAFE_className="text-sm text-orange-700 text-center">
                        {warning}
                    </Text>
                ))}
                <Text UNSAFE_className="text-sm text-gray-600">
                    Click Continue to proceed with project creation.
                </Text>
            </Flex>
        </Flex>
    );
}
