/**
 * AiZone Component
 *
 * A labeled "AI" zone — small-caps zone label above two single-purpose tiles
 * (Chat + Prompts), stacked vertically. Visual language mirrors the project
 * dashboard's labeled zones (PRIMARY / STOREFRONT / BUILD).
 */

import { ActionButton, Flex, Text } from '@adobe/react-spectrum';
import Chat from '@spectrum-icons/workflow/Chat';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import React from 'react';

export interface AiZoneProps {
    /** Called when the Chat tile is pressed — opens/focuses the Claude terminal. */
    onOpenAiChat: () => void;
    /** Called when the Prompts tile is pressed — shows the prompt picker. */
    onShowPrompts: () => void;
}

/**
 * AiZone — labeled zone with Chat and Prompts tiles stacked vertically.
 */
export const AiZone: React.FC<AiZoneProps> = ({ onOpenAiChat, onShowPrompts }) => {
    return (
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="dashboard-zone-label">AI</Text>

            <ActionButton
                isQuiet
                onPress={onOpenAiChat}
                aria-label="Chat"
                UNSAFE_className="sidebar-action-tile"
            >
                <MagicWand />
                <Text UNSAFE_className="icon-label">Chat</Text>
            </ActionButton>

            <ActionButton
                isQuiet
                onPress={onShowPrompts}
                aria-label="Prompts"
                UNSAFE_className="sidebar-action-tile"
            >
                <Chat />
                <Text UNSAFE_className="icon-label">Prompts</Text>
            </ActionButton>
        </Flex>
    );
};
