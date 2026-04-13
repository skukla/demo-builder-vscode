/**
 * ArchitectureModal Component
 *
 * Multi-step modal for selecting architecture/stack, optional addons,
 * and block libraries (for EDS stacks). Extracted from BrandGallery.tsx
 * to keep file sizes under the 500-line SOP limit.
 */

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
import { ArchitectureStepContent } from './ArchitectureStepContent';
import { BlockLibrariesStepContent } from './BlockLibrariesStepContent';
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

    // Compute required addon IDs from package config
    const requiredAddonIds = useMemo(() => {
        if (!pkg.addons) return [];
        return Object.entries(pkg.addons)
            .filter(([, config]) => config === 'required')
            .map(([id]) => id);
    }, [pkg.addons]);

    // Compute step sequence dynamically based on selected stack
    const steps: ModalStep[] = useMemo(() => {
        const s: ModalStep[] = ['architecture'];
        if (isEdsStack) s.push('block-libraries');
        return s;
    }, [isEdsStack]);

    const currentIndex = steps.indexOf(modalStep);
    const isFirstStep = currentIndex === 0;
    const isLastStep = currentIndex === steps.length - 1;

    // Transition state for smooth crossfade between modal steps
    const [isStepTransitioning, setIsStepTransitioning] = useState(false);
    const transitionDirection = useRef<'forward' | 'backward'>('forward');
    const pendingStep = useRef<ModalStep | null>(null);

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

    const handleNext = useCallback(() => {
        if (isLastStep) {
            onDone();
        } else {
            transitionDirection.current = 'forward';
            pendingStep.current = steps[currentIndex + 1];
            setIsStepTransitioning(true);
        }
    }, [isLastStep, onDone, steps, currentIndex]);

    const handleBack = useCallback(() => {
        transitionDirection.current = 'backward';
        pendingStep.current = steps[currentIndex - 1];
        setIsStepTransitioning(true);
    }, [steps, currentIndex]);

    // Build action buttons from position in step sequence
    const actionButtons = useMemo(() => {
        if (modalStep === 'architecture' && !selectedStackId) return [];
        const buttons: { label: string; variant: 'primary' | 'secondary'; onPress: () => void; isDisabled?: boolean }[] = [];
        if (!isFirstStep) {
            buttons.push({ label: 'Back', variant: 'secondary', onPress: handleBack });
        }
        if (isLastStep) {
            buttons.push({ label: 'Done', variant: 'primary', onPress: handleNext });
        } else {
            buttons.push({ label: 'Next', variant: 'primary', onPress: handleNext });
        }
        return buttons;
    }, [modalStep, selectedStackId, isFirstStep, isLastStep, handleBack, handleNext]);

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
                    <ArchitectureStepContent
                        stackSelection={{
                            filteredStacks,
                            selectedStackId,
                            getItemProps,
                            onStackClick: onStackSelect,
                        }}
                        addonSelection={{
                            availableAddons,
                            displayAddons,
                            selectedAddons,
                            onAddonToggle: handleAddonToggle,
                            addonMetadata: ADDON_METADATA,
                            requiredAddonIds,
                        }}
                        featurePacks={{
                            hasFeaturePacks,
                            nativeFeaturePacks,
                            availableFeaturePacks,
                            selectedFeaturePacks,
                            onFeaturePackToggle: handleFeaturePackToggle,
                        }}
                        mesh={{
                            showMeshToggle,
                            isMeshAutoIncluded,
                            isMeshSelected,
                            onMeshToggle: handleMeshToggle,
                        }}
                    />
                )}

                {modalStep === 'block-libraries' && (
                    <BlockLibrariesStepContent
                        nativeBlockLibraries={nativeBlockLibraries}
                        availableBlockLibraries={availableBlockLibraries}
                        selectedBlockLibraries={selectedBlockLibraries}
                        onBlockLibraryToggle={handleBlockLibraryToggle}
                        customBlockLibraryDefaults={customBlockLibraryDefaults}
                        customBlockLibraries={customBlockLibraries}
                        onCustomLibraryToggle={handleCustomLibraryToggle}
                        onOpenCustomSettings={handleOpenCustomSettings}
                    />
                )}

            </div>
        </Modal>
    );
};
