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
 * The api-access stage is INFORMATIONAL (see {@link ApiAccessStage}): integrations
 * are deterministic, so it shows the API access an integration grants (always on,
 * subscribed at deploy) from static data — no org fetch, no selection.
 *
 * @module features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { SelectableAppBuilderComponent } from '../../../services/appBuilderComponentSelection';
import { isMeshSelected } from '../../steps/tileStatus';
import type { UseProjectBuilderReturn } from '../../steps/useProjectBuilder';
import { meshKindOffered, type FlowMode } from './flowStages';
import type { EnsureResult } from './MeshApiEnableRow';
import { ApiAccessStage } from './stages/ApiAccessStage';
import { CatalogStage } from './stages/CatalogStage';
import { CustomStage } from './stages/CustomStage';
import { DestinationStage } from './stages/DestinationStage';
import { KindStage } from './stages/KindStage';
import { useIntegrationFlow, type UseIntegrationFlowReturn } from './useIntegrationFlow';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

/** Stable empty selection (avoids the inline-array re-render gotcha). */
const EMPTY_IDS: string[] = [];

const TITLES: Record<FlowMode, string> = {
    add: 'Add Integration',
    destination: 'Deployment Destination',
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
    /** 'add' = full journey; 'destination' = Set up / Change on a result row. */
    mode: FlowMode;
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /** The stack's mesh catalog entry (tileStatus.meshComponentForStack), if any. */
    meshComponent?: SelectableAppBuilderComponent;
    /** The FINISHED catalog entries (kind picker count, catalog + API stages). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The blank starter app (the "Start from scratch" kind seeds it), if any. */
    blankComponent?: AppBuilderComponentCatalogEntry;
    /** Selected stack backend/frontend ids — the mesh-enable payload run on Add. */
    backendId?: string;
    frontendId?: string;
    /** The unchanged useProjectBuilder handlers the finish commits route through. */
    builder: Pick<
        UseProjectBuilderReturn,
        'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'
    >;
    /** The mesh-enable outcome, captured on Add so the result row adopts it (no re-run). */
    onMeshEnableResult?: (result: EnsureResult) => void;
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
    const { state, updateState, meshComponent, catalog } = props;
    const selectedIds = state.selectedAppBuilderComponents ?? EMPTY_IDS;
    if (stage === 'kind') {
        // The ONE mesh-offered rule (flowStages): available for the stack AND not
        // already selected by EITHER key (incl. package-seeded mesh).
        const meshOffered = meshKindOffered({
            meshAvailable: meshComponent !== undefined,
            meshSelected: meshComponent !== undefined && isMeshSelected(state, meshComponent.id),
        });
        return (
            <KindStage
                meshOffered={meshOffered}
                catalogCount={catalog.length}
                kind={draft.kind}
                onPickKind={flow.pickKind}
            />
        );
    }
    if (stage === 'source-catalog') {
        return (
            <CatalogStage
                catalog={catalog}
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
    if (stage === 'api-access') {
        // Informational only: the integration's required APIs (mesh/catalog) are
        // subscribed automatically at deploy. Custom apps declare none up front —
        // they note that more APIs are granted as the app is built.
        if (draft.kind === 'mesh') {
            return (
                <>
                    <ApiAccessStage required={meshComponent?.requiredApis} />
                    {flow.enableError && (
                        <div className="intflow-api-info-error" role="alert">
                            {flow.enableError} — press Add Integration to try again.
                        </div>
                    )}
                </>
            );
        }
        const entry = catalog.find((candidate) => candidate.id === draft.catalogId);
        // Blank (shell) and imported repos are both custom apps — their API surface
        // isn't known up front, so note that APIs are granted as the app is built.
        return (
            <ApiAccessStage
                required={draft.kind === 'catalog' ? entry?.requiredApis : undefined}
                custom={draft.kind === 'custom' || draft.kind === 'blank'}
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
            onChangeDestination={flow.changeDestination}
            onPhaseRunningChange={flow.setPhaseRunning}
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
    return (
        <DialogContainer type="fullscreen" onDismiss={journey.onClose}>
            {isOpen && <FlowJourney {...journey} />}
        </DialogContainer>
    );
}
