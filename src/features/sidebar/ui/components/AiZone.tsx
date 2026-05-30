/**
 * AiZone Component
 *
 * Two single-purpose AI icons (Chat + Prompts) matching the existing
 * `UtilityBar` aesthetic — icon-on-top, tiny label below, horizontal row.
 * The visual grouping (two icons sitting together, separated from the
 * utility footer) communicates "AI" without needing a text label.
 */

import { ActionButton, Flex, Text } from '@adobe/react-spectrum';
import Chat from '@spectrum-icons/workflow/Chat';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import React from 'react';

export interface AiZoneProps {
    /** Called when the Chat button is pressed — opens/focuses the Claude terminal. */
    onOpenAiChat: () => void;
    /** Called when the Prompts button is pressed — shows the prompt picker. */
    onShowPrompts: () => void;
}

/**
 * AiZone — Chat and Prompts as a paired-icon row, styled like the UtilityBar.
 *
 * Each button is single-purpose: Chat always opens or focuses the terminal,
 * Prompts always shows the picker. No state-aware branching.
 */
export const AiZone: React.FC<AiZoneProps> = ({ onOpenAiChat, onShowPrompts }) => {
    return (
        <Flex
            direction="row"
            gap="size-300"
            alignItems="center"
            justifyContent="center"
            UNSAFE_className="sidebar-utility-bar"
        >
            <Flex direction="column" alignItems="center" gap="size-75">
                <ActionButton isQuiet onPress={onOpenAiChat} aria-label="Chat">
                    <MagicWand size="L" />
                </ActionButton>
                <Text UNSAFE_className="text-sm opacity-70">Chat</Text>
            </Flex>

            <Flex direction="column" alignItems="center" gap="size-75">
                <ActionButton isQuiet onPress={onShowPrompts} aria-label="Prompts">
                    <Chat size="L" />
                </ActionButton>
                <Text UNSAFE_className="text-sm opacity-70">Prompts</Text>
            </Flex>
        </Flex>
    );
};
