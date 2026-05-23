/**
 * PromptCard (Batch F2 + F3)
 *
 * A single AI prompt rendered as a clickable card. Used for both curated
 * and user-saved prompts. When `isUserPrompt` is true, a kebab menu is
 * rendered (Edit / Duplicate / Delete) mirroring `ProjectActionsMenu`.
 *
 * Composition: a plain `<button>` element with custom child content. Kebab
 * uses `MenuTrigger` + `Menu` + `Item` from Spectrum — no new primitives.
 */

import {
    ActionButton,
    Item,
    Menu,
    MenuTrigger,
    Text,
    View,
} from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import Duplicate from '@spectrum-icons/workflow/Copy';
import Edit from '@spectrum-icons/workflow/Edit';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import React, { useCallback } from 'react';
import type { AiPrompt } from '@/types/base';

// Re-export for backward compatibility (Batch F2 callers imported it from here).
export type { AiPrompt };

export interface PromptCardProps {
    /** The prompt to render. */
    prompt: AiPrompt;
    /** Called when the card body is clicked. */
    onLaunch: () => void;
    /** When true, render a kebab menu with Edit / Duplicate / Delete (Batch F3). */
    isUserPrompt?: boolean;
    /** Kebab action: Edit. Required when isUserPrompt is true. */
    onEdit?: () => void;
    /** Kebab action: Duplicate. Required when isUserPrompt is true. */
    onDuplicate?: () => void;
    /** Kebab action: Delete. Required when isUserPrompt is true. */
    onDelete?: () => void;
}

const STYLE_PROMPT_CARD = {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '10px 12px',
    border: '1px solid var(--spectrum-global-color-gray-300)',
    borderRadius: '4px',
    background: 'var(--spectrum-global-color-gray-50)',
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
} as const;

const STYLE_CARD_WRAPPER = {
    position: 'relative' as const,
} as const;

const STYLE_KEBAB_WRAPPER = {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
} as const;

function PromptKebab({
    onEdit,
    onDuplicate,
    onDelete,
}: {
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}): React.ReactElement {
    const handleAction = useCallback(
        (key: React.Key) => {
            switch (String(key)) {
                case 'edit':
                    onEdit();
                    break;
                case 'duplicate':
                    onDuplicate();
                    break;
                case 'delete':
                    onDelete();
                    break;
            }
        },
        [onEdit, onDuplicate, onDelete],
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
                    <Item key="edit" textValue="Edit">
                        <Edit size="S" />
                        <Text>Edit</Text>
                    </Item>
                    <Item key="duplicate" textValue="Duplicate">
                        <Duplicate size="S" />
                        <Text>Duplicate</Text>
                    </Item>
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
}: PromptCardProps): React.ReactElement {
    const handleClick = useCallback(() => onLaunch(), [onLaunch]);
    const cardButton = (
        <button
            type="button"
            data-testid="ai-prompt-card"
            className="ai-prompt-card"
            onClick={handleClick}
            style={STYLE_PROMPT_CARD}
        >
            <Text UNSAFE_className="text-sm font-semibold">{prompt.title}</Text>
            <View marginTop="size-50">
                <Text UNSAFE_className="text-xs text-gray-700">{prompt.prompt}</Text>
            </View>
        </button>
    );

    if (!isUserPrompt) {
        return cardButton;
    }

    // Defensive: if any handler is missing in user mode, just render the card.
    if (!onEdit || !onDuplicate || !onDelete) {
        return cardButton;
    }

    return (
        <div style={STYLE_CARD_WRAPPER}>
            {cardButton}
            <PromptKebab
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
            />
        </div>
    );
}
