/**
 * AiZone Component
 *
 * A labeled "AI" zone — small-caps zone label above single-purpose tiles,
 * stacked vertically. Visual language mirrors the project dashboard's labeled
 * zones (PRIMARY / STOREFRONT / BUILD).
 *
 * TWO tiles: Chat (a menu) and Prompts. Only Chat is a menu — continuing,
 * starting fresh and picking an earlier chat are three ways to do one thing,
 * which is what earns one affordance. It shows no chevron ICON; see `tileFor` for why the caret is a
 * character.
 *
 * A third Workbench tile lived here until 2026-08-26, when the prompt-evaluation
 * surface moved to `feature/evaluation-mode-dry-run` (AI-3b). The wrap breakpoint it
 * argued for stays at 640px in `.sidebar-view` — it was raised for real slack,
 * not for that tile specifically.
 *
 * When `onNewAiChat` is absent the Chat tile stays a plain button — the entry
 * omits it for Copilot in VS Code, whose chat panel has its own New and history.
 */

import { ActionButton, Flex, Item, Menu, MenuTrigger, Text } from '@adobe/react-spectrum';
import Chat from '@spectrum-icons/workflow/Chat';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import React, { useCallback, useEffect, useRef } from 'react';

export interface AiZoneProps {
    /** Called when the Chat tile is pressed — opens the SC's agent (panel or terminal). */
    onOpenAiChat: () => void;
    /** Called when the Prompts tile is pressed — shows the prompt picker. */
    onShowPrompts: () => void;
    /**
     * Called to start a FRESH conversation.
     *
     * OPTIONAL, and it is what turns the Chat tile into a menu. Every launch
     * otherwise resumes Claude Code's last session, and a resumed conversation
     * never re-reads `AGENTS.md` — so it keeps whatever guidance it was born
     * with, however many bundle versions ago. This is the only way onto the
     * current bundle.
     */
    onNewAiChat?: () => void;
    /**
     * Called to pick an EARLIER conversation in Claude Code's own picker
     * (`claude --resume`). Optional; adds a third Chat menu item when given.
     */
    onPickAiChat?: () => void;
}

/** Menu keys for the Chat tile. */
const CONTINUE = 'continue';
const NEW = 'new';
const PICK = 'pick';

/** How long a Chat menu action waits for the menu to return focus before running anyway. */
const CHAT_ACTION_FALLBACK_MS = 400;

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
    onFocus?: () => void,
): React.ReactElement {
    return (
        <ActionButton
            isQuiet
            aria-label={label}
            UNSAFE_className="sidebar-action-tile"
            {...(onPress ? { onPress } : {})}
            {...(onFocus ? { onFocus } : {})}
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
export function AiZone({ onOpenAiChat, onShowPrompts, onNewAiChat, onPickAiChat }: AiZoneProps) {
    const pendingChatAction = useRef<(() => void) | null>(null);
    const fallbackTimer = useRef<number | undefined>(undefined);

    const runPendingChatAction = useCallback(() => {
        window.clearTimeout(fallbackTimer.current);
        const run = pendingChatAction.current;
        pendingChatAction.current = null;
        run?.();
    }, []);

    useEffect(() => () => window.clearTimeout(fallbackTimer.current), []);

    /**
     * Hold a Chat menu action until the menu has handed focus back to the tile.
     *
     * Each action opens the Claude terminal, which takes the keyboard. When the
     * menu closes, Spectrum returns focus to the Chat tile a frame or two later
     * — AFTER the terminal has taken it — so the sidebar won the keyboard back,
     * and the SC's first arrow key re-opened the menu instead of reaching Claude
     * (found in release testing, 2026-10-06). Running the action on that focus
     * return puts the terminal last. The timer covers a close that returns no
     * focus at all.
     */
    const deferChatAction = useCallback(
        (run: () => void) => {
            pendingChatAction.current = run;
            window.clearTimeout(fallbackTimer.current);
            fallbackTimer.current = window.setTimeout(runPendingChatAction, CHAT_ACTION_FALLBACK_MS);
        },
        [runPendingChatAction],
    );

    return (
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text>AI</Text>

            <div className="sidebar-tile-grid">
                {onNewAiChat ? (
                    <MenuTrigger>
                        {tileFor('Chat', <MagicWand />, true, undefined, runPendingChatAction)}
                        <Menu
                            onAction={(key) => {
                                if (key === CONTINUE) {
                                    deferChatAction(onOpenAiChat);
                                } else if (key === NEW) {
                                    deferChatAction(onNewAiChat);
                                } else if (key === PICK && onPickAiChat) {
                                    deferChatAction(onPickAiChat);
                                }
                            }}
                        >
                            <Item key={CONTINUE}>Continue chat</Item>
                            {onPickAiChat ? <Item key={PICK}>Pick an earlier chat</Item> : null}
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
