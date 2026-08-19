/**
 * StorefrontStep Component (v6 — step rail + dedicated view, like Commerce)
 *
 * The Storefront area renders just its BODY — a [rail / view] column (.commerce-body)
 * with a {@link StepRail} strip on top and the active sub-step's dedicated
 * view below (four sub-steps):
 *   1. `accounts`        — connect GitHub + DA.live ({@link GitHubServiceCard} +
 *                          {@link DaLiveServiceCard}; gate: both connected).
 *   2. `repository`      — pick/create the repo ({@link RepoSelectionInline}, repository phase).
 *   3. `code-sync`       — install the AEM Code Sync app ({@link RepoSelectionInline}, code-sync phase).
 *   4. `block-libraries` — the optional EDS block-library picker
 *                          ({@link BlockLibrariesStepContent}); never gates Continue.
 *
 * `repository` and `code-sync` render the SAME {@link RepoSelectionInline} element
 * instance (same JSX position, so React keeps it mounted) — only its `phase` prop
 * changes — so its local repo-creation / app-check state survives the switch.
 *
 * The footer Continue/Back walks these sub-steps (WizardContainer), driven by the
 * shared {@link areaSubSteps} provider; the active one is `state.activeStorefrontStep`.
 * The surrounding two-column [ area body | unified summary ] is owned by
 * {@link BuildYourProjectStep}.
 *
 * Re-render-loop guard (MEMORY): only a primitive boolean enters the
 * useCanProceedAll conditions array; module-level EMPTY constants back the
 * empty-array props handed to child hooks/components.
 *
 * @module features/project-creation/ui/steps/StorefrontStep
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
} from '../../services/blockLibraryLoader';
import { BlockLibrariesStepContent } from '../components/BlockLibrariesStepContent';
import { requireAreaSubSteps } from './areaSubSteps';
import { isStorefrontConfigured } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import { StepAreaShell } from '@/core/ui/components/layout/StepAreaShell';
import { StepRail } from '@/core/ui/components/navigation/StepRail';
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
import type { StorefrontSectionId } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import '../../../eds/ui/styles/connect-services.css';

/** The EDS frontend id that gates the block-libraries sub-step content. */
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
 * The Storefront group step ([nav | view], like Commerce).
 *
 * @param props - Wizard step props plus catalog data + block-library defaults
 * @returns The vertical step list + dedicated-view storefront surface
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
    const [showDaLiveInput, setShowDaLiveInput] = useState(false);

    const gitHubAuth = useGitHubAuth({ state, updateState });
    const daLiveAuth = useDaLiveAuth({ state, updateState });

    const handlers = useProjectBuilder(state, updateState, {
        packages,
        stacks,
        blockLibraryDefaults,
        customBlockLibraryDefaults,
    });

    // Continue gate: derived from PERSISTED state. The Build step owns the REAL
    // per-sub-step gate via the footer/driver; this NO-OP-backed call is harmless.
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

    const handleUseClipboardToken = (org: string) => {
        daLiveAuth.storeTokenFromClipboard(org);
        setShowDaLiveInput(false);
    };

    // Ask once each time the form opens. The bookmarklet usually runs while the
    // form is already up, so this is also re-run when the user returns from the
    // browser via onSetup/openDaLive.
    const { checkClipboard } = daLiveAuth;
    useEffect(() => {
        if (showDaLiveInput) {
            void checkClipboard();
        }
    }, [showDaLiveInput, checkClipboard]);

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

    // --- Sub-step nav + dedicated view (shared driver) -----------------------
    const driver = requireAreaSubSteps('storefront');
    const subSteps = driver.subSteps(state);
    const activeStep = driver.active(state) as StorefrontSectionId;
    // Crossfade key: groups repository + code-sync so the SAME RepoSelectionInline
    // instance stays mounted across those two (its repo-creation / app-check state
    // must survive); accounts + block-libraries each remount → fade.
    const viewKey =
        activeStep === 'repository' || activeStep === 'code-sync' ? 'repo' : activeStep;

    // Accounts sub-step: GitHub + DA.live are independent, parallel sign-ins, so
    // they share ONE sub-step (two cards) rather than two — gate is both connected.
    const accountsCards = (
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
                githubUser={gitHubAuth.user?.login}
                availableOrgs={gitHubAuth.orgs ?? EMPTY_STRING_ARRAY}
                onSetup={handleDaLiveSetup}
                onSubmit={handleDaLiveSubmit}
                onReset={handleDaLiveReset}
                clipboardHasToken={daLiveAuth.clipboardHasToken}
                onUseClipboardToken={handleUseClipboardToken}
                onCancelInput={handleCancelInput}
                onOpenDaLive={daLiveAuth.openDaLive}
                onOpenBookmarkletSetup={
                    daLiveAuth.bookmarkletUrl ? handleOpenBookmarkletSetup : undefined
                }
            />
        </div>
    );

    const blockLibraries = isEdsStack ? (
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
    ) : null;

    return (
        // `viewKey` remounts (crossfades) on sub-step change, but groups repository +
        // code-sync under one key so the trailing RepoSelectionInline arm — which covers
        // BOTH at the SAME JSX position — keeps its element instance (and repo-creation /
        // app-check state) across the phase flip.
        <StepAreaShell
            areaLabel="Storefront"
            viewKey={viewKey}
            rail={
                <StepRail
                    steps={subSteps}
                    activeId={activeStep}
                    onSelect={id => updateState(driver.setActive(id))}
                />
            }
        >
            {activeStep === 'accounts' ? (
                accountsCards
            ) : activeStep === 'block-libraries' ? (
                blockLibraries
            ) : (
                <RepoSelectionInline
                    phase={activeStep}
                    state={state}
                    updateState={updateState}
                    onRepoValidChange={v => updateState({ storefrontRepoValid: v })}
                    onCodeSyncValidChange={v => updateState({ storefrontCodeSyncValid: v })}
                />
            )}
        </StepAreaShell>
    );
}
