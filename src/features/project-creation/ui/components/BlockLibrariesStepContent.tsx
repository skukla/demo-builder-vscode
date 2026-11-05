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

import { Text, Link } from '@adobe/react-spectrum';
import React from 'react';
import { ChoiceCard } from './ChoiceCard';
import { ConfigSection } from '@/core/ui/components/forms/ConfigSection';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';

/** One block-library selection card (a multi-select toggle; disabled = locked native). */
function LibraryCard({
    name,
    description,
    selected,
    disabled = false,
    onToggle,
}: {
    name: string;
    description: string;
    selected: boolean;
    disabled?: boolean;
    onToggle?: (next: boolean) => void;
}) {
    return (
        <ChoiceCard
            name={name}
            description={description}
            selected={selected}
            disabled={disabled}
            pressed={selected}
            onSelect={onToggle ? () => onToggle(!selected) : undefined}
        />
    );
}

/**
 * Where the custom list is edited, as one sentence with its link, in the small grey text
 * Configure's Authoring line uses (owner, 2026-11-03). A link on its own line under "None
 * added yet." sat 32px away from what it was about.
 */
function CustomLibrariesNote({
    hasLibraries,
    onOpenSettings,
}: {
    hasLibraries: boolean;
    onOpenSettings: () => void;
}): React.ReactElement {
    return (
        <div className={hasLibraries ? 'settings-link' : undefined}>
            <Text UNSAFE_className="text-gray-600 text-sm">
                {hasLibraries ? 'Edit this list in ' : 'None added yet. Add them in '}
                <Link onPress={onOpenSettings} UNSAFE_className="cursor-pointer">
                    Block Library Settings
                </Link>
                .
            </Text>
        </div>
    );
}

export interface BlockLibrariesStepContentProps {
    /** Libraries every storefront gets: locked, ticked. */
    includedBlockLibraries: BlockLibrary[];
    /** Libraries the package's own storefront comes with: locked, ticked. */
    nativeBlockLibraries: BlockLibrary[];
    availableBlockLibraries: BlockLibrary[];
    selectedBlockLibraries: string[];
    onBlockLibraryToggle: (libraryId: string, isSelected: boolean) => void;
    customBlockLibraryDefaults: CustomBlockLibrary[];
    customBlockLibraries: CustomBlockLibrary[];
    onCustomLibraryToggle: (lib: CustomBlockLibrary, isSelected: boolean) => void;
    onOpenCustomSettings: () => void;
}

export function BlockLibrariesStepContent({
    includedBlockLibraries,
    nativeBlockLibraries,
    availableBlockLibraries,
    selectedBlockLibraries,
    onBlockLibraryToggle,
    customBlockLibraryDefaults,
    customBlockLibraries,
    onCustomLibraryToggle,
    onOpenCustomSettings,
}: BlockLibrariesStepContentProps) {
    return (
        <>
            {/* Both groups headed as the wizard's other steps head theirs (owner, 2026-11-05):
                a small grey description style had stood in for a heading here. No sentence: the
                heading and the ticked cards say it (owner, 2026-11-05). */}
            <ConfigSection id="block-libraries" label="Block Libraries">
                <div className="choice-grid choice-grid--columns" role="group" aria-label="Block libraries">
                    {includedBlockLibraries.map((lib) => (
                        <LibraryCard
                            key={lib.id}
                            name={lib.name}
                            description="Included with every storefront"
                            selected
                            disabled
                        />
                    ))}
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
            </ConfigSection>
            {/* Custom block libraries from VS Code settings: shown even when there are none, so
                an SC can find where to add one. */}
            <ConfigSection id="custom-block-libraries" label="Custom Block Libraries">
                {customBlockLibraryDefaults.length > 0 ? (
                    <div className="choice-grid choice-grid--columns" role="group" aria-label="Custom block libraries">
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
                ) : null}
                <CustomLibrariesNote
                    hasLibraries={customBlockLibraryDefaults.length > 0}
                    onOpenSettings={onOpenCustomSettings}
                />
            </ConfigSection>
        </>
    );
}
