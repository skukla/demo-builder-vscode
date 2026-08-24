/**
 * AiZone Component
 *
 * A labeled "AI" zone — small-caps zone label above single-purpose tiles,
 * stacked vertically. Visual language mirrors the project dashboard's labeled
 * zones (PRIMARY / STOREFRONT / BUILD).
 *
 * Order is Chat, New Chat, Prompts: the two chat actions sit adjacent because
 * New Chat is a VARIANT of Chat (same destination, fresh conversation) rather
 * than a peer of Prompts.
 *
 * All three are flat tiles rather than Chat carrying a menu. This sidebar has no
 * menu anywhere — it is a flat launcher of 64x64 tiles, and the UtilityBar
 * already gives rarely-used actions (Logs, Settings) the same weight as common
 * ones. A kebab would be the only hidden affordance here, and there is nowhere
 * to put the glyph in a 64px box that already holds an icon and a wrapped label.
 */

import { ActionButton, Flex, Text } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Chat from '@spectrum-icons/workflow/Chat';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import React from 'react';

export interface AiZoneProps {
    /** Called when the Chat tile is pressed — opens/focuses the Claude terminal. */
    onOpenAiChat: () => void;
    /** Called when the Prompts tile is pressed — shows the prompt picker. */
    onShowPrompts: () => void;
    /**
     * Called when the New tile is pressed — starts a FRESH conversation.
     *
     * OPTIONAL, and the tile renders only when it is supplied. Making it
     * required would have gated the whole zone on it: every existing caller
     * passes two callbacks, so the AI zone silently disappeared for all of them.
     *
     * Every other entry point resumes via `claude --continue`, and a resumed
     * conversation never re-reads `AGENTS.md`, so it keeps whatever guidance it
     * was born with however many bundle versions ago. This is the only way to
     * get a conversation onto the current bundle.
     */
    onNewAiChat?: () => void;
}

/**
 * AiZone — labeled zone with Chat and Prompts tiles stacked vertically.
 */
export const AiZone: React.FC<AiZoneProps> = ({ onOpenAiChat, onShowPrompts, onNewAiChat }) => {
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

            {onNewAiChat && (
                <ActionButton
                    isQuiet
                    onPress={onNewAiChat}
                    aria-label="New Chat"
                    UNSAFE_className="sidebar-action-tile"
                >
                    <Add />
                    <Text UNSAFE_className="icon-label">New Chat</Text>
                </ActionButton>
            )}

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
