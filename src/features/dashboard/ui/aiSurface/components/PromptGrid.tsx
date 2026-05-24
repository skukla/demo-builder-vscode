/**
 * PromptGrid
 *
 * Renders the user's saved AI prompts as a responsive grid of `<PromptCard>`s,
 * ending with a "+ New prompt" tile. A search input (the same `SearchHeader`
 * used by the projects dashboard) lets users narrow the grid by typing.
 *
 * Ordering: pinned items first, alphabetical within each pin-group.
 * Filtering is non-destructive — it only hides cards from the rendered set;
 * the persisted prompt list is untouched.
 */

import { Text, View } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import { GridLayout } from '@/core/ui/components/layout/GridLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import type { AiPrompt } from '@/types/base';
import { PromptCard } from './PromptCard';

export interface PromptGridProps {
    /** User-saved prompts in their persisted order. */
    userPrompts: AiPrompt[];
    /** Called when a user card body is clicked. */
    onLaunchUser: (prompt: AiPrompt) => void;
    /** Kebab action — open edit dialog for the prompt id. */
    onEdit: (id: string) => void;
    /** Kebab action — duplicate the prompt by id. */
    onDuplicate: (id: string) => void;
    /** Kebab action — delete the prompt by id. */
    onDelete: (id: string) => void;
    /** Kebab action — toggle pinned state, called with the next value. */
    onPinToggle: (id: string, nextPinned: boolean) => void;
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

/**
 * Sort prompts pinned-first, alphabetical (case-insensitive) within each group.
 * Stable across renders for the same input.
 */
function sortPinnedFirst(prompts: AiPrompt[]): AiPrompt[] {
    return [...prompts].sort((a, b) => {
        const aPinned = a.pinned ? 1 : 0;
        const bPinned = b.pinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
}

export function PromptGrid({
    userPrompts,
    onLaunchUser,
    onEdit,
    onDuplicate,
    onDelete,
    onPinToggle,
    onNew,
}: PromptGridProps): React.ReactElement {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter is non-destructive: matches against title + prompt body, case-insensitive.
    const filteredPrompts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return userPrompts;
        return userPrompts.filter(p =>
            p.title.toLowerCase().includes(query) ||
            p.prompt.toLowerCase().includes(query),
        );
    }, [userPrompts, searchQuery]);

    const sortedPrompts = useMemo(() => sortPinnedFirst(filteredPrompts), [filteredPrompts]);

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
    const handlePinToggle = useCallback(
        (id: string) => (nextPinned: boolean) => onPinToggle(id, nextPinned),
        [onPinToggle],
    );

    return (
        <View>
            <View marginBottom="size-200">
                <SearchHeader
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    searchPlaceholder="Search prompts..."
                    totalCount={userPrompts.length}
                    filteredCount={filteredPrompts.length}
                    itemNoun="prompt"
                    // Prompts are loaded synchronously with the page — no
                    // separate loading state to gate the count on.
                    hasLoadedOnce={true}
                />
            </View>
            <GridLayout columns={3} gap="size-200">
                {sortedPrompts.map(prompt => (
                    <PromptCard
                        key={prompt.id}
                        prompt={prompt}
                        isUserPrompt
                        onLaunch={handleLaunchUser(prompt)}
                        onEdit={handleEdit(prompt.id)}
                        onDuplicate={handleDuplicate(prompt.id)}
                        onDelete={handleDelete(prompt.id)}
                        onPinToggle={handlePinToggle(prompt.id)}
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
    );
}
