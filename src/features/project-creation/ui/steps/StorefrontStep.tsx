/**
 * StorefrontStep Component (R1b — two tiles + focused modals)
 *
 * The Storefront group step rendered as two {@link ConfigTile}s over focused
 * modals (replacing the R1 inline column):
 *   1. Storefront tile — status from {@link isStorefrontConfigured}. Its modal
 *      hosts the GitHub + DA.live service cards + {@link RepoSelectionInline}.
 *   2. Block Libraries tile — optional/informational (always "configured", never
 *      gates Continue). Its modal hosts {@link BlockLibrariesStepContent} (EDS
 *      stacks only). The summary shows the selected-library count.
 *
 * The Continue gate uses {@link isStorefrontConfigured} (github + dalive
 * authenticated in edsConfig AND storefrontRepoValid true) — block-library
 * selection does NOT affect it. RepoSelectionInline.onValidityChange persists
 * `storefrontRepoValid` via updateState so the repo verdict survives the modal
 * close and back/forward navigation.
 *
 * The service-card composition and block-library handlers/derivation are carried
 * over unchanged (real {@link useProjectBuilder} hook, EDS-only block libraries),
 * just moved into the two modal bodies.
 *
 * Re-render-loop guard (MEMORY): only a primitive boolean enters the
 * useCanProceedAll conditions array; module-level EMPTY constants back the
 * empty-array props handed to child hooks/components.
 *
 * @module features/project-creation/ui/steps/StorefrontStep
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useState, useMemo, useCallback } from 'react';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
} from '../../services/blockLibraryLoader';
import { BlockLibrariesStepContent } from '../components/BlockLibrariesStepContent';
import { ConfigTile } from '../components/ConfigTile';
import { isStorefrontConfigured } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useCanProceedAll } from '@/core/ui/hooks/useCanProceed';
import { vscode } from '@/core/ui/utils/vscode-api';
import { GitHubServiceCard, DaLiveServiceCard } from '@/features/eds/ui/components';
import { getBookmarkletSetupPageUrl } from '@/features/eds/ui/helpers/bookmarkletSetupPage';
import { useDaLiveAuth } from '@/features/eds/ui/hooks/useDaLiveAuth';
import { useGitHubAuth } from '@/features/eds/ui/hooks/useGitHubAuth';
import { RepoSelectionInline } from '@/features/eds/ui/steps/RepoSelectionInline';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { BaseStepProps } from '@/types/wizard';
import '../../../eds/ui/styles/connect-services.css';

/** The EDS frontend id that gates the block-libraries section. */
const EDS_FRONTEND_ID = 'eds-storefront';

/** Stable empty arrays for hook/list props (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_LIBRARY_ARRAY: BlockLibrary[] = [];
const EMPTY_CUSTOM_LIBRARY_ARRAY: CustomBlockLibrary[] = [];
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

export interface StorefrontStepProps extends BaseStepProps {
    /** Available demo packages (catalog data). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data). */
    stacks?: Stack[];
    /** Block-library default IDs from VS Code settings (seeds EDS selections). */
    blockLibraryDefaults?: string[];
    /** Custom block-library defaults from VS Code settings. */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
}

/**
 * The Storefront group step (two tiles + focused modals).
 *
 * @param props - Wizard step props plus catalog data + block-library defaults
 * @returns The two-tile layout with the storefront + block-libraries modals
 */
