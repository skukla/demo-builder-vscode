/**
 * CommerceStep Component (Project Builder — vertical step list + dedicated view)
 *
 * The Commerce area is a {@link TwoColumnLayout}: LEFT = a [list | view] row
 * (.commerce-body) with a {@link VerticalStepList} on the left (Backend · [Sign in] ·
 * Connection · Business Structure · Catalog) and, to its right, a dedicated view
 * showing the ACTIVE step's body (the single {@link ConnectStoreStepContent} instance
 * for config steps); RIGHT = a persistent {@link CommerceSummary}. Presentation swap —
 * the step model, the Backend→stack bridge, the security guard, and the summary all
 * carry over unchanged).
 *
 * Backend selection drives the architecture. Choosing a backend resolves it against
 * the brand's allowed stacks ({@link resolveStackForBackend}). A UNIQUE mapping
 * commits the stack via {@link useProjectBuilder.onStackSelect} (preserving the mesh
 * dual-flow reset + eds/addon/block-library seed — never bypassed). An AMBIGUOUS one
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
import { CommerceSummary, type SummaryRow } from '../components/CommerceSummary';
import { ConnectStoreStepContent } from '../components/ConnectStoreStepContent';
import { VerticalStepList, type StepTab } from '../components/VerticalStepList';
import {
    commerceSectionStates,
    resolveStackForBackend,
    provisionalStackForBackend,
    availableBackendsForPackage,
    firstOpenSection,
    type CommerceSectionId,
    type CommerceSectionState,
} from './commerceSections';
import {
    SECTION_TITLES,
    ROW_LABELS,
    StepViewHeader,
    sectionBody,
} from './commerceStepBodies';
import { isCommerceConfigured, isAdobeSignedIn } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { useCanProceedAll } from '@/core/ui/hooks/useCanProceed';
import {
    ACCS_STORE_VIEW_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/features/components/config/envVarKeys';
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
 * The Commerce summary rows (Backend, Sign-in?, Connection, Business, Catalog).
 * A row shows ✓ + value only when the step is BOTH done (valid) AND committed —
 * i.e. the user pressed Continue past it. A merely-valid (or auto-detected) step
 * stays "Not set" until committed, so values never appear on their own.
 */
function buildSummaryRows(
    sectionStates: CommerceSectionState[],
    committedSteps: CommerceSectionId[] | undefined,
): SummaryRow[] {
    const committed = new Set(committedSteps ?? []);
    return sectionStates.map(s => {
        const done = s.status === 'done' && committed.has(s.id);
        return {
            label: ROW_LABELS[s.id],
            value: done ? s.value : undefined,
            done,
        };
    });
}

/**
 * The Commerce step: a restyled step-tab strip + dedicated view + persistent summary
 * (v7 surface).
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
        () => packages.find(p => p.id === state.selectedPackage),
        [packages, state.selectedPackage],
    );
    const selectedStack = useMemo(
        () => stacks.find(s => s.id === state.selectedStack) ?? null,
        [stacks, state.selectedStack],
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
            // Unique mapping → commit the stack (preserves mesh dual-flow reset, which
            // includes clearing the stale config-validity verdicts).
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
                onValidationChange={valid => updateState({ commerceConnectValid: valid })}
                storeDiscoveryData={state.storeDiscoveryData}
                onStoreDiscoveryDataChange={data =>
                    updateState({ storeDiscoveryData: data ?? undefined })
                }
            />
        ),
        [activeStep, configStackId, state, handleComponentConfigsChange, updateState],
    );

    // Step models drive the VerticalStepList (status/lock only — the active highlight is
    // the local activeStep, passed separately).
    const tabModels = useMemo<StepTab[]>(
        () =>
            sectionStates.map(sec => ({
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

    const architectureLabel = useMemo(() => {
        if (selectedStack) return selectedStack.name;
        if (state.selectedBackend) return 'Frontend pending';
        return null;
    }, [selectedStack, state.selectedBackend]);

    const summaryRows = useMemo(
        () => buildSummaryRows(sectionStates, state.committedCommerceSteps),
        [sectionStates, state.committedCommerceSteps],
    );

    return (
        <TwoColumnLayout
            // Left-aligned, full-width (NOT centered): the block hugs the content
            // area's left edge (no centered gutter) and the right summary column
            // GROWS to fill all remaining width so its gray panel reaches the screen's
            // right edge. The summary CONTENT is capped (.commerce-summary-content) so
            // label↔value stay tight inside that wide panel. The LEFT (nav + step-view)
            // is capped instead — keeping a roomy, bounded ~760px center after the
            // ~200px nav — so the center never stretches sparse.
            maxWidth="none"
            // The left-zone cap (nav + step-view) is applied via CSS from the shared
            // --commerce-zone-max var (`.commerce-two-col .two-column-layout-left`), NOT
            // this prop — so the footer mirrors it from one source of truth. The default
            // leftMaxWidth's inline style is overridden by that !important rule.
            // Scopes the responsive "hide the summary once it stacks" rule (≤1180px)
            // to this layout only — other TwoColumnLayout consumers keep their summary.
            className="commerce-two-col"
            // Drop the left column padding so the left nav can bleed to the content
            // area's left edge as a full-height panel (gray-75 + right border),
            // mirroring the summary sidebar. The nav and step-view supply their own
            // padding (see .step-nav / .step-view).
            leftPadding="0px"
            leftContent={
                <div className="commerce-body">
                    {/* Left nav: a small all-caps area label tells the user which
                        area they configure now that the area sub-nav left the wizard
                        timeline, above the vertical step list. */}
                    <div className="step-nav">
                        <div className="step-nav-area">Commerce</div>
                        <VerticalStepList
                            steps={tabModels}
                            activeId={activeStep}
                            onSelect={id => setActiveStep(id as CommerceSectionId)}
                        />
                    </div>
                    <div className="step-view">
                        <StepViewHeader step={activeStep} />
                        {activeBody}
                    </div>
                </div>
            }
            rightContent={
                <div className="commerce-summary-content">
                    <CommerceSummary architectureLabel={architectureLabel} rows={summaryRows} />
                </div>
            }
        />
    );
}
