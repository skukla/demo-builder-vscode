/**
 * BlockLibrariesStepContent Component
 *
 * Renders the block libraries area within the Project Builder step as selection CARDS
 * (the same blue-check family as the Demo Setup package cards / Commerce backend cards /
 * Integrations service cards) rather than plain checkboxes — so every "select something"
 * surface in the wizard reads as one system. Multi-select: each card is a toggle button
 * (`aria-pressed`); native libraries render as locked, always-selected (disabled) cards.
 *
 * Pure presentational component — all state and handlers live in the Project Builder step.
 */

import { Text, Divider, Link } from '@adobe/react-spectrum';
import React from 'react';
import { SelectionCheck } from './SelectionCheck';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';

/** One block-library selection card (a multi-select toggle; disabled = locked native). */
const LibraryCard: React.FC<{
    name: string;
    description: string;
    selected: boolean;
    disabled?: boolean;
    onToggle?: (next: boolean) => void;
}> = ({ name, description, selected, disabled = false, onToggle }) => (
    <button
        type="button"
        className="choice-card"
        data-selected={selected ? 'true' : 'false'}
        aria-pressed={selected}
        disabled={disabled}
        onClick={disabled || !onToggle ? undefined : () => onToggle(!selected)}
    >
        {selected && <SelectionCheck corner />}
        <span className="choice-card-name">{name}</span>
        <span className="choice-card-description">{description}</span>
    </button>
);

export interface BlockLibrariesStepContentProps {
    nativeBlockLibraries: BlockLibrary[];
    availableBlockLibraries: BlockLibrary[];
    selectedBlockLibraries: string[];
    onBlockLibraryToggle: (libraryId: string, isSelected: boolean) => void;
    customBlockLibraryDefaults: CustomBlockLibrary[];
    customBlockLibraries: CustomBlockLibrary[];
    onCustomLibraryToggle: (lib: CustomBlockLibrary, isSelected: boolean) => void;
    onOpenCustomSettings: () => void;
}

export const BlockLibrariesStepContent: React.FC<BlockLibrariesStepContentProps> = ({
    nativeBlockLibraries,
    availableBlockLibraries,
    selectedBlockLibraries,
    onBlockLibraryToggle,
    customBlockLibraryDefaults,
    customBlockLibraries,
    onCustomLibraryToggle,
    onOpenCustomSettings,
}) => (
    <>
        <Text UNSAFE_className="description-block">
            Which block libraries should be included?
        </Text>
        <div className="choice-grid" role="group" aria-label="Block libraries">
            {nativeBlockLibraries.map((lib) => (
                <LibraryCard
                    key={lib.id}
                    name={lib.name}
                    description="Included with your storefront"
                    selected
                    disabled
                />
            ))}
            {availableBlockLibraries.map((lib) => (
                <LibraryCard
                    key={lib.id}
                    name={lib.name}
                    description={lib.description}
                    selected={selectedBlockLibraries.includes(lib.id)}
                    onToggle={(next) => onBlockLibraryToggle(lib.id, next)}
                />
            ))}
        </div>

        {/* Custom block libraries from VS Code settings */}
        {customBlockLibraryDefaults.length > 0 && (
            <>
                <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                <Text UNSAFE_className="description-block-sm">Custom Libraries</Text>
                <div className="choice-grid" role="group" aria-label="Custom block libraries">
                    {customBlockLibraryDefaults.map((lib) => (
                        <LibraryCard
                            key={`${lib.source.owner}/${lib.source.repo}`}
                            name={lib.name}
                            description={`${lib.source.owner}/${lib.source.repo}`}
                            selected={customBlockLibraries.some(
                                (c) =>
                                    c.source.owner === lib.source.owner &&
                                    c.source.repo === lib.source.repo,
                            )}
                            onToggle={(next) => onCustomLibraryToggle(lib, next)}
                        />
                    ))}
                </div>
                <div className="settings-link">
                    <Link isQuiet onPress={onOpenCustomSettings}>
                        Configure custom libraries in Settings
                    </Link>
                </div>
            </>
        )}
    </>
);