export function StorefrontStep({
    state,
    updateState,
    setCanProceed,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
    blockLibraryDefaults = EMPTY_STRING_ARRAY,
    customBlockLibraryDefaults = EMPTY_CUSTOM_LIBRARY_ARRAY,
}: StorefrontStepProps): React.ReactElement {
    const [openStorefront, setOpenStorefront] = useState(false);
    const [openBlockLibs, setOpenBlockLibs] = useState(false);
    const [showDaLiveInput, setShowDaLiveInput] = useState(false);

    const gitHubAuth = useGitHubAuth({ state, updateState });
    const daLiveAuth = useDaLiveAuth({ state, updateState });

    const handlers = useProjectBuilder(state, updateState, {
        packages,
        stacks,
        blockLibraryDefaults,
        customBlockLibraryDefaults,
    });

    // Continue gate: derived from PERSISTED state so it stays correct with the
    // modal closed + across navigation. Block libraries are optional (no gate).
    // Primitive boolean only (no fresh arrays/objects) to avoid re-render loops.
    useCanProceedAll([isStorefrontConfigured(state)], setCanProceed);

    // --- DA.live card handlers (carried over from the inline form) -----------
    const handleDaLiveSetup = () => {
        if (!daLiveAuth.setupComplete && daLiveAuth.bookmarkletUrl) {
            vscode.postMessage('openExternal', {
                url: getBookmarkletSetupPageUrl(daLiveAuth.bookmarkletUrl),
            });
        } else {
            daLiveAuth.openDaLive();
        }
        setShowDaLiveInput(true);
    };

    const handleDaLiveSubmit = (org: string, token: string) => {
        daLiveAuth.storeTokenWithOrg(token, org);
        setShowDaLiveInput(false);
    };

    const handleDaLiveReset = () => {
        daLiveAuth.resetAuth();
        setShowDaLiveInput(true);
    };

    const handleCancelInput = () => {
        setShowDaLiveInput(false);
        daLiveAuth.cancelAuth();
    };

    const handleOpenBookmarkletSetup = () => {
        if (daLiveAuth.bookmarkletUrl) {
            vscode.postMessage('openExternal', {
                url: getBookmarkletSetupPageUrl(daLiveAuth.bookmarkletUrl),
            });
        }
    };

    // --- Block-library derivation (EDS-only; carried over unchanged) ---------
    const pkg = useMemo(
        () => packages.find(p => p.id === state.selectedPackage),
        [packages, state.selectedPackage],
    );
    const selectedStack = useMemo(
        () => stacks.find(s => s.id === state.selectedStack) ?? null,
        [stacks, state.selectedStack],
    );
    const isEdsStack = selectedStack?.frontend === EDS_FRONTEND_ID;

    const availableBlockLibraries = useMemo(() => {
        if (!pkg || !selectedStack || !isEdsStack) return EMPTY_LIBRARY_ARRAY;
        return getAvailableBlockLibraries(selectedStack, pkg.id);
    }, [pkg, selectedStack, isEdsStack]);
    const nativeBlockLibraries = useMemo(() => {
        if (!pkg || !selectedStack || !isEdsStack) return EMPTY_LIBRARY_ARRAY;
        return getNativeBlockLibraries(selectedStack, pkg.id);
    }, [pkg, selectedStack, isEdsStack]);

    const handleBlockLibraryToggle = useCallback(
        (libraryId: string, isSelected: boolean) => {
            const current = state.selectedBlockLibraries ?? EMPTY_STRING_ARRAY;
            handlers.onBlockLibrariesChange(
                isSelected ? [...current, libraryId] : current.filter(id => id !== libraryId),
            );
        },
        [state.selectedBlockLibraries, handlers],
    );

    const handleCustomLibraryToggle = useCallback(
        (lib: CustomBlockLibrary, isSelected: boolean) => {
            const current = state.customBlockLibraries ?? EMPTY_CUSTOM_LIBRARY_ARRAY;
            handlers.onCustomBlockLibrariesChange(
                isSelected
                    ? [...current, lib]
                    : current.filter(
                        c => !(c.source.owner === lib.source.owner && c.source.repo === lib.source.repo),
                    ),
            );
        },
        [state.customBlockLibraries, handlers],
    );

    const handleOpenCustomSettings = useCallback(() => {
        vscode.postMessage('open-block-library-settings');
    }, []);

    // --- Tile summaries ------------------------------------------------------
    const storefrontConfigured = isStorefrontConfigured(state);
    const storefrontSummary = storefrontConfigured
        ? (state.edsConfig?.repoName || undefined)
        : undefined;

    const blockLibCount =
        (state.selectedBlockLibraries?.length ?? 0) +
        (state.customBlockLibraries?.length ?? 0);
    const blockLibSummary = blockLibCount > 0 ? `${blockLibCount} selected` : 'None selected';

    const closeStorefront = useCallback(() => setOpenStorefront(false), []);
    const closeBlockLibs = useCallback(() => setOpenBlockLibs(false), []);

    return (
        <div className="build-area-pad">
            <ConfigTile
                label="Storefront"
                status={storefrontConfigured ? 'configured' : 'needs-setup'}
                summary={storefrontSummary}
                onPress={() => setOpenStorefront(true)}
                testId="storefront-tile"
            />
            <ConfigTile
                label="Block Libraries"
                status="configured"
                summary={blockLibSummary}
                onPress={() => setOpenBlockLibs(true)}
                testId="block-libraries-tile"
            />

            <DialogContainer onDismiss={closeStorefront}>
                {openStorefront && (
                    <Modal
                        title="Storefront"
                        size="L"
                        onClose={closeStorefront}
                    >
                        <div className="services-cards-grid">
                            <GitHubServiceCard
                                isChecking={gitHubAuth.isChecking}
                                isAuthenticating={gitHubAuth.isAuthenticating}
                                isAuthenticated={gitHubAuth.isAuthenticated}
                                user={gitHubAuth.user}
                                error={gitHubAuth.error}
                                onConnect={gitHubAuth.startOAuth}
                                onChangeAccount={gitHubAuth.changeAccount}
                            />
                            <DaLiveServiceCard
                                isChecking={daLiveAuth.isChecking}
                                isAuthenticating={daLiveAuth.isAuthenticating && !showDaLiveInput}
                                isAuthenticated={daLiveAuth.isAuthenticated}
                                verifiedOrg={daLiveAuth.verifiedOrg}
                                error={daLiveAuth.error}
                                showInput={showDaLiveInput}
                                setupComplete={daLiveAuth.setupComplete}
                                defaultOrg={state.edsConfig?.daLiveOrg}
                                onSetup={handleDaLiveSetup}
                                onSubmit={handleDaLiveSubmit}
                                onReset={handleDaLiveReset}
                                onCancelInput={handleCancelInput}
                                onOpenDaLive={daLiveAuth.openDaLive}
                                onOpenBookmarkletSetup={
                                    daLiveAuth.bookmarkletUrl ? handleOpenBookmarkletSetup : undefined
                                }
                            />
                        </div>

                        <RepoSelectionInline
                            state={state}
                            updateState={updateState}
                            onValidityChange={(valid) => updateState({ storefrontRepoValid: valid })}
                        />
                    </Modal>
                )}
            </DialogContainer>

            <DialogContainer onDismiss={closeBlockLibs}>
                {openBlockLibs && (
                    <Modal
                        title="Block Libraries"
                        size="L"
                        onClose={closeBlockLibs}
                    >
                        {isEdsStack ? (
                            <BlockLibrariesStepContent
                                nativeBlockLibraries={nativeBlockLibraries}
                                availableBlockLibraries={availableBlockLibraries}
                                selectedBlockLibraries={state.selectedBlockLibraries ?? EMPTY_STRING_ARRAY}
                                onBlockLibraryToggle={handleBlockLibraryToggle}
                                customBlockLibraryDefaults={customBlockLibraryDefaults}
                                customBlockLibraries={state.customBlockLibraries ?? EMPTY_CUSTOM_LIBRARY_ARRAY}
                                onCustomLibraryToggle={handleCustomLibraryToggle}
                                onOpenCustomSettings={handleOpenCustomSettings}
                            />
                        ) : null}
                    </Modal>
                )}
            </DialogContainer>
        </div>
    );
}
