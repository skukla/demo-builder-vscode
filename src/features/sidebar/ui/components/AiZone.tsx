/**
 * AiZone Component
 *
 * A labeled "AI" zone — small-caps zone label above single-purpose tiles,
 * stacked vertically. Visual language mirrors the project dashboard's labeled
 * zones (PRIMARY / STOREFRONT / BUILD).
 *
 * TWO tiles: Chat (a menu) and Prompts. Only Chat is a menu — continuing and
 * starting fresh are two ways to do one thing, which is what earns one
 * affordance. It shows no chevron ICON; see `tileFor` for why the caret is a
 * character.
 *
 * A third Workbench tile lived here until 2026-08-26, when the prompt-evaluation
 * surface moved to `feature/evaluation-mode-dry-run` (AI-3b). The wrap breakpoint it
 * argued for stays at 640px in `.sidebar-view` — it was raised for real slack,
 * not for that tile specifically.
 *
 * When `onNewAiChat` is absent the Chat tile stays a plain button, so callers
 * that predate it are unaffected.
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
 * One tile face, with a caret when it opens a menu.
 *
 * The caret is a CHARACTER in the label's text run, not a `<ChevronDown>`.
 * Spectrum slots any icon inside a button into the button's icon slot, so five
 * attempts to place an icon here were all overruled by Spectrum's own layout —
 * see `.sidebar-tile-caret`. A glyph inside the text cannot be slotted or
 * reflowed away from the word it follows.
 *
 * @param label - the tile's word, also its accessible name
 * @param icon - the tile's glyph
 * @param hasMenu - whether to show the caret
 * @param onPress - supplied only for a plain-button tile; a `MenuTrigger` owns
 *   the press itself, and giving it one too would fire both
 */
function tileFor(
    label: string,
    icon: React.ReactElement,
    hasMenu: boolean,
    onPress?: () => void,
): React.ReactElement {
    return (
        <ActionButton
            isQuiet
            aria-label={label}
            UNSAFE_className="sidebar-action-tile"
            {...(onPress ? { onPress } : {})}
        >
            {icon}
            <Text UNSAFE_className="icon-label">
                {label}
                {hasMenu ? <span className="sidebar-tile-caret">&#9662;</span> : null}
            </Text>
        </ActionButton>
    );
}

/**
 * AiZone — labeled zone with Chat and Prompts tiles stacked vertically.
 */
export function AiZone({ onOpenAiChat, onShowPrompts, onNewAiChat }: AiZoneProps) {
    return (
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="dashboard-zone-label">AI</Text>

            <div className="sidebar-tile-grid">
                {onNewAiChat ? (
                    <MenuTrigger>
                        {tileFor('Chat', <MagicWand />, true)}
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
                    tileFor('Chat', <MagicWand />, false, onOpenAiChat)
                )}

                {tileFor('Prompts', <Chat />, false, onShowPrompts)}
            </div>
        </Flex>
    );
}
