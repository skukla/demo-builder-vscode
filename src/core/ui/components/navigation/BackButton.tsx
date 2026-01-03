/**
 * BackButton Component
 *
 * A reusable navigation button with chevron-left icon.
 * Uses ActionButton (always quiet) for consistent styling.
 *
 * @example
 * ```tsx
 * <BackButton onPress={() => navigate('back')} />
 * <BackButton label="All Projects" onPress={() => goToProjects()} />
 * ```
 */

import React from 'react';
import { ActionButton, Text } from '@/core/ui/components/aria';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';

export interface BackButtonProps {
    /** Button label text. Defaults to "Back" */
    label?: string;
    /** Callback when button is pressed */
    onPress: () => void;
}

export function BackButton({ label = 'Back', onPress }: BackButtonProps): React.ReactElement {
    return (
        <ActionButton onPress={onPress}>
            <ChevronLeft size="S" />
            <Text>{label}</Text>
        </ActionButton>
    );
}
