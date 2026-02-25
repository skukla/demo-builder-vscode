/**
 * BrandGallery Component
 *
 * Hybrid approach: Modal for architecture selection + expanded card for confirmation.
 * 1. Click brand → Modal opens with architecture options (room for descriptions)
 * 2. Select architecture → Modal closes
 * 3. Card expands to show the confirmed selection (at-a-glance confirmation)
 */

import { Text, TextField, Button, DialogContainer, Checkbox, Divider } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import stacksConfig from '../../config/stacks.json';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
    getBlockLibraryName,
} from '../../services/blockLibraryLoader';
import {
    parseCustomBlockLibraryUrl,
    deriveBlockLibraryName,
    isDuplicateCustomLibrary,
} from '../../services/customBlockLibraryUtils';
import { sortPackages, filterPackagesBySearchQuery, filterAddonsByPackage } from './brandGalleryHelpers';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { DemoPackage } from '@/types/demoPackages';
import type { Stack, StacksConfig } from '@/types/stacks';

/** Addon display metadata from stacks.json */
const ADDON_METADATA = (stacksConfig as StacksConfig).addonDefinitions ?? {};

export interface BrandGalleryProps {
    /** Demo packages to display (renamed from brands) */
    packages: DemoPackage[];
    stacks: Stack[];
    selectedPackage?: string;
    selectedStack?: string;
    selectedAddons?: string[];
    onPackageSelect: (packageId: string) => void;
    onStackSelect: (stackId: string) => void;
    onAddonsChange?: (addons: string[]) => void;
    selectedBlockLibraries?: string[];
    onBlockLibrariesChange?: (libraries: string[]) => void;
    /** User's saved block library default preferences (from settings) */
    blockLibraryDefaults?: string[];
    /** Custom block libraries added by URL */
    customBlockLibraries?: CustomBlockLibrary[];
    /** Callback when custom block libraries change */
    onCustomBlockLibrariesChange?: (libs: CustomBlockLibrary[]) => void;
    /** Custom block library defaults from VS Code settings */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    /** Optional content to render above the gallery (e.g., project name field) */
    headerContent?: React.ReactNode;
}

interface PackageCardProps {
    pkg: DemoPackage;
    selectedStack?: Stack;
    selectedBlockLibraries?: string[];
    isSelected: boolean;
    isDimmed: boolean;
    onCardClick: () => void;
}

/**
 * PackageCard - displays package info, expands to show selected architecture
 */
