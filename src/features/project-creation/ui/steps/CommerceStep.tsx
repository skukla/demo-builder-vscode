/**
 * CommerceStep Component (Project Builder — step rail + dedicated view)
 *
 * The Commerce area renders just its BODY — a [rail / view] column (.commerce-body) with
 * a {@link StepRail} strip on top (Backend · [Sign in] · Connection · Business
 * Structure · Catalog) and, below it, a dedicated view showing the ACTIVE step's
 * body (the single {@link ConnectStoreStepContent} instance for config steps). The
 * surrounding two-column [ area body | unified "Your project" summary ] is owned by
 * {@link BuildYourProjectStep}; this step's summary contribution is computed by
 * `commerceSummaryGroup` (see buildSummary), not here.
 *
 * Backend selection drives the architecture. Choosing a backend resolves it against
 * the brand's allowed stacks ({@link resolveStackForBackend}). A UNIQUE mapping
 * commits the stack via {@link useProjectBuilder.onStackSelect} (preserving the mesh
 * reconciliation + eds/addon/block-library seed — never bypassed). An AMBIGUOUS one
 * (>1 frontend, e.g. citisignal + PaaS) persists `selectedBackend` only and shows
 * "Frontend pending" in the summary; the single ConnectStoreStepContent is still
 * driven from a provisional (eds-preferred) stack id so Connection / Business /
 * Catalog work off the backend until the later Storefront slice resolves the frontend.
 *
 * Completion / lock status comes from {@link commerceSectionStates} (pure); the
 * active sub-step is LIFTED to wizard state (`state.activeCommerceStep`) and PINNED
 * once on entry (a seeding effect sets it to {@link firstOpenSection} when unset),
 * so it stops following completion. Without the pin the derived fallback would
 * re-evaluate every render and signing in (signin current→done) would silently jump
 * the view from Sign in to Connection. After seeding, only the footer Continue/Back
 * (owned by WizardContainer) and the vertical-list click move the active step —
 * selecting a backend, signing in, or choosing a store view never auto-advances. The
 * Continue gate derives from {@link isCommerceConfigured} here, but the step's
 * BuildYourProjectStep parent owns the REAL per-sub-step gate via a NO-OP
 * setCanProceed — harmless.
 *
 * ONE ConnectStoreStepContent instance serves the three config steps, rendered in the
 * dedicated view only when the active step is a config step. Switching the active
 * config step REMOUNTS it, but the parent round-trips storeDiscoveryData /
 * componentConfigs to wizard state, so a remount rehydrates synchronously (no
 * re-fetch) — see the inline note at the `configForm` memo.
 *
 * @module features/project-creation/ui/steps/CommerceStep
 */

