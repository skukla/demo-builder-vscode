/**
 * AiZone Component
 *
 * Labeled sidebar zone exposing two single-purpose AI actions: Chat (opens or
 * focuses the Claude terminal) and Prompts (shows the prompt picker). Replaces
 * the state-aware wand icon that previously lived in the UtilityBar.
 *
 * Visual language matches the dashboard's zone pattern — a small-caps muted
 * label above quiet labeled action buttons.
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
 * AiZone — labeled sidebar zone with Chat and Prompts actions.
 *
 * Each button is single-purpose: Chat always opens or focuses the terminal,
 * Prompts always shows the picker. No state-aware branching.
 */
export const AiZone: React.FC<AiZoneProps> = ({ onOpenAiChat, onShowPrompts }) => {
    return (
        <Flex
            direction="column"
            gap="size-100"
            UNSAFE_className="sidebar-zone sidebar-ai-zone"
        >
            <Text UNSAFE_className="sidebar-zone-label">AI</Text>

            <ActionButton
                isQuiet
                onPress={onOpenAiChat}
                UNSAFE_className="sidebar-zone-button"
            >
                <MagicWand />
                <Text>Chat</Text>
            </ActionButton>

            <ActionButton
                isQuiet
                onPress={onShowPrompts}
                UNSAFE_className="sidebar-zone-button"
            >
                <Chat />
                <Text>Prompts</Text>
            </ActionButton>
        </Flex>
    );
};
