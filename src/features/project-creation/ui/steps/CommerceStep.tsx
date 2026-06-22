/**
 * CommerceStep Component (R1b — tile + focused modal)
 *
 * Commerce is a single "Backend" {@link ConfigTile}: its status comes from
 * {@link isCommerceConfigured}, and pressing it opens a focused {@link Modal}
 * whose body is the EXISTING Commerce content — {@link ArchitectureStepContent}
 * (backend/stack + addons) ABOVE {@link ConnectStoreStepContent} (connect + store
 * discovery). Both content components are reused as-is; only their host changed
 * from an inline column to the modal.
 *
 * Selections persist via {@link useProjectBuilder} — the mesh dual-flow invariant
 * lives in that hook (selecting a stack resets selectedOptionalDependencies via
 * resolveMeshOptionalDeps; toggling a mesh App Builder component mirror-writes
 * them). The connect form's validity verdict persists to wizard state
 * (`commerceConnectValid`) so it survives the modal closing and back/forward
 * navigation. The Continue gate derives solely from {@link isCommerceConfigured}.
 *
 * Block-library + App Builder component selection do NOT belong here — they live
 * in Storefront (Step 4) / Integrations (R2). Commerce = stack/backend + addons
 * + connect/discovery only.
 *
 * @module features/project-creation/ui/steps/CommerceStep
 */

import { DialogContainer } from '@adobe/react-spectrum';
import StorefrontIcon from '@spectrum-icons/workflow/ShoppingCart';
import React, { useMemo, useState, useCallback } from 'react';
import stacksConfig from '../../config/stacks.json';
import { ArchitectureStepContent } from '../components/ArchitectureStepContent';
import { filterAddonsByPackage } from '../components/brandGalleryHelpers';
import { ConfigTile } from '../components/ConfigTile';
import { ConnectStoreStepContent } from '../components/ConnectStoreStepContent';
import { isCommerceConfigured } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useArrowKeyNavigation } from '@/core/ui/hooks/useArrowKeyNavigation';
import { useCanProceedAll } from '@/core/ui/hooks/useCanProceed';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack, StacksConfig, OptionalAddon } from '@/types/stacks';
import type { ComponentConfigs } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** Addon display metadata from stacks.json (id → {name, description}). */
const ADDON_METADATA = (stacksConfig as StacksConfig).addonDefinitions ?? {};

/** Stable empty defaults for list props (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_ADDON_ARRAY: OptionalAddon[] = [];
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];
const EMPTY_CONFIGS: ComponentConfigs = {};

export interface CommerceStepProps extends BaseStepProps {
    /** Available demo packages (catalog data). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data). */
    stacks?: Stack[];
    /**
     * Notifies the wizard when the stack CHANGES so it can reset the
     * org-dependent downstream steps (mirrors the deleted hub's wiring).
     */
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
}

/**
 * The Commerce step: a Backend tile that opens a focused configuration modal.
 *
 * @param props - Wizard step props plus catalog data (packages + stacks)
 * @returns The Backend tile and its focused modal
 */
export function CommerceStep({
    state,
    updateState,
    setCanProceed,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
    onArchitectureChange,
}: CommerceStepProps) {
    // Whether the focused Backend modal is open.
    const [open, setOpen] = useState(false);

    const handlers = useProjectBuilder(state, updateState, {
        packages,
        stacks,
        onArchitectureChange,
    });

    // Resolve the selected package + stack from catalog data.
    const pkg = useMemo(
        () => packages.find(p => p.id === state.selectedPackage),
        [packages, state.selectedPackage],
    );
    const selectedStack = useMemo(
        () => stacks.find(s => s.id === state.selectedStack) ?? null,
        [stacks, state.selectedStack],
    );

    // Stacks available for the selected package (storefront keys restrict them).
    const filteredStacks = useMemo(() => {
        const availableStackIds = Object.keys(pkg?.storefronts ?? {});
        if (availableStackIds.length === 0) return stacks;
        return stacks.filter(stack => availableStackIds.includes(stack.id));
    }, [stacks, pkg]);

    const { getItemProps } = useArrowKeyNavigation({
        itemCount: filteredStacks.length,
        onSelect: (index) => handlers.onStackSelect(filteredStacks[index].id),
        wrap: true,
        autoFocusFirst: true,
        orientation: 'both',
    });

    // Available addons: stack defines possibilities, package restricts by brand.
    const availableAddons = useMemo(() => {
        if (!pkg || !selectedStack) return EMPTY_ADDON_ARRAY;
        const stackAddons = (selectedStack.optionalAddons ?? []).filter(a => ADDON_METADATA[a.id]);
        return filterAddonsByPackage(stackAddons, pkg);
    }, [pkg, selectedStack]);

    const requiredAddonIds = useMemo(() => {
        if (!pkg?.addons) return EMPTY_STRING_ARRAY;
        return Object.entries(pkg.addons)
            .filter(([, config]) => config === 'required')
            .map(([id]) => id);
    }, [pkg]);

    const handleAddonToggle = useCallback(
        (addonId: string, isSelected: boolean) => {
            const current = state.selectedAddons ?? EMPTY_STRING_ARRAY;
            handlers.onAddonsChange(
                isSelected ? [...current, addonId] : current.filter(id => id !== addonId),
            );
        },
        [state.selectedAddons, handlers],
    );

    // Continue gate derives from persisted state (tile status === gate).
    // Primitive boolean only (no fresh arrays/objects) to avoid re-render loops.
    useCanProceedAll([isCommerceConfigured(state)], setCanProceed);

    // One-line tile summary: the selected stack's display name, or undefined.
    const tileSummary = selectedStack?.name;

    const handleClose = useCallback(() => setOpen(false), []);

    return (
        <SingleColumnLayout>
            <ConfigTile
                label="Backend"
                summary={tileSummary}
                status={isCommerceConfigured(state) ? 'configured' : 'needs-setup'}
                icon={<StorefrontIcon size="S" />}
                onPress={() => setOpen(true)}
                testId="backend-tile"
            />
            <DialogContainer onDismiss={handleClose}>
                {open && (
                    <Modal
                        title="Backend"
                        size="L"
                        onClose={handleClose}
                    >
                        <ArchitectureStepContent
                            stackSelection={{
                                filteredStacks,
                                selectedStackId: state.selectedStack,
                                getItemProps,
                                onStackClick: handlers.onStackSelect,
                            }}
                            addonSelection={{
                                availableAddons,
                                displayAddons: availableAddons,
                                selectedAddons: state.selectedAddons ?? EMPTY_STRING_ARRAY,
                                onAddonToggle: handleAddonToggle,
                                addonMetadata: ADDON_METADATA,
                                requiredAddonIds,
                            }}
                        />
                        <ConnectStoreStepContent
                            selectedStackId={state.selectedStack ?? ''}
                            componentConfigs={state.componentConfigs ?? EMPTY_CONFIGS}
                            packageConfigDefaults={state.packageConfigDefaults}
                            adobeOrg={state.adobeOrg}
                            onComponentConfigsChange={(configs) =>
                                updateState({ componentConfigs: configs })
                            }
                            onValidationChange={(valid) =>
                                updateState({ commerceConnectValid: valid })
                            }
                            storeDiscoveryData={state.storeDiscoveryData}
                            onStoreDiscoveryDataChange={(data) =>
                                updateState({ storeDiscoveryData: data ?? undefined })
                            }
                        />
                    </Modal>
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
}
