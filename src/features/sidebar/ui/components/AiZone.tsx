/**
 * AiZone Component
 *
 * A labeled "AI" zone — small-caps zone label above single-purpose tiles,
 * stacked vertically. Visual language mirrors the project dashboard's labeled
 * zones (PRIMARY / STOREFRONT / BUILD).
 *
 * The Chat tile is a MENU, not a plain button, following the projects toolbar's
 * `New ⌄` button (`ProjectsDashboard.tsx` — `MenuTrigger` + `Button`): one
 * affordance for a family of related actions rather than a tile per variant.
 * Unlike that button it shows no chevron — see `chatTile` below for why. Continuing and starting fresh are two ways to do the same
 * thing, so they belong behind one tile; a third flat tile made them read as
 * three separate features and pushed the stack past the viewport at zoom.
 *
 * When no `onNewAiChat` is supplied the tile stays a plain button, so callers
 * that predate the menu are unaffected.
 */

import { ActionButton, Flex, Item, Menu, MenuTrigger, Text } from '@adobe/react-spectrum';
import Chat from '@spectrum-icons/workflow/Chat';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import React from 'react';

export interface AiZoneProps {
    /** Called when the Chat tile is pressed — opens/focuses the Claude terminal. */
    onOpenAiChat: () => void;
    /** Called when the Prompts tile is pressed — shows the prompt picker. */
    onShowPrompts: () => void;
    /**
     * Called to start a FRESH conversation.
     *
     * OPTIONAL, and it is what turns the Chat tile into a menu. Every launch
     * otherwise resumes via `claude --continue`, and a resumed conversation
     * never re-reads `AGENTS.md` — so it keeps whatever guidance it was born
     * with, however many bundle versions ago. This is the only way onto the
     * current bundle.
     */
    onNewAiChat?: () => void;
}

/** Menu keys for the Chat tile. */
const CONTINUE = 'continue';
const NEW = 'new';

/**
 * AiZone — labeled zone with Chat and Prompts tiles stacked vertically.
 */
export const AiZone: React.FC<AiZoneProps> = ({ onOpenAiChat, onShowPrompts, onNewAiChat }) => {
    // The caret is a CHARACTER in the label's text run, not a `<ChevronDown>`.
    // Spectrum slots any icon inside a button into the button's icon slot, so
    // five attempts to place an icon here were all overruled by Spectrum's own
    // layout — see `.sidebar-tile-caret`. A glyph inside the text cannot be
    // slotted or reflowed away from the word it follows.
    const chatTile = (
        <ActionButton isQuiet aria-label="Chat" UNSAFE_className="sidebar-action-tile">
            <MagicWand />
            <Text UNSAFE_className="icon-label">
                Chat
                {onNewAiChat ? <span className="sidebar-tile-caret">&#9662;</span> : null}
            </Text>
        </ActionButton>
    );

    return (
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="dashboard-zone-label">AI</Text>

            <div className="sidebar-tile-grid">
                {onNewAiChat ? (
                    <MenuTrigger>
                        {chatTile}
                        <Menu
                            onAction={(key) => {
                                if (key === CONTINUE) {
                                    onOpenAiChat();
                                } else if (key === NEW) {
                                    onNewAiChat();
                                }
                            }}
                        >
                            <Item key={CONTINUE}>Continue chat</Item>
                            <Item key={NEW}>New chat</Item>
                        </Menu>
                    </MenuTrigger>
                ) : (
                    <ActionButton
                        isQuiet
                        onPress={onOpenAiChat}
                        aria-label="Chat"
                        UNSAFE_className="sidebar-action-tile"
                    >
                        <MagicWand />
                        <Text UNSAFE_className="icon-label">Chat</Text>
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
            </div>
        </Flex>
    );
};
