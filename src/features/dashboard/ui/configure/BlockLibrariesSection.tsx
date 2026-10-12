/**
 * BlockLibrariesSection
 *
 * The block libraries choice on the Configure screen's Authoring tab (EDS-39).
 * Before this, a storefront's libraries could be chosen only in the creation
 * wizard, so adding one afterwards meant Edit and the whole wizard again.
 *
 * The picker is the wizard's own {@link BlockLibrariesStepContent}: one picker,
 * two surfaces. This file adds only what Configure has to say that the wizard
 * does not, because here the storefront already exists:
 *   - ticking RECORDS the library; the update check installs it;
 *   - unticking removes the record, never the blocks already in the storefront.
 *
 * Those two sentences are muted text, the same as the Authoring footer above
 * them. `feedback/InlineNotice` was considered and rejected: it is a banner for
 * a warning, and neither sentence is one.
 *
 * Its `.choice-*` classes come from project-creation's `choice-cards.css`, which
 * the Configure entry imports for exactly this section.
 *
 * @module features/dashboard/ui/configure/BlockLibrariesSection
 */

import { Text } from '@adobe/react-spectrum';
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
    const { native, available, customDefaults } = choices;
    if (native.length + available.length + customDefaults.length === 0) return null;

    return (
        <ConfigSection id="block-libraries" label="Block Libraries" showDivider>
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
            <Text UNSAFE_className="text-gray-600 text-sm">
                Save, then run Check for Updates to add a newly ticked library to the storefront.
            </Text>
            <Text UNSAFE_className="text-gray-600 text-sm">
                Unticking a library does not remove the blocks it already added to the storefront.
            </Text>
        </ConfigSection>
    );
}
