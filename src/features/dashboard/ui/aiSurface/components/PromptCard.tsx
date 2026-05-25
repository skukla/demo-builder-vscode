/**
 * PromptCard
 *
 * A single user-saved AI prompt rendered as a clickable card. Pin/Unpin,
 * Edit, Duplicate, Delete live in the kebab menu. Pinned prompts show a
 * small pin indicator inline with the title.
 *
 * Title clamps to 1 line and body clamps to 3 lines, so every card has the
 * same fixed height regardless of content length.
 *
 * Reordering is done via Pin + the parent's filter input — no drag-and-drop.
 */

import {
    ActionButton,
    Flex,
    Item,
    Menu,
    MenuTrigger,
    Text,
    View,
} from '@adobe/react-spectrum';
import Copy from '@spectrum-icons/workflow/Copy';
import Delete from '@spectrum-icons/workflow/Delete';
import Duplicate from '@spectrum-icons/workflow/Duplicate';
import Edit from '@spectrum-icons/workflow/Edit';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import PinOff from '@spectrum-icons/workflow/PinOff';
import PinOn from '@spectrum-icons/workflow/PinOn';
import React, { useCallback } from 'react';
import type { AiPrompt } from '@/types/base';

// Re-export for backward compatibility.
export type { AiPrompt };

export interface PromptCardProps {
    /** The prompt to render. */
    prompt: AiPrompt;
    /** Called when the card body is clicked. */
    onLaunch: () => void;
    /** When true, render the kebab menu and pin indicator. */
    isUserPrompt?: boolean;
    /** Kebab action: Edit. Required when isUserPrompt is true. */
    onEdit?: () => void;
    /** Kebab action: Duplicate. Required when isUserPrompt is true. */
    onDuplicate?: () => void;
    /** Kebab action: Delete. Required when isUserPrompt is true. */
    onDelete?: () => void;
    /** Kebab action: toggle pinned state. Called with the next pinned value. */
    onPinToggle?: (nextPinned: boolean) => void;
    /** Kebab action: copy prompt body to clipboard. Called with the prompt body. */
    onCopy?: (promptBody: string) => void;
}

/**
 * Fixed card height. Exported so sibling tiles in the same grid (e.g. the
 * "+ New prompt" tile in PromptGrid) can match it exactly, preventing
 * empty-state vs populated-state height drift.
 */
export const PROMPT_CARD_HEIGHT = '108px';

const STYLE_PROMPT_CARD = {
    // Flex column lets us anchor the title row at the top and the body
    // directly under it, giving every card the same content baseline even
    // when bodies vary in length.
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    // Fixed height (not minHeight) — every card is identical regardless of
    // prompt length. Title clamps to 1 line, body clamps to 3 lines, so all
    // content fits within this box.
    height: PROMPT_CARD_HEIGHT,
    overflow: 'hidden',
    textAlign: 'left' as const,
    // Right padding reserves room for the absolutely-positioned kebab so a
    // long title doesn't slide underneath the menu trigger before clamping.
    padding: '10px 40px 10px 12px',
    border: '1px solid var(--spectrum-global-color-gray-300)',
    borderRadius: '4px',
    background: 'var(--spectrum-global-color-gray-50)',
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
    boxSizing: 'border-box' as const,
} as const;

const STYLE_CARD_WRAPPER = {
    position: 'relative' as const,
} as const;

const STYLE_KEBAB_WRAPPER = {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
} as const;

const STYLE_PIN_INLINE = {
    display: 'inline-flex',
    alignItems: 'center',
    flex: '0 0 auto',
    color: 'var(--spectrum-global-color-gray-700)',
} as const;

const STYLE_TITLE_CLAMP = {
    display: '-webkit-box',
    WebkitLineClamp: 1,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    overflowWrap: 'break-word' as const,
    flex: '1 1 auto',
    minWidth: 0,
} as const;

const STYLE_BODY_CLAMP = {
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    overflowWrap: 'break-word' as const,
} as const;

interface PromptKebabProps {
    isPinned: boolean;
    promptBody: string;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onPinToggle: (nextPinned: boolean) => void;
    onCopy?: (promptBody: string) => void;
}