import React, { useMemo, useCallback, useEffect } from 'react';
import { ConnectStoreStepContent } from '../components/ConnectStoreStepContent';
import {
    commerceSectionStates,
    resolveStackForBackend,
    provisionalStackForBackend,
    availableBackendsForPackage,
    firstOpenSection,
    SECTION_TITLES,
    type CommerceSectionId,
} from './commerceSections';
import { sectionBody } from './commerceStepBodies';
import { isCommerceConfigured, isAdobeSignedIn } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import { StepAreaShell } from '@/core/ui/components/layout/StepAreaShell';
import { StepRail, type StepTab } from '@/core/ui/components/navigation/StepRail';
import { useCanProceedAll } from '@/core/ui/hooks/useCanProceed';
import {
    ACCS_STORE_VIEW_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/core/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { ComponentConfigs } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** The ACCS backend id; its stacks add a contextual Adobe sign-in gate. */
const ACCS_BACKEND = 'adobe-commerce-accs';

/** Stable empty defaults for list/object props (avoids the re-render gotcha). */
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

/** Whether a store-view code (ACCS or PaaS) is present in the component configs. */
function hasStoreViewCode(configs: ComponentConfigs): boolean {
    const accsView = lookupComponentConfigValue(configs, ACCS_STORE_VIEW_CODE);
    const paasView = lookupComponentConfigValue(configs, PAAS_STORE_VIEW_CODE);
    return Boolean(accsView || paasView);
}

/**
 * The Commerce step: the area BODY only — a vertical step list (left nav) + the
 * active sub-step's dedicated view. The surrounding two-column [ body | unified
 * summary ] is owned by BuildYourProjectStep.
 *
 * @param props - Wizard step props plus catalog data (packages + stacks)
 * @returns The two-column tabs + dedicated-view Commerce surface
 */
export function CommerceStep({
    state,
    updateState,
    setCanProceed,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
    onArchitectureChange,
}: CommerceStepProps) {
    const handlers = useProjectBuilder(state, updateState, {
        packages,
        stacks,
        onArchitectureChange,
    });

    const pkg = useMemo(
        () => packages.find((p) => p.id === state.selectedPackage),
        [packages, state.selectedPackage],
    );

    const isAccs = state.selectedBackend === ACCS_BACKEND;
    const signedIn = isAdobeSignedIn(state);

    const sectionStates = useMemo(
        () => commerceSectionStates(state, { isAccs, signedIn }),
        [state, isAccs, signedIn],
    );

    // The single active step is LIFTED to wizard state so the footer Continue/Back
    // (owned by WizardContainer) can walk the sub-steps linearly. It derives from
    // `state.activeCommerceStep`, falling back to the first openable section.
    const activeStep = state.activeCommerceStep ?? firstOpenSection(sectionStates);
    const setActiveStep = useCallback(
        (id: CommerceSectionId) => updateState({ activeCommerceStep: id }),
        [updateState],
    );

    // Seed the active sub-step ONCE on entry (when unset) so it stops following
    // completion. Without this pin the derived fallback re-evaluates firstOpenSection
    // every render, so signing in (signin current→done) would silently JUMP the view
    // from Sign in to Connection. The `== null` guard fires exactly once; afterwards
    // only the footer Continue/Back and the vertical-list click move the active step.
    useEffect(() => {
        if (state.activeCommerceStep == null) {
            updateState({ activeCommerceStep: firstOpenSection(sectionStates) });
        }
    }, [state.activeCommerceStep, sectionStates, updateState]);

    // Backends the brand offers (drives which cards are enabled).
    const availableBackends = useMemo(
        () => (pkg ? availableBackendsForPackage(stacks, pkg) : []),
        [stacks, pkg],
    );

    // Drive config from the committed stack, else a provisional (eds-preferred) one.
    const configStackId = useMemo(() => {
        if (state.selectedStack) return state.selectedStack;
        if (pkg && state.selectedBackend) {
            return provisionalStackForBackend(stacks, pkg, state.selectedBackend) ?? '';
        }
        return '';
    }, [state.selectedStack, state.selectedBackend, stacks, pkg]);

    const handleBackendSelect = useCallback(
        (backend: string) => {
            if (!pkg) return;
            const resolution = resolveStackForBackend(stacks, pkg, backend);
            // Unique mapping → commit the stack (preserves the mesh reconciliation,
            // which includes clearing the stale config-validity verdicts).
            // Ambiguous → defer the stack; config runs off the provisional id. Since
            // onStackSelect (and its stack-change reset) never fires here, clear the
            // stale committed stack + config verdicts ourselves so a prior unique
            // backend's commit can't keep isCommerceConfigured true / show a committed
            // architecture while the frontend is pending and the sections re-lock.
            if (resolution.stackId) {
                // Changing the backend invalidates the downstream sub-steps — drop
                // their commitments so no stale ✓ (backend/sign-in included) survives.
                updateState({ selectedBackend: backend, committedCommerceSteps: [] });
                handlers.onStackSelect(resolution.stackId);
            } else {
                updateState({
                    selectedBackend: backend,
                    selectedStack: undefined,
                    commerceConnectValid: false,
                    commerceStoreViewChosen: false,
                    committedCommerceSteps: [],
                });
            }
            // Selecting a backend STAYS on Backend — the footer Continue advances to
            // the next sub-step (no auto-advance).
        },
        [pkg, stacks, handlers, updateState],
    );

    // Persist the store-view selection so Catalog unlocks (shared env-var keys).
    const handleComponentConfigsChange = useCallback(
        (configs: ComponentConfigs) => {
            updateState({
                componentConfigs: configs,
                commerceStoreViewChosen: hasStoreViewCode(configs),
            });
        },
        [updateState],
    );

    // Persist the store-discovery fetch state so the Business Structure Continue gate
    // stays blocked while the structure loads.
    const handleStoreLoadingChange = useCallback(
        (loading: boolean) => updateState({ commerceStoreLoading: loading }),
        [updateState],
    );

    // Continue gate derives from persisted state (primitive boolean only). The
    // step's BuildYourProjectStep parent owns the REAL per-sub-step gate via the
    // footer; this NO-OP-backed call is harmless (parent passes a no-op setter).
    useCanProceedAll([isCommerceConfigured(state)], setCanProceed);

    const pkgName = pkg?.name ?? '';

    // The single ConnectStoreStepContent, driven by the ACTIVE config step. It
    // remounts when the active config step changes — that is safe: the parent
    // round-trips storeDiscoveryData / componentConfigs to wizard state, so a remount
    // rehydrates synchronously (useStoreDiscovery seeds from initialStoreData) and
    // useAutoStoreDetect's hasStoreData guard prevents a re-fetch.
    const configForm = useMemo(
        () => (
            <ConnectStoreStepContent
                section={activeStep as 'connection' | 'business-structure' | 'catalog'}
                selectedStackId={configStackId}
                componentConfigs={state.componentConfigs ?? EMPTY_CONFIGS}
                packageConfigDefaults={state.packageConfigDefaults}
                adobeOrg={state.adobeOrg}
                onComponentConfigsChange={handleComponentConfigsChange}
                onValidationChange={(validity) =>
                    updateState({
                        commerceConnectValid: validity.connection,
                        commerceCatalogValid: validity.catalog,
                    })
                }
                storeDiscoveryData={state.storeDiscoveryData}
                onStoreDiscoveryDataChange={(data) =>
                    updateState({ storeDiscoveryData: data ?? undefined })
                }
                onStoreLoadingChange={handleStoreLoadingChange}
            />
        ),
        [
            activeStep,
            configStackId,
            state,
            handleComponentConfigsChange,
            handleStoreLoadingChange,
            updateState,
        ],
    );

    // Step models drive the StepRail (status/lock only — the active highlight is
    // the local activeStep, passed separately).
    const tabModels = useMemo<StepTab[]>(
        () =>
            sectionStates.map((sec) => ({
                id: sec.id,
                title: SECTION_TITLES[sec.id],
                status: sec.status,
                lockReason: sec.lockReason,
            })),
        [sectionStates],
    );

    // Only the ACTIVE step's body is built (no all-steps map). The config form is
    // passed only when the active step is a config step.
    const activeBody = useMemo(
        () =>
            sectionBody(activeStep, {
                availableBackends,
                selectedBackend: state.selectedBackend,
                pkgName,
                onBackendSelect: handleBackendSelect,
                state,
                updateState,
                configForm,
            }),
        [
            activeStep,
            availableBackends,
            state,
            pkgName,
            handleBackendSelect,
            updateState,
            configForm,
        ],
    );

    // CommerceStep returns just its area BODY — the [ left nav | dedicated view ] row.
    // The Build step owns the surrounding two-column [ active area body | unified
    // summary ] (see BuildYourProjectStep), so the summary lives there now, fed by
    // commerceSummaryGroup(state) rather than computed here.
    return (
        // The all-caps area label tells the user which area they configure, now that the
        // area sub-nav left the wizard timeline. `viewKey` remounts the body on every
        // sub-step change so the view crossfades in.
        <StepAreaShell
            areaLabel="Commerce"
            viewKey={activeStep}
            rail={
                <StepRail
                    steps={tabModels}
                    activeId={activeStep}
                    onSelect={(id) => setActiveStep(id as CommerceSectionId)}
                />
            }
        >
            {activeBody}
        </StepAreaShell>
    );
}
