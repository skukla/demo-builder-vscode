/**
 * BlockLibrariesSection
 *
 * The Block Libraries item on the Configure screen's rail (EDS-39). Before
 * this, a storefront's libraries could be chosen only in the creation wizard,
 * so adding one afterwards meant Edit and the whole wizard again.
 *
 * The picker is the wizard's own {@link BlockLibrariesStepContent}: one picker,
 * two surfaces. The screen says nothing about when a tick takes effect: Save
 * records the choice, and the notification that follows offers to add a newly
 * ticked library to the storefront and remove an unticked one
 * (`services/configureBlockLibraryWork.ts`).
 *
 * Its `.choice-*` classes come from project-creation's `choice-cards.css`, which
 * the Configure entry imports for exactly this section.
 *
 * @module features/dashboard/ui/configure/BlockLibrariesSection
 */

import React from 'react';
import { ConfigSection } from '@/core/ui/components/forms/ConfigSection';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { BlockLibrariesStepContent } from '@/features/project-creation/ui/components/BlockLibrariesStepContent';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { ConfigureBlockLibraryChoices } from '@/types/webviewPayloads';

export interface BlockLibrariesSectionProps {
    /** What this project can choose from. */
    choices: ConfigureBlockLibraryChoices;
    /** Ticked catalog library ids. */
    selectedBlockLibraries: string[];
    /** Ticked custom libraries. */
    customBlockLibraries: CustomBlockLibrary[];
    onBlockLibraryToggle: (libraryId: string, isSelected: boolean) => void;
    onCustomLibraryToggle: (library: CustomBlockLibrary, isSelected: boolean) => void;
}

function openCustomLibrarySettings(): void {
    webviewClient.postMessage('open-block-library-settings');
}

/**
 * Whether the project has any block library to show: one to tick, or a native
 * one shown locked. Decides both the rail item and the section body, so the
 * rail never offers a tab that draws nothing.
 *
 * @param choices - what the extension offers this project, if it sent any
 */
export function hasBlockLibraryChoices(choices: ConfigureBlockLibraryChoices | undefined): boolean {
    if (!choices) return false;
    return choices.native.length + choices.available.length + choices.customDefaults.length > 0;
}

/**
 * Draw the block libraries choice, or nothing when the project has none to choose from.
 *
 * @param props - the choices, the current ticks, and the two toggles
 * @returns the section, or null
 */
export function BlockLibrariesSection({
    choices,
    selectedBlockLibraries,
    customBlockLibraries,
    onBlockLibraryToggle,
    onCustomLibraryToggle,
}: BlockLibrariesSectionProps): React.ReactElement | null {
    if (!hasBlockLibraryChoices(choices)) return null;
    const { native, available, customDefaults } = choices;

    return (
        <ConfigSection id="block-libraries" label="Block Libraries" showDivider={false}>
            <BlockLibrariesStepContent
                nativeBlockLibraries={native}
                availableBlockLibraries={available}
                selectedBlockLibraries={selectedBlockLibraries}
                onBlockLibraryToggle={onBlockLibraryToggle}
                customBlockLibraryDefaults={customDefaults}
                customBlockLibraries={customBlockLibraries}
                onCustomLibraryToggle={onCustomLibraryToggle}
                onOpenCustomSettings={openCustomLibrarySettings}
            />
        </ConfigSection>
    );
}
