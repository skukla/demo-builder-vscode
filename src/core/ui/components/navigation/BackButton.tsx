/**
 * BackButton Component
 *
 * A reusable navigation button with chevron-left icon.
 * Uses ActionButton isQuiet variant for consistent styling.
 *
 * @example
 * ```tsx
 * <BackButton onPress={() => navigate('back')} />
 * <BackButton label="All Projects" onPress={() => goToProjects()} />
 * ```
 */

import { ActionButton, Text } from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';
import React from 'react';

export interface BackButtonProps {
    /** Button label text. Defaults to "Back" */
    label?: string;
    /** Callback when button is pressed */
    onPress: () => void;
}

export function BackButton({ label = 'Back', onPress }: BackButtonProps): React.ReactElement {
    return (
        <ActionButton isQuiet onPress={onPress}>
            <ChevronLeft size="S" />
            <Text>{label}</Text>
        </ActionButton>
    );
}
