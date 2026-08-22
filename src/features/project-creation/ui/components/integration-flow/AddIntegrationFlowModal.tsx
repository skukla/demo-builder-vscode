/**
 * AddIntegrationFlowModal — the one-modal Add Integration journey shell:
 * a {@link DialogContainer}-hosted core {@link Modal} whose body is a stage
 * switch over {@link useIntegrationFlow} and whose Back/Continue footer is
 * driven entirely by the hook's gates and labels — NO business logic here.
 *
 * The journey mounts ONLY while open (`{isOpen && …}` — mandatory: the Spectrum
 * test mock renders dialogs eagerly). That conditional mount is also the
 * reset-on-open seam: reopening mounts a fresh hook at the first stage. Cancel
 * discards the draft; a destination committed mid-flow survives by design.
 *
 * The api-access stage is the INTERACTIVE picker ({@link ApiPickerStage}), reached
 * ONLY by custom/import apps (which can need any entitled API the user picks up
 * front). Mesh and catalog have deterministic APIs subscribed at the rebuild, so
 * they have no api-access stage — their destination stage is terminal. The modal
 * PROVISIONS NOTHING; every kind commits + closes immediately on Add.
 *
 * On open (signed in) the host fires ONE fire-and-forget `list-org-console-apis`
 * to warm the extension-side org-services cache, so the custom/import picker's
 * later fetch is fast.
 *
 * @module features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useMemo } from 'react';
import { isPrebuiltIntegration } from '../../../services/appBuilderComponentCatalogLoader';
import { isAdobeSignedIn, isMeshSelected } from '../../steps/tileStatus';
import type { UseProjectBuilderReturn } from '../../steps/useProjectBuilder';
import { type FlowMode, FlowStageId } from './flowStages';
import { ApiPickerStage } from './stages/ApiPickerStage';
import { BlankStage } from './stages/BlankStage';
import { CatalogStage } from './stages/CatalogStage';
import { CustomStage } from './stages/CustomStage';
import { DestinationStage } from './stages/DestinationStage';
import { KindStage } from './stages/KindStage';
import {
    useIntegrationFlow,
    type ApiEditTarget,
    type UseIntegrationFlowReturn,
} from './useIntegrationFlow';
import { DestinationContext as SharedDestinationContext } from '@/core/ui/components/ui/DestinationContext';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeAuthSessionState, WizardState } from '@/types/webview';

/** Stable empty selection (avoids the inline-array re-render gotcha). */
const EMPTY_IDS: string[] = [];

const TITLES: Record<FlowMode, string> = {
    add: 'Add Integration',
    destination: 'Deployment Destination',
    'api-edit': 'Edit API Access',
};

/** flow stage id → DestinationStage view, for the four destination stages. */
const DEST_VIEWS = {
    'dest-signin': 'signin',
    'dest-project': 'project',
    'dest-workspace': 'workspace',
    'dest-summary': 'summary',
} as const;

export interface AddIntegrationFlowModalProps {
    isOpen: boolean;
    /** Close without committing (hook cancel semantics: the draft is discarded). */
    onClose: () => void;
    /**
     * 'add' = full journey; 'destination' = Set up / Change on a result row;
     * 'api-edit' = re-open the picker for an existing integration's APIs.
     */
    mode: FlowMode;
    /** The integration whose API picks are being re-edited (mode 'api-edit' only). */
    editTarget?: ApiEditTarget;
    state: AdobeAuthSessionState;
    updateState: (updates: Partial<WizardState>) => void;
    /**
     * The stack's mesh catalog entry, if any. Just the catalog entry — the
     * flow reads id/name/description/requiredApis and never the
     * package-resolved `requirement` the wizard's annotated entries add.
     */
    meshComponent?: AppBuilderComponentCatalogEntry;
    /** The FINISHED catalog entries (kind picker count, catalog + API stages). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The blank starter app (the "Build custom" kind seeds it), if any. */
    blankComponent?: AppBuilderComponentCatalogEntry;
    /**
     * The composed collision domain for blank instance naming (buildReservedIds —
     * the host assembles it from selections, sources, catalog ids, and addons).
     */
    reservedIds: Set<string>;
    /** The unchanged useProjectBuilder handlers the finish commits route through. */
    builder: Pick<
        UseProjectBuilderReturn,
        'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'
    >;
    /**
     * Start a user-initiated Adobe sign-in; resolves when it finishes.
     *
     * Supplied by the HOST because the two webviews register different messages
     * for it (wizard `authenticate`, dashboard `reAuthenticate`).
     */
    onSignIn?: () => Promise<unknown>;
}

