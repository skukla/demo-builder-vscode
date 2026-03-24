/**
 * ArchitectureModal Component
 *
 * Multi-step modal for selecting architecture/stack, optional addons,
 * and block libraries (for EDS stacks). Extracted from BrandGallery.tsx
 * to keep file sizes under the 500-line SOP limit.
 */

import { Text, Checkbox, Divider, Link } from '@adobe/react-spectrum';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import stacksConfig from '../../config/stacks.json';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
} from '../../services/blockLibraryLoader';
import {
    getAvailableFeaturePacks,
    getNativeFeaturePacks,
} from '../../services/featurePackLoader';
import { filterAddonsByPackage } from './brandGalleryHelpers';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import { isMeshComponentId } from '@/core/constants';
import { getResolvedMeshRequirement } from '../../services/demoPackageLoader';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { DemoPackage } from '@/types/demoPackages';
import type { Stack, StacksConfig } from '@/types/stacks';

/** Addon display metadata from stacks.json */
const ADDON_METADATA = (stacksConfig as StacksConfig).addonDefinitions ?? {};

/** Duration (ms) for the step crossfade animation — must match CSS transition-duration */
const STEP_TRANSITION_MS = 200;

type ModalStep = 'architecture' | 'block-libraries';

export interface ArchitectureModalProps {
    pkg: DemoPackage;
    stacks: Stack[];
    selectedStackId?: string;
    selectedAddons?: string[];
    selectedFeaturePacks?: string[];
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    onStackSelect: (stackId: string) => void;
    onAddonsChange: (addons: string[]) => void;
    onFeaturePacksChange: (packs: string[]) => void;
    onBlockLibrariesChange: (libraries: string[]) => void;
    onCustomBlockLibrariesChange: (libs: CustomBlockLibrary[]) => void;
    selectedOptionalDependencies?: string[];
    onOptionalDependenciesChange?: (deps: string[]) => void;
    onDone: () => void;
    onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
    pkg,
    stacks,
    selectedStackId,
    selectedAddons = [],
    selectedFeaturePacks = [],
    selectedBlockLibraries = [],
    customBlockLibraries = [],
    customBlockLibraryDefaults = [],
    onStackSelect,
    onAddonsChange,
    onFeaturePacksChange,
    onBlockLibrariesChange,
    onCustomBlockLibrariesChange,
    selectedOptionalDependencies = [],
    onOptionalDependenciesChange,
    onDone,
    onClose,
}) => {
    const [modalStep, setModalStep] = useState<ModalStep>('architecture');

    // Filter stacks based on package's storefronts (available stacks are the storefront keys)
    const filteredStacks = useMemo(() => {
        const availableStackIds = Object.keys(pkg.storefronts || {});
        if (availableStackIds.length === 0) {
            return stacks; // No restrictions - show all stacks
        }
        return stacks.filter(stack => availableStackIds.includes(stack.id));
    }, [stacks, pkg.storefronts]);

    // Use arrow key navigation hook for stack options
    const { getItemProps } = useArrowKeyNavigation({
        itemCount: filteredStacks.length,
        onSelect: (index) => onStackSelect(filteredStacks[index].id),
        wrap: true,
        autoFocusFirst: true,
        orientation: 'both',
    });

    const handleStackClick = useCallback(
        (stackId: string) => {
            onStackSelect(stackId);
        },
        [onStackSelect],
    );

    const handleAddonToggle = useCallback(
        (addonId: string, isSelected: boolean) => {
            if (isSelected) {
                onAddonsChange([...selectedAddons, addonId]);
            } else {
                onAddonsChange(selectedAddons.filter(id => id !== addonId));
            }
        },
        [selectedAddons, onAddonsChange],
    );

    const handleFeaturePackToggle = useCallback(
        (packId: string, isSelected: boolean) => {
            if (isSelected) {
                onFeaturePacksChange([...selectedFeaturePacks, packId]);
            } else {
                onFeaturePacksChange(selectedFeaturePacks.filter(id => id !== packId));
            }
        },
        [selectedFeaturePacks, onFeaturePacksChange],
    );

    // Get the selected stack object
    const selectedStack = useMemo(() => {
        if (!selectedStackId) return null;
        return stacks.find(s => s.id === selectedStackId) || null;
    }, [stacks, selectedStackId]);

    // Determine if the selected stack is an EDS stack (has block libraries)
    const isEdsStack = selectedStack?.frontend === 'eds-storefront';

    // Get available block libraries for the current stack and package
    const availableBlockLibraries = useMemo(() => {
        if (!selectedStack || !isEdsStack) return [];
        return getAvailableBlockLibraries(selectedStack, pkg.id);
    }, [selectedStack, isEdsStack, pkg.id]);

    // Get block libraries that are native to this package (shown as disabled/checked)
    const nativeBlockLibraries = useMemo(() => {
        if (!selectedStack || !isEdsStack) return [];
        return getNativeBlockLibraries(selectedStack, pkg.id);
    }, [selectedStack, isEdsStack, pkg.id]);

    // Get available feature packs (optional) for the current stack and package
    const availableFeaturePacks = useMemo(() => {
        if (!selectedStack) return [];
        return getAvailableFeaturePacks(selectedStack, pkg.id);
    }, [selectedStack, pkg.id]);

    // Get feature packs that are required (shown as disabled/checked)
    const nativeFeaturePacks = useMemo(() => {
        if (!selectedStack) return [];
        return getNativeFeaturePacks(selectedStack, pkg.id);
    }, [selectedStack, pkg.id]);

    const hasFeaturePacks = availableFeaturePacks.length > 0 || nativeFeaturePacks.length > 0;

    // Determine if mesh toggle should be shown
    // Show when stack has optional mesh dependencies AND package does NOT require mesh
    const meshOptionalDeps = useMemo((): string[] => {
        if (!selectedStack) return [];
        return (selectedStack.optionalDependencies ?? []).filter(id => isMeshComponentId(id));
    }, [selectedStack]);

    // Resolve mesh requirement: storefront-level overrides package-level
    const resolvedMeshReq = useMemo(
        () => getResolvedMeshRequirement(pkg, selectedStackId ?? ''),
        [pkg, selectedStackId],
    );

    const showMeshToggle = meshOptionalDeps.length > 0 && resolvedMeshReq === 'optional';
    const isMeshAutoIncluded = meshOptionalDeps.length > 0 && resolvedMeshReq === true;

    const handleMeshToggle = useCallback(
        (isSelected: boolean) => {
            if (!onOptionalDependenciesChange) return;
            if (isSelected) {
                const newDeps = [...new Set([...selectedOptionalDependencies, ...meshOptionalDeps])];
                onOptionalDependenciesChange(newDeps);
            } else {
                onOptionalDependenciesChange(
                    selectedOptionalDependencies.filter(id => !meshOptionalDeps.includes(id)),
                );
            }
        },
        [selectedOptionalDependencies, meshOptionalDeps, onOptionalDependenciesChange],
    );

    const isMeshSelected = meshOptionalDeps.some(id => selectedOptionalDependencies.includes(id));

    const handleBlockLibraryToggle = useCallback(
        (libraryId: string, isSelected: boolean) => {
            if (isSelected) {
                onBlockLibrariesChange([...selectedBlockLibraries, libraryId]);
            } else {
                onBlockLibrariesChange(selectedBlockLibraries.filter(id => id !== libraryId));
            }
        },
        [selectedBlockLibraries, onBlockLibrariesChange],
    );

    // Custom block library checkbox toggle handler
    const handleCustomLibraryToggle = useCallback(
        (lib: CustomBlockLibrary, isSelected: boolean) => {
            if (isSelected) {
                onCustomBlockLibrariesChange([...customBlockLibraries, lib]);
            } else {
                onCustomBlockLibrariesChange(
                    customBlockLibraries.filter(
                        c => !(c.source.owner === lib.source.owner && c.source.repo === lib.source.repo),
                    ),
                );
            }
        },
        [customBlockLibraries, onCustomBlockLibrariesChange],
    );

    // Open VS Code settings for custom block libraries
    const handleOpenCustomSettings = useCallback(() => {
        vscode.postMessage('open-block-library-settings');
    }, []);

    // Get available addons: stack defines possible addons, package restricts by brand
    const availableAddons = useMemo(() => {
        if (!selectedStack) return [];
        const stackAddons = (selectedStack.optionalAddons || []).filter(addon => ADDON_METADATA[addon.id]);
        return filterAddonsByPackage(stackAddons, pkg);
    }, [selectedStack, pkg]);

    // Cache last non-empty addons so content stays rendered during exit animation
    const lastAddonsRef = useRef(availableAddons);
    if (availableAddons.length > 0) {
        lastAddonsRef.current = availableAddons;
    }
    const displayAddons = availableAddons.length > 0 ? availableAddons : lastAddonsRef.current;

    // Transition state for smooth crossfade between modal steps
    const [isStepTransitioning, setIsStepTransitioning] = useState(false);
    const transitionDirection = useRef<'forward' | 'backward'>('forward');
    const pendingStep = useRef<'architecture' | 'block-libraries' | null>(null);

    // After fade-out completes, switch step and fade back in
    useEffect(() => {
        if (!isStepTransitioning) return;
        const timer = setTimeout(() => {
            if (pendingStep.current) {
                setModalStep(pendingStep.current);
                pendingStep.current = null;
            }
            setIsStepTransitioning(false);
        }, STEP_TRANSITION_MS);
        return () => clearTimeout(timer);
    }, [isStepTransitioning]);

    // Step 1 footer: "Next" for EDS stacks, "Done" for non-EDS
    const handleArchitectureNext = useCallback(() => {
        if (isEdsStack) {
            transitionDirection.current = 'forward';
            pendingStep.current = 'block-libraries';
            setIsStepTransitioning(true);
        } else {
            onDone();
        }
    }, [isEdsStack, onDone]);

    const handleBlockLibrariesBack = useCallback(() => {
        transitionDirection.current = 'backward';
        pendingStep.current = 'architecture';
        setIsStepTransitioning(true);
    }, []);

    // Build action buttons based on current step
    const actionButtons = useMemo(() => {
        if (modalStep === 'architecture') {
            if (!selectedStackId) return [];
            const label = isEdsStack ? 'Next' : 'Done';
            return [{ label, variant: 'primary' as const, onPress: handleArchitectureNext }];
        }
        // Block libraries step
        return [
            { label: 'Back', variant: 'secondary' as const, onPress: handleBlockLibrariesBack },
            { label: 'Done', variant: 'primary' as const, onPress: onDone },
        ];
    }, [modalStep, selectedStackId, isEdsStack, handleArchitectureNext, handleBlockLibrariesBack, onDone]);

    return (
        <Modal
            title={pkg.name}
            onClose={onClose}
            size="M"
            actionButtons={actionButtons}
        >
            <div className={cn(
                'modal-step-content',
                isStepTransitioning && 'transitioning',
                isStepTransitioning && transitionDirection.current,
            )}>
                {modalStep === 'architecture' && (
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
                                        onClick={() => handleStackClick(stack.id)}
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
                                    const addonMeta = ADDON_METADATA[optionalAddon.id];
                                    if (!addonMeta) return null;
                                    const addonConfig = pkg.addons?.[optionalAddon.id];
                                    const isRequired = addonConfig === 'required';
                                    const isChecked = isRequired || selectedAddons.includes(optionalAddon.id);
                                    return (
                                        <Checkbox
                                            key={optionalAddon.id}
                                            isSelected={isChecked}
                                            isDisabled={isRequired}
                                            onChange={(isSelected) => handleAddonToggle(optionalAddon.id, isSelected)}
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

                        {/* Feature Packs Section - shown when packs are available for this stack/package */}
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
                                            onChange={(isSelected) => handleFeaturePackToggle(pack.id, isSelected)}
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

                        {/* API Mesh Section - shown when mesh is optional or auto-included */}
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
                                        onChange={handleMeshToggle}
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
                )}

                {modalStep === 'block-libraries' && (
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
                                    onChange={(isSelected) => handleBlockLibraryToggle(lib.id, isSelected)}
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
                                            onChange={(isSelected) => handleCustomLibraryToggle(lib, isSelected)}
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
                                    <Link isQuiet onPress={handleOpenCustomSettings}>
                                        Configure custom libraries in Settings
                                    </Link>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};