const PackageCard: React.FC<PackageCardProps> = ({
    pkg,
    selectedStack,
    selectedBlockLibraries = [],
    isSelected,
    isDimmed,
    onCardClick,
}) => {
    const isComingSoon = pkg.status === 'coming-soon';

    const handleCardClick = useCallback(() => {
        if (!isComingSoon) {
            onCardClick();
        }
    }, [onCardClick, isComingSoon]);

    const handleCardKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!isComingSoon && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onCardClick();
            }
        },
        [onCardClick, isComingSoon],
    );

    // Card is "complete" when package is selected AND has a stack
    const isComplete = isSelected && selectedStack;

    const cardClasses = cn(
        'expandable-brand-card',
        isSelected && 'selected',      // Blue border when package selected
        isComplete && 'expanded',       // Expanded when stack also selected
        isComplete && 'complete',
        isDimmed && 'dimmed',
        isComingSoon && 'coming-soon',
    );

    return (
        <div
            role="button"
            tabIndex={isComingSoon ? -1 : 0}
            data-testid="package-card"
            data-selected={isSelected ? 'true' : 'false'}
            data-dimmed={isDimmed ? 'true' : 'false'}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
            className={cardClasses}
            aria-pressed={isComingSoon ? undefined : isSelected}
            aria-disabled={isComingSoon || undefined}
            aria-label={`${pkg.name}: ${pkg.description}`}
        >
            {isComingSoon && (
                <span className="architecture-badge">Coming Soon</span>
            )}
            {/* Package header - always visible */}
            <div className="brand-card-header">
                <div className="brand-card-title-row">
                    <Text UNSAFE_className="brand-card-name">
                        {pkg.name}
                    </Text>
                    {isComplete && (
                        <CheckmarkCircle size="S" UNSAFE_className="brand-card-check" />
                    )}
                </div>
                <Text UNSAFE_className="brand-card-description">
                    {pkg.description}
                </Text>
            </div>

            {/* Selected architecture - shown when complete */}
            {isComplete && (
                <div className="brand-card-selection">
                    <Text UNSAFE_className="brand-card-selection-label">
                        Architecture
                    </Text>
                    <Text UNSAFE_className="brand-card-selection-value">
                        {selectedStack.name}
                    </Text>
                    <div className={cn(
                        'brand-card-libraries-wrapper',
                        selectedBlockLibraries.length > 0 && 'has-libraries',
                    )}>
                        <div className="brand-card-libraries-inner">
                            <Text UNSAFE_className="brand-card-selection-label">
                                Block Libraries
                            </Text>
                            {selectedBlockLibraries.map(id => (
                                <Text key={id} UNSAFE_className="brand-card-selection-value">
                                    {getBlockLibraryName(id)}
                                </Text>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * ArchitectureModal - modal for selecting architecture/stack and optional addons
 */
type ModalStep = 'architecture' | 'block-libraries';

interface ArchitectureModalProps {
    pkg: DemoPackage;
    stacks: Stack[];
    selectedStackId?: string;
    selectedAddons?: string[];
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    onStackSelect: (stackId: string) => void;
    onAddonsChange: (addons: string[]) => void;
    onBlockLibrariesChange: (libraries: string[]) => void;
    onCustomBlockLibrariesChange: (libs: CustomBlockLibrary[]) => void;
    onDone: () => void;
    onClose: () => void;
}

const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
    pkg,
    stacks,
    selectedStackId,
    selectedAddons = [],
    selectedBlockLibraries = [],
    customBlockLibraries = [],
    onStackSelect,
    onAddonsChange,
    onBlockLibrariesChange,
    onCustomBlockLibrariesChange,
    onDone,
    onClose,
}) => {
    const [modalStep, setModalStep] = useState<ModalStep>('architecture');

    // Custom block library input state
    const [customUrl, setCustomUrl] = useState('');
    const [customName, setCustomName] = useState('');
    const [customUrlError, setCustomUrlError] = useState('');

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

    // Custom block library URL change handler
    const handleCustomUrlChange = useCallback((value: string) => {
        setCustomUrl(value);
        setCustomUrlError('');
        const source = parseCustomBlockLibraryUrl(value);
        if (value && !source) {
            setCustomUrlError('Enter a valid GitHub URL');
        } else if (source && !customName) {
            setCustomName(deriveBlockLibraryName(source.repo));
        }
    }, [customName]);

    // Custom block library add handler
    const handleAddCustomLibrary = useCallback(() => {
        const source = parseCustomBlockLibraryUrl(customUrl);
        if (!source || !customName.trim()) return;
        if (isDuplicateCustomLibrary(source, customBlockLibraries)) {
            setCustomUrlError('This repository is already added');
            return;
        }
        onCustomBlockLibrariesChange([
            ...customBlockLibraries,
            { name: customName.trim(), source },
        ]);
        setCustomUrl('');
        setCustomName('');
        setCustomUrlError('');
    }, [customUrl, customName, customBlockLibraries, onCustomBlockLibrariesChange]);

    // Custom block library remove handler
    const handleRemoveCustomLibrary = useCallback((index: number) => {
        const updated = customBlockLibraries.filter((_, i) => i !== index);
        onCustomBlockLibrariesChange(updated);
    }, [customBlockLibraries, onCustomBlockLibrariesChange]);

    // Whether Add button should be disabled
    const isAddDisabled = !customUrl || !customName.trim() || !!customUrlError || !parseCustomBlockLibraryUrl(customUrl);

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
        }, 200); // matches CSS transition duration
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
                    </>
                )}

                {modalStep === 'block-libraries' && (
                    <>
                        <Text UNSAFE_className="description-block">
                            Which block libraries should be included?
                        </Text>
                        <Text UNSAFE_className="description-block-sm" UNSAFE_style={{ marginBottom: 'var(--spectrum-global-dimension-size-200)' }}>
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

                        {/* Custom block library section */}
                        <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                        <Text UNSAFE_className="description-block-sm">
                            Add Custom Block Library
                        </Text>
                        <div className="custom-library-inputs">
                            <TextField
                                label="Repository URL"
                                placeholder="https://github.com/owner/repo"
                                value={customUrl}
                                onChange={handleCustomUrlChange}
                                validationState={customUrlError ? 'invalid' : undefined}
                                errorMessage={customUrlError}
                                width="100%"
                            />
                            <TextField
                                label="Library Name"
                                placeholder="Library Name"
                                value={customName}
                                onChange={(value: string) => setCustomName(value)}
                                width="100%"
                            />
                            <Button
                                variant="secondary"
                                onPress={handleAddCustomLibrary}
                                isDisabled={isAddDisabled}
                            >
                                Add
                            </Button>
                        </div>

                        {/* List of added custom libraries */}
                        {customBlockLibraries.length > 0 && (
                            <div className="custom-library-list">
                                {customBlockLibraries.map((lib, index) => (
                                    <div key={`${lib.source.owner}/${lib.source.repo}`} className="custom-library-item">
                                        <div className="custom-library-info">
                                            <Text UNSAFE_className="addon-name">{lib.name}</Text>
                                            <Text UNSAFE_className="addon-description">
                                                {lib.source.owner}/{lib.source.repo}
                                            </Text>
                                        </div>
                                        <Button
                                            variant="negative"
                                            isQuiet
                                            onPress={() => handleRemoveCustomLibrary(index)}
                                            data-testid={`remove-custom-library-${index}`}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export const BrandGallery: React.FC<BrandGalleryProps> = ({
    packages,
    stacks,
    selectedPackage,
    selectedStack,
    selectedAddons = [],
    onPackageSelect,
    onStackSelect,
    onAddonsChange,
    selectedBlockLibraries = [],
    onBlockLibrariesChange,
    blockLibraryDefaults,
    customBlockLibraries = [],
    onCustomBlockLibrariesChange,
    customBlockLibraryDefaults,
    headerContent,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalPackageId, setModalPackageId] = useState<string | null>(null);
    // Track modal-local addon state (synced to parent on Done)
    const [modalAddons, setModalAddons] = useState<string[]>(selectedAddons);
    // Track modal-local block library state (synced to parent on Done)
    const [modalBlockLibraries, setModalBlockLibraries] = useState<string[]>(selectedBlockLibraries);
    // Track modal-local custom block library state (synced to parent on Done)
    const [modalCustomBlockLibraries, setModalCustomBlockLibraries] = useState<CustomBlockLibrary[]>(customBlockLibraries);

    const filteredPackages = useMemo(
        () => sortPackages(filterPackagesBySearchQuery(packages, searchQuery)),
        [packages, searchQuery],
    );

    // Get the package object for the modal
    const modalPackage = useMemo(() => {
        if (!modalPackageId) return null;
        return packages.find(p => p.id === modalPackageId) || null;
    }, [packages, modalPackageId]);

    // Get the selected stack object
    const selectedStackObj = useMemo(() => {
        if (!selectedStack) return undefined;
        return stacks.find(s => s.id === selectedStack);
    }, [stacks, selectedStack]);

    // Helper to get required addon IDs from package's addons config
    const getRequiredAddons = useCallback((pkg: DemoPackage): string[] => {
        if (!pkg.addons) return [];
        return Object.entries(pkg.addons)
            .filter(([_, config]) => config === 'required')
            .map(([id]) => id);
    }, []);

    const handleCardClick = useCallback((pkg: DemoPackage) => {
        // Always open modal when clicking a card (allows changing selection)
        onPackageSelect(pkg.id);
        // Initialize modal addons with current state + package's required addons
        const requiredAddons = getRequiredAddons(pkg);
        const initialAddons = [...new Set([...selectedAddons, ...requiredAddons])];
        setModalAddons(initialAddons);
        // Initialize modal block libraries from parent state
        setModalBlockLibraries(selectedBlockLibraries);
        // Initialize modal custom block libraries from parent state, falling back to defaults
        const initialCustomLibs = customBlockLibraries.length > 0
            ? customBlockLibraries
            : (customBlockLibraryDefaults ?? []);
        setModalCustomBlockLibraries(initialCustomLibs);
        setModalPackageId(pkg.id);
    }, [onPackageSelect, selectedAddons, selectedBlockLibraries, customBlockLibraries, customBlockLibraryDefaults, getRequiredAddons]);

    const handleStackSelect = useCallback((stackId: string) => {
        onStackSelect(stackId);
        // When stack changes, set addons to: required (from package) + default (from stack)
        setModalAddons(() => {
            const currentPackage = packages.find(p => p.id === modalPackageId);
            const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
            const stackObj = stacks.find(s => s.id === stackId);
            const defaultAddons = (stackObj?.optionalAddons || [])
                .filter(addon => addon.default)
                .map(addon => addon.id);
            return [...new Set([...requiredAddons, ...defaultAddons])];
        });
        // When stack changes, compute default block libraries for EDS stacks
        const stackObj = stacks.find(s => s.id === stackId);
        if (stackObj?.frontend === 'eds-storefront' && modalPackageId) {
            const defaults = getDefaultBlockLibraryIds(stackObj, modalPackageId, blockLibraryDefaults);
            const nativeIds = getNativeBlockLibraries(stackObj, modalPackageId).map(l => l.id);
            const allLibraries = [...new Set([...nativeIds, ...defaults])];
            setModalBlockLibraries(allLibraries);
            onBlockLibrariesChange?.(allLibraries);
            // Custom block libraries persist for EDS stacks (user-provided, not stack-dependent)
        } else {
            setModalBlockLibraries([]);
            onBlockLibrariesChange?.([]);
            // Clear custom block libraries for non-EDS stacks
            setModalCustomBlockLibraries([]);
            onCustomBlockLibrariesChange?.([]);
        }
    }, [onStackSelect, packages, stacks, modalPackageId, getRequiredAddons, onBlockLibrariesChange, blockLibraryDefaults, onCustomBlockLibrariesChange]);

    const handleModalAddonsChange = useCallback((addons: string[]) => {
        setModalAddons(addons);
    }, []);

    const handleModalBlockLibrariesChange = useCallback((libraries: string[]) => {
        setModalBlockLibraries(libraries);
        onBlockLibrariesChange?.(libraries);
    }, [onBlockLibrariesChange]);

    const handleModalCustomBlockLibrariesChange = useCallback((libs: CustomBlockLibrary[]) => {
        setModalCustomBlockLibraries(libs);
        onCustomBlockLibrariesChange?.(libs);
    }, [onCustomBlockLibrariesChange]);

    const handleModalDone = useCallback(() => {
        // Sync addons to parent state (including required addons) and close modal
        const currentPackage = packages.find(p => p.id === modalPackageId);
        const requiredAddons = currentPackage ? getRequiredAddons(currentPackage) : [];
        const finalAddons = [...new Set([...modalAddons, ...requiredAddons])];
        onAddonsChange?.(finalAddons);
        // Sync block libraries to parent state (including native libraries)
        const stackObj = stacks.find(s => s.id === selectedStack);
        const nativeIds = stackObj && currentPackage
            ? getNativeBlockLibraries(stackObj, currentPackage.id).map(l => l.id)
            : [];
        const finalBlockLibraries = [...new Set([...nativeIds, ...modalBlockLibraries])];
        onBlockLibrariesChange?.(finalBlockLibraries);
        // Sync custom block libraries to parent state
        onCustomBlockLibrariesChange?.(modalCustomBlockLibraries);
        // Offer to save block library defaults (one-time tip handled by extension host)
        if (modalBlockLibraries.length > 0) {
            vscode.postMessage('offer-save-block-library-defaults', {
                selectedLibraries: modalBlockLibraries,
            });
        }
        setModalPackageId(null);
    }, [modalAddons, modalBlockLibraries, modalCustomBlockLibraries, onAddonsChange, onBlockLibrariesChange, onCustomBlockLibrariesChange, packages, stacks, selectedStack, modalPackageId, getRequiredAddons]);

    const handleModalClose = useCallback(() => {
        setModalPackageId(null);
    }, []);

    if (packages.length === 0) {
        return (
            <SingleColumnLayout>
                <Text UNSAFE_className="text-gray-600">
                    No packages available
                </Text>
            </SingleColumnLayout>
        );
    }

    return (
        <SingleColumnLayout>
            {/* Optional header content (e.g., project name field) */}
            {headerContent}

            <SearchHeader
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchPlaceholder="Filter packages..."
                searchThreshold={2}
                totalCount={packages.length}
                filteredCount={filteredPackages.length}
                itemNoun="package"
                hasLoadedOnce={true}
            />

            <div className="expandable-brand-grid">
                {filteredPackages.map(pkg => {
                    const isSelected = selectedPackage === pkg.id;
                    const isDimmed = selectedPackage !== undefined && !isSelected;
                    return (
                        <PackageCard
                            key={pkg.id}
                            pkg={pkg}
                            selectedStack={isSelected ? selectedStackObj : undefined}
                            selectedBlockLibraries={isSelected ? selectedBlockLibraries : undefined}
                            isSelected={isSelected}
                            isDimmed={isDimmed}
                            onCardClick={() => handleCardClick(pkg)}
                        />
                    );
                })}
            </div>

            {searchQuery && filteredPackages.length === 0 && (
                <Text UNSAFE_className="empty-state-text">
                    No packages match "{searchQuery}"
                </Text>
            )}

            {/* Architecture selection modal */}
            <DialogContainer onDismiss={handleModalClose}>
                {modalPackage && (
                    <ArchitectureModal
                        pkg={modalPackage}
                        stacks={stacks}
                        selectedStackId={selectedPackage === modalPackage.id ? selectedStack : undefined}
                        selectedAddons={modalAddons}
                        selectedBlockLibraries={modalBlockLibraries}
                        customBlockLibraries={modalCustomBlockLibraries}
                        onStackSelect={handleStackSelect}
                        onAddonsChange={handleModalAddonsChange}
                        onBlockLibrariesChange={handleModalBlockLibrariesChange}
                        onCustomBlockLibrariesChange={handleModalCustomBlockLibrariesChange}
                        onDone={handleModalDone}
                        onClose={handleModalClose}
                    />
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
};