type JourneyProps = Omit<AddIntegrationFlowModalProps, 'isOpen'>;

/** Renders the stage body the hook's current stage asks for. */
function StageBody({
    flow,
    props,
}: {
    flow: UseIntegrationFlowReturn;
    props: JourneyProps;
}): React.ReactElement {
    const { stage, draft } = flow;
    const { state, updateState, meshComponent, catalog, onSignIn } = props;

    // The catalog prop is the stack-filtered MIXED list: derived meshes, authored
    // integrations, and the blank shell. Only the last of those three categories
    // belongs in the Pre-built gallery — the other two already have their own card
    // in the kind picker, so listing them here offered the same thing twice under
    // two names (reported 2026-08-06: two options in a catalog with no pre-builts).
    //
    // Derived ONCE and used for both the tile count and the gallery, so the count
    // can never disagree with what the gallery would show.
    const prebuiltCatalog = useMemo(() => catalog.filter(isPrebuiltIntegration), [catalog]);
    const selectedIds = state.selectedAppBuilderComponents ?? EMPTY_IDS;
    if (stage === 'kind') {
        // Availability and already-added stay SEPARATE here: the tile is hidden
        // for a stack with no mesh, but disabled-with-a-reason once the project
        // has one. They were collapsed into one boolean until 2026-08-04, which
        // is why the tile could only ever vanish.
        const meshAvailable = meshComponent !== undefined;
        const meshAlreadyAdded = meshAvailable && isMeshSelected(state, meshComponent.id);
        return (
            <KindStage
                meshAvailable={meshAvailable}
                meshAlreadyAdded={meshAlreadyAdded}
                catalogCount={prebuiltCatalog.length}
                kind={draft.kind}
                onPickKind={flow.pickKind}
            />
        );
    }
    if (stage === 'source-catalog') {
        return (
            <CatalogStage
                catalog={prebuiltCatalog}
                selectedId={draft.catalogId}
                onPick={flow.pickCatalog}
            />
        );
    }
    if (stage === 'source-custom') {
        // A cleared/invalid URL emits undefined, which clears the draft source
        // and re-disables Continue.
        return (
            <CustomStage
                selectedIds={selectedIds}
                source={draft.customSource}
                onSourceChange={flow.setCustomSource}
            />
        );
    }
    if (stage === 'source-blank') {
        // The instance-naming stage: a valid, non-colliding name emits the
        // {id, name} instance into the draft (the stage gate); anything else
        // clears it and re-disables Continue.
        return (
            <BlankStage
                reservedIds={props.reservedIds}
                instance={draft.instance}
                onInstanceChange={flow.setInstance}
            />
        );
    }
    if (stage === 'api-access') {
        // Reached ONLY by custom/import apps (blank shell / imported repo): they can
        // need ANY entitled API, and the user often knows which up front — so give
        // them the INTERACTIVE picker (already-covered APIs come back locked). Mesh
        // and catalog have deterministic APIs and never route here (their destination
        // stage is terminal), so this is unconditionally the picker.
        return (
            <ApiPickerStage
                onSignIn={onSignIn}
                componentIds={selectedIds}
                selected={draft.selectedApis ?? EMPTY_IDS}
                onToggle={flow.toggleApi}
            />
        );
    }
    return (
        <DestinationStage
            state={state}
            updateState={updateState}
            view={DEST_VIEWS[stage]}
            pendingProject={draft.pendingProject}
            pendingWorkspace={draft.pendingWorkspace}
            onPendingProject={flow.setPendingProject}
            onPendingWorkspace={flow.setPendingWorkspace}
            onPhaseRunningChange={flow.setPhaseRunning}
        />
    );
}

/** Stages that ARE the destination picker — the line would be redundant there. */
const DEST_PICKER_STAGES: ReadonlySet<string> = new Set([
    'dest-signin',
    'dest-project',
    'dest-workspace',
]);

