/**
 * PromptCard
 *
 * A single user-saved AI prompt rendered as a clickable card. Pin/Unpin, Edit,
 * Duplicate, Delete live in the kebab menu. Pinned prompts show a small pin
 * indicator inline with the title.
 *
 * IT LAUNCHES, AND THAT IS ALL. Clicking the card hands the prompt to the
 * terminal, where it runs for real. A second kebab row sent the same prompt to
 * the Prompt Workbench to be simulated; that surface moved to
 * `feature/evaluation-mode-dry-run` on 2026-08-26 (AI-3b) and the row went with it.
 * The library stays a launcher: it picks, and something else runs.
 *
 * Title clamps to 1 line and body clamps to 3 lines, so every card has the
 * same fixed height regardless of content length.
 *
 * Reordering is done via Pin + the parent's filter input — no drag-and-drop.
 */

import {
    Flex,
    Item,
    Text,
    View,
} from '@adobe/react-spectrum';
import PinOn from '@spectrum-icons/workflow/PinOn';
import React, { useCallback } from 'react';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
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
 * The card height now lives in CSS as `--prompt-card-height` (ai.css), which is
 * also what the "+ New prompt" tile in PromptGrid reads. It was exported from
 * here so the two could match; one value in one place still holds, and the place
 * is now one a stylesheet can reach.
 */

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
        [
            isPinned,
            promptBody,
            onPinToggle,
            onEdit,
            onDuplicate,
            onDelete,
            onCopy,
                ],
    );

    return (
        // The wrapper owns POSITIONING only (the card's concern); CardActionsMenu
        // brings the trigger, the menu, and its own click containment.
        <div className="prompt-card-kebab">
            <CardActionsMenu ariaLabel="More actions" onAction={handleAction}>
                <Item key="pin-toggle" textValue={isPinned ? 'Unpin' : 'Pin'}>
                    {renderMenuIcon(isPinned ? 'pinOff' : 'pinOn')}
                    <Text>{isPinned ? 'Unpin' : 'Pin'}</Text>
                </Item>
                <Item key="edit" textValue="Edit">
                    {renderMenuIcon('edit')}
                    <Text>Edit</Text>
                </Item>
                <Item key="duplicate" textValue="Duplicate">
                    {renderMenuIcon('duplicate')}
                    <Text>Duplicate</Text>
                </Item>
                {onCopy ? (
                    <Item key="copy" textValue="Copy prompt">
                        {renderMenuIcon('copy')}
                        <Text>Copy prompt</Text>
                    </Item>
                ) : null}
                <Item key="delete" textValue="Delete">
                    {renderMenuIcon('delete')}
                    <Text>Delete</Text>
                </Item>
            </CardActionsMenu>
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
        >
            <Flex direction="row" alignItems="center" gap="size-75">
                {isPinned && (
                    <span
                        data-testid="ai-prompt-pin-indicator"
                        aria-label="Pinned"
                        className="pin-indicator"
                    >
                        <PinOn size="XS" />
                    </span>
                )}
                <div className="prompt-card-title">
                    <Text UNSAFE_className="text-sm font-semibold">{prompt.title}</Text>
                </div>
            </Flex>
            <View marginTop="size-50">
                <div className="prompt-card-body">
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
        <div className="prompt-card-wrapper" data-testid="ai-prompt-card-wrapper">
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
