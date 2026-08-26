/**
 * AiZone Component
 *
 * A labeled "AI" zone — small-caps zone label above single-purpose tiles,
 * stacked vertically. Visual language mirrors the project dashboard's labeled
 * zones (PRIMARY / STOREFRONT / BUILD).
 *
 * THREE tiles: Chat (a menu), Prompts, and Workbench. Only Chat is a menu —
 * continuing and starting fresh are two ways to do one thing, which is what
 * earns one affordance. It shows no chevron ICON; see `tileFor` for why the
 * caret is a character.
 *
 * **The third tile was withdrawn once, proposed as a menu, and then built.**
 * Worth recording, because the reasoning moved twice:
 *
 * 1. An early attempt made it a flat tile and it was withdrawn — it "pushed the
 *    stack past the viewport at zoom".
 * 2. Step 10 fell back to folding the workbench into a `Prompts ⌄` menu, on an
 *    arithmetic reading that a seventh tile needs 596px against a 600px wrap
 *    breakpoint. Technically it fit, by four pixels, and that was called too
 *    thin.
 * 3. **The owner corrected the framing (2026-08-25): the stack is CENTRED, so
 *    the slack sits idle above and below it.** Top-aligning moves all of it to
 *    the bottom, where another tile simply extends into it — and the wrap
 *    breakpoint was raised to 640px so the roomy layout has 45px of real slack
 *    rather than four. See `.sidebar-view` in `custom-spectrum.css`.
 *
 * So the workbench is a tile, and it reads as what it is: a third thing you do
 * with an agent, beside chatting and picking a prompt.
 *
 * When `onNewAiChat` is absent the Chat tile stays a plain button, and when
 * `onShowWorkbench` is absent the Workbench tile is not rendered — so callers
 * that predate either are unaffected.
 */

import { ActionButton, Flex, Item, Menu, MenuTrigger, Text } from '@adobe/react-spectrum';
import Beaker from '@spectrum-icons/workflow/Beaker';
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
    /**
     * Called to open the Prompt Workbench.
     *
     * OPTIONAL, and it is what renders the third tile. Without it the workbench
     * has no door in the UI at all: the extension contributes no menus for
     * `demoBuilder.showEvaluationWorkbench`, so it is reachable only by typing
     * the command's name.
     */
    onShowWorkbench?: () => void;
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
export const AiZone: React.FC<AiZoneProps> = ({
    onOpenAiChat,
    onShowPrompts,
    onNewAiChat,
    onShowWorkbench,
}) => {
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

                {/* The beaker is the same glyph the simulate vocabulary uses
                    everywhere else — the prompt card's kebab and the status bar
                    indicator — so one concept keeps one symbol. */}
                {onShowWorkbench
                    ? tileFor('Workbench', <Beaker />, false, onShowWorkbench)
                    : null}
            </div>
        </Flex>
    );
};