/**
 * The committed destination as a persistent context LINE, not a stage.
 *
 * It replaced the `dest-summary` step, whose only job was confirming a destination
 * the user never chose (it appears only when one is already committed) — a whole
 * modal step for zero decisions. As a line the destination stays visible while the
 * user does the real work, and the flow loses a click on EVERY add.
 *
 * Gated on the STAGE rather than on `draft.changingDestination`: that flag never
 * resets once set, so gating on it would hide the line for the rest of the session
 * after one Change.
 *
 * @param props - wizard state (the committed destination) and the Change action
 * @returns the line, or null when there is no committed destination to show
 */
function DestinationContext({
    state,
    stage,
    onChange,
}: {
    state: AdobeAuthSessionState;
    stage: FlowStageId;
    onChange: () => void;
}): React.ReactElement | null {
    // The stage gate stays HERE, not in the shared component: hiding the line
    // while the user is on the picker stages is this modal's concern.
    if (DEST_PICKER_STAGES.has(stage)) return null;
    return (
        <SharedDestinationContext
            project={state.adobeProject?.title || state.adobeProject?.name || ''}
            workspace={state.adobeWorkspace?.title || state.adobeWorkspace?.name || ''}
            onChange={onChange}
            className="dest-context--block"
        />
    );
}

/** The mounted-while-open journey: the hook + Modal shell (switch + footer only). */
function FlowJourney(props: JourneyProps): React.ReactElement {
    // JourneyProps is structurally UseIntegrationFlowArgs — the hook takes it whole.
    const flow = useIntegrationFlow(props);
    return (
        <Modal
            title={TITLES[props.mode]}
            size="L"
            // Every stage sizes to ITS content: the kind/name/destination stages are
            // short, the api-access list is long and still scrolls at max-height.
            fitContent
            onClose={props.onClose}
            closeLabel="Cancel"
            actionButtons={[
                {
                    label: 'Back',
                    variant: 'secondary',
                    onPress: flow.onBack,
                    isDisabled: !flow.canGoBack,
                },
                {
                    label: flow.continueLabel,
                    variant: 'accent',
                    onPress: flow.onContinue,
                    isDisabled: !flow.canContinue,
                },
            ]}
        >
            <div className="intflow-stage-body">
                <DestinationContext
                    state={props.state}
                    stage={flow.stage}
                    onChange={flow.changeDestination}
                />
                <StageBody flow={flow} props={props} />
            </div>
        </Modal>
    );
}

/**
 * The Add Integration flow modal host (mounts the journey ONLY while open).
 *
 * @param props - open state + the journey inputs (see the props interface)
 * @returns the dialog host
 */
export function AddIntegrationFlowModal({
    isOpen,
    ...journey
}: AddIntegrationFlowModalProps): React.ReactElement {
    // Warm the extension-side org-services cache the moment the modal opens (once
    // per open, only when signed in) so the interactive picker's later fetch is
    // fast. Fire-and-forget — the result is ignored; the cache is the payoff.
    const signedIn = isAdobeSignedIn(journey.state);
    React.useEffect(() => {
        if (!isOpen || !signedIn) return;
        // Fire-and-forget warm-up: swallow any rejection (timeout/org error) — the
        // picker will fetch on demand if this misses; an unhandled rejection must not escape.
        void webviewClient.request('list-org-console-apis', { componentIds: [] }).catch(() => {});
        // Keyed on the open transition only: fire once per open, never on every state
        // change while open (which would refetch on each keystroke/selection).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);
    // NO `type="fullscreen"` on the container. That was the whole reason this modal
    // ignored every width and height it was given: the fullscreen TYPE renders
    // spectrum-Modal--fullscreen / spectrum-Dialog--fullscreen, which size to the
    // VIEWPORT and outrank the Dialog's own `size`. It was the only fullscreen
    // DialogContainer in the repo — which is exactly why every OTHER modal (Manage
    // APIs, on the same size="L") already hugged its content.
    return (
        <DialogContainer onDismiss={journey.onClose}>
            {isOpen && <FlowJourney {...journey} />}
        </DialogContainer>
    );
}
