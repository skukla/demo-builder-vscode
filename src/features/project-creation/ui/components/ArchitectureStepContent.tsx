/**
 * ArchitectureStepContent Component
 *
 * Renders the architecture step content within the ArchitectureModal:
 * stack radio group, optional services (addons), feature packs, and API mesh toggle.
 *
 * Pure presentational component -- all state and handlers live in ArchitectureModal.
 */

import { Text, Checkbox, Divider } from '@adobe/react-spectrum';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import type { OptionalAddon } from '@/types/stacks';
import type { FeaturePack } from '@/types/featurePacks';

interface StackSelectionProps {
    filteredStacks: { id: string; name: string; description: string }[];
    selectedStackId?: string;
    getItemProps: (index: number) => {
        ref: ((el: HTMLElement | null) => void) | React.RefObject<HTMLDivElement>;
        tabIndex: number;
        onKeyDown: (e: React.KeyboardEvent) => void;
    };
    onStackClick: (stackId: string) => void;
}

interface AddonSelectionProps {
    availableAddons: OptionalAddon[];
    displayAddons: OptionalAddon[];
    selectedAddons: string[];
    onAddonToggle: (addonId: string, isSelected: boolean) => void;
    addonMetadata: Record<string, { name: string; description: string }>;
    requiredAddonIds?: string[];
}

interface FeaturePackSelectionProps {
    hasFeaturePacks: boolean;
    nativeFeaturePacks: FeaturePack[];
    availableFeaturePacks: FeaturePack[];
    selectedFeaturePacks: string[];
    onFeaturePackToggle: (packId: string, isSelected: boolean) => void;
}

interface MeshSelectionProps {
    showMeshToggle: boolean;
    isMeshAutoIncluded: boolean;
    isMeshSelected: boolean;
    onMeshToggle: (isSelected: boolean) => void;
}

export interface ArchitectureStepContentProps {
    stackSelection: StackSelectionProps;
    addonSelection: AddonSelectionProps;
    featurePacks: FeaturePackSelectionProps;
    mesh: MeshSelectionProps;
}

export const ArchitectureStepContent: React.FC<ArchitectureStepContentProps> = ({
    stackSelection,
    addonSelection,
    featurePacks,
    mesh,
}) => {
    const { filteredStacks, selectedStackId, getItemProps, onStackClick } = stackSelection;
    const {
        availableAddons,
        displayAddons,
        selectedAddons,
        onAddonToggle,
        addonMetadata,
        requiredAddonIds = [],
    } = addonSelection;
    const {
        hasFeaturePacks,
        nativeFeaturePacks,
        availableFeaturePacks,
        selectedFeaturePacks,
        onFeaturePackToggle,
    } = featurePacks;
    const { showMeshToggle, isMeshAutoIncluded, isMeshSelected, onMeshToggle } = mesh;

    return (
    <>
        <Text UNSAFE_className="description-block">
            How should it be built?
        </Text>
        <div className="architecture-modal-options" role="radiogroup" aria-label="Architecture options">
            {filteredStacks.map((stack, index) => {
                const isSelected = selectedStackId === stack.id;
                const itemProps = getItemProps(index);
                return (
                    <div
                        key={stack.id}
                        ref={itemProps.ref}
                        role="radio"
                        tabIndex={itemProps.tabIndex}
                        aria-checked={isSelected}
                        data-selected={isSelected ? 'true' : 'false'}
                        className={cn(
                            'architecture-modal-option',
                            isSelected && 'selected',
                        )}
                        onClick={() => onStackClick(stack.id)}
                        onKeyDown={itemProps.onKeyDown}
                    >
                        <div className="architecture-radio">
                            {isSelected && <div className="architecture-radio-dot" />}
                        </div>
                        <div className="architecture-content">
                            <Text UNSAFE_className="architecture-name">
                                {stack.name}
                            </Text>
                            <Text UNSAFE_className="architecture-description">
                                {stack.description}
                            </Text>
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Services Section - always rendered, animated in/out via CSS */}
        <div className={cn('addons-section', availableAddons.length > 0 && 'addons-visible')}>
            <Divider size="S" marginTop="size-300" marginBottom="size-200" />
            <Text UNSAFE_className="description-block-sm">
                Optional Services
            </Text>
            <div className="architecture-addons">
                {displayAddons.map((optionalAddon) => {
                    const addonMeta = addonMetadata[optionalAddon.id];
                    if (!addonMeta) return null;
                    const isRequired = requiredAddonIds.includes(optionalAddon.id);
                    const isChecked = isRequired || selectedAddons.includes(optionalAddon.id);
                    return (
                        <Checkbox
                            key={optionalAddon.id}
                            isSelected={isChecked}
                            isDisabled={isRequired}
                            onChange={(isSelected) => onAddonToggle(optionalAddon.id, isSelected)}
                        >
                            <span className="addon-label">
                                <span className="addon-name">{addonMeta.name}</span>
                                <span className="addon-description">{addonMeta.description}</span>
                            </span>
                        </Checkbox>
                    );
                })}
            </div>
        </div>

        {/* Feature Packs Section */}
        {hasFeaturePacks && (
            <div className="addons-section addons-visible">
                <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                <Text UNSAFE_className="description-block-sm">
                    Feature Packs
                </Text>
                <div className="architecture-addons">
                    {nativeFeaturePacks.map((pack) => (
                        <Checkbox
                            key={pack.id}
                            isSelected={true}
                            isDisabled={true}
                            onChange={() => {}}
                        >
                            <span className="addon-label">
                                <span className="addon-name">{pack.name}</span>
                                <span className="addon-description">{pack.description}</span>
                            </span>
                        </Checkbox>
                    ))}
                    {availableFeaturePacks.map((pack) => (
                        <Checkbox
                            key={pack.id}
                            isSelected={selectedFeaturePacks.includes(pack.id)}
                            onChange={(isSelected) => onFeaturePackToggle(pack.id, isSelected)}
                        >
                            <span className="addon-label">
                                <span className="addon-name">{pack.name}</span>
                                <span className="addon-description">{pack.description}</span>
                            </span>
                        </Checkbox>
                    ))}
                </div>
            </div>
        )}

        {/* API Mesh Section */}
        {(showMeshToggle || isMeshAutoIncluded) && (
            <div className="addons-section addons-visible">
                <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                <Text UNSAFE_className="description-block-sm">
                    API Mesh
                </Text>
                <div className="architecture-addons">
                    <Checkbox
                        isSelected={isMeshAutoIncluded || isMeshSelected}
                        isDisabled={isMeshAutoIncluded}
                        onChange={onMeshToggle}
                    >
                        <span className="addon-label">
                            <span className="addon-name">Include API Mesh</span>
                            <span className="addon-description">
                                Deploy an API Mesh for GraphQL query routing. Not required for direct backend connections.
                            </span>
                        </span>
                    </Checkbox>
                </div>
            </div>
        )}
    </>
    );
};
