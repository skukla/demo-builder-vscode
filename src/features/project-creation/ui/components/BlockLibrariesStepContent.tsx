/**
 * BlockLibrariesStepContent Component
 *
 * Renders the block libraries step content within the ArchitectureModal:
 * native libraries (disabled), available libraries (toggleable),
 * and custom libraries from VS Code settings.
 *
 * Pure presentational component -- all state and handlers live in ArchitectureModal.
 */

import { Text, Checkbox, Divider, Link } from '@adobe/react-spectrum';
import React from 'react';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';

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
        <Text UNSAFE_className="description-block-sm block-libraries-intro">
            Your storefront's native blocks are always included. These additional libraries add extra blocks to your project.
        </Text>
        <div className="architecture-addons">
            {nativeBlockLibraries.map((lib) => (
                <Checkbox
                    key={lib.id}
                    isSelected={true}
                    isDisabled={true}
                    onChange={() => {}}
                >
                    <span className="addon-label">
                        <span className="addon-name">{lib.name}</span>
                        <span className="addon-description">Included with your storefront</span>
                    </span>
                </Checkbox>
            ))}
            {availableBlockLibraries.map((lib) => (
                <Checkbox
                    key={lib.id}
                    isSelected={selectedBlockLibraries.includes(lib.id)}
                    onChange={(isSelected) => onBlockLibraryToggle(lib.id, isSelected)}
                >
                    <span className="addon-label">
                        <span className="addon-name">{lib.name}</span>
                        <span className="addon-description">{lib.description}</span>
                    </span>
                </Checkbox>
            ))}
        </div>

        {/* Custom block libraries from VS Code settings */}
        {customBlockLibraryDefaults.length > 0 && (
            <>
                <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                <Text UNSAFE_className="description-block-sm">
                    Custom Libraries
                </Text>
                <div className="architecture-addons">
                    {customBlockLibraryDefaults.map((lib) => (
                        <Checkbox
                            key={`${lib.source.owner}/${lib.source.repo}`}
                            isSelected={customBlockLibraries.some(
                                c => c.source.owner === lib.source.owner && c.source.repo === lib.source.repo,
                            )}
                            onChange={(isSelected) => onCustomLibraryToggle(lib, isSelected)}
                        >
                            <span className="addon-label">
                                <span className="addon-name">{lib.name}</span>
                                <span className="addon-description">
                                    {lib.source.owner}/{lib.source.repo}
                                </span>
                            </span>
                        </Checkbox>
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
