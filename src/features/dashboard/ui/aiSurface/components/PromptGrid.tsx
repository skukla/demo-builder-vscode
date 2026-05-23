/**
 * PromptGrid (Batch F2 + F3)
 *
 * The left-column primary content of the AI surface. Renders curated AI
 * prompts as a responsive grid of `<PromptCard>`s under a "Suggested
 * prompts" heading. In Batch F3 a real "Your prompts" section is rendered
 * for user-saved prompts plus a "+ New prompt" tile.
 *
 * Composition: uses the shared `GridLayout` to keep the grid responsive
 * and respect Spectrum design tokens. No new UI primitives.
 */

import { Text, View } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { GridLayout } from '@/core/ui/components/layout/GridLayout';
import type { AiPrompt } from '@/types/base';
import { PromptCard } from './PromptCard';

export interface PromptGridProps {
    /** Curated prompts shown under "Suggested prompts". */
    curatedPrompts: AiPrompt[];
    /** User-saved prompts shown under "Your prompts". */
    userPrompts: AiPrompt[];
    /** Called when a curated card is clicked, with the prompt text. */
    onLaunch: (prompt: string) => void;
    /** Called when a user card body is clicked. */
    onLaunchUser: (prompt: AiPrompt) => void;
    /** Kebab action — open edit dialog for the prompt id. */
    onEdit: (id: string) => void;
    /** Kebab action — duplicate the prompt by id. */
    onDuplicate: (id: string) => void;
    /** Kebab action — delete the prompt by id. */
    onDelete: (id: string) => void;
    /** Called when the "+ New prompt" tile is clicked. */
    onNew: () => void;
}

const STYLE_NEW_TILE = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: '64px',
    padding: '10px 12px',
    border: '1px dashed var(--spectrum-global-color-gray-400)',
    borderRadius: '4px',
    background: 'transparent',
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
} as const;

export function PromptGrid({
    curatedPrompts,
    userPrompts,
    onLaunch,
    onLaunchUser,
    onEdit,
    onDuplicate,
    onDelete,
    onNew,
}: PromptGridProps): React.ReactElement {
    const handleLaunch = useCallback(
        (prompt: string) => () => onLaunch(prompt),
        [onLaunch],
    );

    const handleLaunchUser = useCallback(
        (userPrompt: AiPrompt) => () => onLaunchUser(userPrompt),
        [onLaunchUser],
    );

    const handleEdit = useCallback((id: string) => () => onEdit(id), [onEdit]);
    const handleDuplicate = useCallback(
        (id: string) => () => onDuplicate(id),
        [onDuplicate],
    );
    const handleDelete = useCallback(
        (id: string) => () => onDelete(id),
        [onDelete],
    );

    const hasUserPrompts = userPrompts.length > 0;

    return (
        <View>
            <Text UNSAFE_className="text-xs font-semibold text-gray-700 text-uppercase letter-spacing-05">
                Suggested prompts
            </Text>
            <View marginTop="size-150">
                <GridLayout columns={3} gap="size-200">
                    {curatedPrompts.map(prompt => (
                        <PromptCard
                            key={prompt.id}
                            prompt={prompt}
                            onLaunch={handleLaunch(prompt.prompt)}
                        />
                    ))}
                </GridLayout>
            </View>

            <View marginTop="size-300">
                {hasUserPrompts && (
                    <Text UNSAFE_className="text-xs font-semibold text-gray-700 text-uppercase letter-spacing-05">
                        Your prompts
                    </Text>
                )}
                <View marginTop={hasUserPrompts ? 'size-150' : 'size-0'}>
                    <GridLayout columns={3} gap="size-200">
                        {userPrompts.map(prompt => (
                            <PromptCard
                                key={prompt.id}
                                prompt={prompt}
                                isUserPrompt
                                onLaunch={handleLaunchUser(prompt)}
                                onEdit={handleEdit(prompt.id)}
                                onDuplicate={handleDuplicate(prompt.id)}
                                onDelete={handleDelete(prompt.id)}
                            />
                        ))}
                        <button
                            type="button"
                            data-testid="ai-new-prompt-tile"
                            onClick={onNew}
                            style={STYLE_NEW_TILE}
                        >
                            <Text UNSAFE_className="text-sm">+ New prompt</Text>
                        </button>
                    </GridLayout>
                </View>
            </View>
        </View>
    );
}