function PromptKebab({
    isPinned,
    promptBody,
    onEdit,
    onDuplicate,
    onDelete,
    onPinToggle,
    onCopy,
}: PromptKebabProps): React.ReactElement {
    const handleAction = useCallback(
        (key: React.Key) => {
            switch (String(key)) {
                case 'pin-toggle':
                    onPinToggle(!isPinned);
                    break;
                case 'edit':
                    onEdit();
                    break;
                case 'duplicate':
                    onDuplicate();
                    break;
                case 'copy':
                    if (onCopy) onCopy(promptBody);
                    break;
                case 'delete':
                    onDelete();
                    break;
            }
        },
        [isPinned, promptBody, onPinToggle, onEdit, onDuplicate, onDelete, onCopy],
    );

    // Stop click propagation so opening the kebab doesn't trigger card launch.
    const stopPropagation = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- click handled by child MenuTrigger/ActionButton which provides keyboard support
        <div onClick={stopPropagation} style={STYLE_KEBAB_WRAPPER}>
            <MenuTrigger>
                <ActionButton isQuiet aria-label="More actions">
                    <MoreSmallListVert size="S" />
                </ActionButton>
                <Menu onAction={handleAction}>
                    <Item key="pin-toggle" textValue={isPinned ? 'Unpin' : 'Pin'}>
                        {isPinned ? <PinOff size="S" /> : <PinOn size="S" />}
                        <Text>{isPinned ? 'Unpin' : 'Pin'}</Text>
                    </Item>
                    <Item key="edit" textValue="Edit">
                        <Edit size="S" />
                        <Text>Edit</Text>
                    </Item>
                    <Item key="duplicate" textValue="Duplicate">
                        <Duplicate size="S" />
                        <Text>Duplicate</Text>
                    </Item>
                    {onCopy ? (
                        <Item key="copy" textValue="Copy prompt">
                            <Copy size="S" />
                            <Text>Copy prompt</Text>
                        </Item>
                    ) : null}
                    <Item key="delete" textValue="Delete">
                        <Delete size="S" />
                        <Text>Delete</Text>
                    </Item>
                </Menu>
            </MenuTrigger>
        </div>
    );
}

export function PromptCard({
    prompt,
    onLaunch,
    isUserPrompt = false,
    onEdit,
    onDuplicate,
    onDelete,
    onPinToggle,
    onCopy,
}: PromptCardProps): React.ReactElement {
    const handleClick = useCallback(() => onLaunch(), [onLaunch]);
    const isPinned = Boolean(prompt.pinned);

    const cardButton = (
        <button
            type="button"
            data-testid="ai-prompt-card"
            className="ai-prompt-card"
            onClick={handleClick}
            style={STYLE_PROMPT_CARD}
        >
            <Flex direction="row" alignItems="center" gap="size-75">
                {isPinned && (
                    <span
                        data-testid="ai-prompt-pin-indicator"
                        aria-label="Pinned"
                        style={STYLE_PIN_INLINE}
                    >
                        <PinOn size="XS" />
                    </span>
                )}
                <div style={STYLE_TITLE_CLAMP}>
                    <Text UNSAFE_className="text-sm font-semibold">{prompt.title}</Text>
                </div>
            </Flex>
            <View marginTop="size-50">
                <div style={STYLE_BODY_CLAMP}>
                    <Text UNSAFE_className="text-xs text-gray-700">{prompt.prompt}</Text>
                </div>
            </View>
        </button>
    );

    if (!isUserPrompt) {
        return cardButton;
    }

    // Defensive: if any required kebab handler is missing, render the bare
    // card without the kebab.
    if (!onEdit || !onDuplicate || !onDelete) {
        return cardButton;
    }

    const handlePinToggle = onPinToggle ?? (() => undefined);

    return (
        <div style={STYLE_CARD_WRAPPER} data-testid="ai-prompt-card-wrapper">
            {cardButton}
            <PromptKebab
                isPinned={isPinned}
                promptBody={prompt.prompt}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onPinToggle={handlePinToggle}
                onCopy={onCopy}
            />
        </div>
    );
}
