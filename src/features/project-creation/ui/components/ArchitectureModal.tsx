/**
 * ArchitectureModal Component
 *
 * Multi-step modal for selecting architecture/stack, optional addons,
 * and block libraries (for EDS stacks). Extracted from BrandGallery.tsx
 * to keep file sizes under the 500-line SOP limit.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import stacksConfig from '../../config/stacks.json';
import { getSelectableAppBuilderComponents } from '../../services/appBuilderComponentSelection';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
} from '../../services/blockLibraryLoader';
import {
    withSelectedAppBuilderComponent,
    meshAppBuilderComponentToComponentIds,
} from '../wizard/appBuilderComponentSelectionState';
import { AppBuilderComponentsStepContent } from './AppBuilderComponentsStepContent';
import { ArchitectureStepContent } from './ArchitectureStepContent';
import { BlockLibrariesStepContent } from './BlockLibrariesStepContent';
import { filterAddonsByPackage } from './brandGalleryHelpers';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { DemoPackage, type AddonSource } from '@/types/demoPackages';
import type { Stack, StacksConfig } from '@/types/stacks';

/** Addon display metadata from stacks.json */
const ADDON_METADATA = (stacksConfig as StacksConfig).addonDefinitions ?? {};

/** Duration (ms) for the step crossfade animation — must match CSS transition-duration */
const STEP_TRANSITION_MS = 200;

/** Stable empty array for selection defaults (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: string[] = [];

type ModalStep = 'architecture' | 'block-libraries';

export interface ArchitectureModalProps {
    pkg: DemoPackage;
    stacks: Stack[];
    selectedStackId?: string;
    selectedAddons?: string[];
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    onStackSelect: (stackId: string) => void;
    onAddonsChange: (addons: string[]) => void;
    onBlockLibrariesChange: (libraries: string[]) => void;
    onCustomBlockLibrariesChange: (libs: CustomBlockLibrary[]) => void;
    selectedOptionalDependencies?: string[];
    onOptionalDependenciesChange?: (deps: string[]) => void;
    /** Selected catalog appBuilderComponent ids (D2). */
    selectedAppBuilderComponents?: string[];
    /** Update the selected catalog appBuilderComponent ids (D2). */
    onSelectedAppBuilderComponentsChange?: (appBuilderComponents: string[]) => void;
    /** Add a custom appBuilderComponent from a canonicalized GitHub source (D2). */
    onAddCustomAppBuilderComponent?: (source: AddonSource) => void;
    onDone: () => void;
    onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
    pkg,
    stacks,
    selectedStackId,
    selectedAddons = [],
    selectedBlockLibraries = [],
    customBlockLibraries = [],
    customBlockLibraryDefaults = [],
    onStackSelect,
    onAddonsChange,
    onBlockLibrariesChange,
    onCustomBlockLibrariesChange,
    selectedOptionalDependencies = [],
    onOptionalDependenciesChange,
    selectedAppBuilderComponents = EMPTY_STRING_ARRAY,
    onSelectedAppBuilderComponentsChange,
    onAddCustomAppBuilderComponent,
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

    // Catalog-filtered appBuilderComponents for the selected architecture. The mesh is
    // now one normal row (no isMeshComponentId special-case); required rows are
    // locked, optional rows toggle. Replaces the old single mesh toggle.
    const selectableAppBuilderComponents = useMemo(() => {
        if (!selectedStack) return [];
        return getSelectableAppBuilderComponents(pkg, selectedStack.backend, selectedStack.frontend);
    }, [pkg, selectedStack]);

    // Toggle an App Builder component: update selectedAppBuilderComponents AND, for a mesh appBuilderComponent,
    // bridge to selectedOptionalDependencies so the existing Adobe-I/O wizard
    // step-filtering (hasMeshInDependencies) keeps working. This mesh→optionalDeps
    // mapping is the ONE transitional special-case (documented for D3 removal).
    const handleAppBuilderComponentToggle = useCallback(
        (id: string, isSelected: boolean) => {
            onSelectedAppBuilderComponentsChange?.(
                withSelectedAppBuilderComponent(selectedAppBuilderComponents, id, isSelected),
            );

            const meshComponentIds = meshAppBuilderComponentToComponentIds(id);
            if (meshComponentIds.length === 0 || !onOptionalDependenciesChange) return;

            if (isSelected) {
                onOptionalDependenciesChange([
                    ...new Set([...selectedOptionalDependencies, ...meshComponentIds]),
                ]);
            } else {
                onOptionalDependenciesChange(
                    selectedOptionalDependencies.filter(dep => !meshComponentIds.includes(dep)),
                );
            }
        },
        [
            selectedAppBuilderComponents,
            onSelectedAppBuilderComponentsChange,
            selectedOptionalDependencies,
            onOptionalDependenciesChange,
        ],
    );

    const handleAddCustomAppBuilderComponent = useCallback(
        (source: AddonSource) => {
            onAddCustomAppBuilderComponent?.(source);
        },
        [onAddCustomAppBuilderComponent],
    );

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
                    <>
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
                        />
                        {selectedStack && (
                            <AppBuilderComponentsStepContent
                                appBuilderComponents={selectableAppBuilderComponents}
                                selectedAppBuilderComponents={selectedAppBuilderComponents}
                                onAppBuilderComponentToggle={handleAppBuilderComponentToggle}
                                onAddCustomAppBuilderComponent={handleAddCustomAppBuilderComponent}
                            />
                        )}
                    </>
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
