/**
 * ConfigTile Component (R1b — group-paced steps)
 *
 * A config tile for the group-paced wizard steps. Renders in the `selector-card`
 * aesthetic with a label, a one-line summary, and a status badge (⚠ Needs setup →
 * ✓ Configured). Clicking or keyboard-activating it opens the concern's focused
 * modal — the parent step supplies `onPress` and derives `status` from the pure
 * predicates in {@link tileStatus}.
 *
 * Presentational only: no wizard state, no modal — the parent owns both. Shared by
 * the Commerce and Storefront steps now, and the R2 Integrations tile collection.
 *
 * @module features/project-creation/ui/components/ConfigTile
 */

import { Flex, Text, View } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useCallback } from 'react';

/** Whether the tile's concern is fully configured or still needs setup. */
export type ConfigTileStatus = 'configured' | 'needs-setup';

export interface ConfigTileProps {
    /** Tile title (the concern name, e.g. "Backend"). */
    label: string;
    /** One-line summary of the current selection (e.g. "EDS + PaaS · connected"). */
    summary?: string;
    /** Configured (✓) or needs-setup (⚠). Drives the badge and styling. */
    status: ConfigTileStatus;
    /** Optional leading icon. */
    icon?: React.ReactNode;
    /** Opens the concern's focused modal. */
    onPress: () => void;
    /** Optional `data-testid`. */
    testId?: string;
}

/** Badge label + icon per status. */
const STATUS_TEXT: Record<ConfigTileStatus, string> = {
    'configured': 'Configured',
    'needs-setup': 'Needs setup',
};

/**
 * A clickable config tile with a status badge.
 *
 * @param props - {@link ConfigTileProps}
 * @returns The tile element
 */
export function ConfigTile({ label, summary, status, icon, onPress, testId }: ConfigTileProps) {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPress();
            }
        },
        [onPress],
    );

    const statusText = STATUS_TEXT[status];
    const badgeIcon =
        status === 'configured' ? (
            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
        ) : (
            <AlertCircle size="S" UNSAFE_className="text-orange-600" />
        );

    return (
        <div
            role="button"
            tabIndex={0}
            data-testid={testId}
            data-status={status}
            data-requires-setup={status === 'needs-setup' ? 'true' : 'false'}
            onClick={onPress}
            onKeyDown={handleKeyDown}
            className="selector-card"
            aria-label={`${label} — ${statusText}`}
        >
            <Flex alignItems="center" justifyContent="space-between" gap="size-200">
                <Flex alignItems="center" gap="size-150">
                    {icon}
                    <View>
                        <Text UNSAFE_className="selector-card-name">{label}</Text>
                        {summary && (
                            <Text UNSAFE_className="selector-card-description">{summary}</Text>
                        )}
                    </View>
                </Flex>
                <Flex alignItems="center" gap="size-100">
                    {badgeIcon}
                    <Text UNSAFE_className="text-sm text-gray-700">{statusText}</Text>
                </Flex>
            </Flex>
        </div>
    );
}
