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
 * The org console-API list is PREFETCHED at the journey level
 * ({@link useOrgConsoleApis}) the moment the integration pick is known — so
 * the api-access stage's picker is usually ready on arrival (one spinner max:
 * the mesh enable's) and the fetch is issued BEFORE the enable, never starved
 * behind its 180s Adobe-session budget.
 *
 * @module features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { SelectableAppBuilderComponent } from '../../../services/appBuilderComponentSelection';
import { isMeshSelected } from '../../steps/tileStatus';
import type { UseProjectBuilderReturn } from '../../steps/useProjectBuilder';
import { meshKindOffered, type FlowDraft, type FlowMode } from './flowStages';
import { MeshApiEnableRow, type EnsureResult } from './MeshApiEnableRow';
import { ApiAccessStage } from './stages/ApiAccessStage';
import { CatalogStage } from './stages/CatalogStage';
import { CustomStage } from './stages/CustomStage';
import { DestinationStage } from './stages/DestinationStage';
import { KindStage } from './stages/KindStage';
import { useIntegrationFlow, type UseIntegrationFlowReturn } from './useIntegrationFlow';
import { useOrgConsoleApis, type OrgConsoleApisState } from './useOrgConsoleApis';
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
    /** The addable catalog entries (kind picker count, catalog + API stages). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The unchanged useProjectBuilder handlers the finish commits route through. */
    builder: Pick<
        UseProjectBuilderReturn,
        'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'
    >;
    /** The selected stack's backend id — the mesh enable's backend axis. */
    meshBackendId?: string;
    /** The selected stack's frontend id — the mesh enable's frontend axis. */
    meshFrontendId?: string;
    /**
     * Receives the in-modal mesh enable outcome so the host can hand it to the
     * mesh result row as `initialResult` (adopted once — no duplicate request).
     */
    onMeshEnableResult?: (result: EnsureResult) => void;
}

type JourneyProps = Omit<AddIntegrationFlowModalProps, 'isOpen'>;

/** The draft's picked integration id (mesh/catalog id or custom `owner-repo`), if known. */
function resolvePickId(draft: FlowDraft, meshId?: string): string | undefined {
    if (draft.kind === 'mesh') return meshId;
    if (draft.kind === 'catalog') return draft.catalogId;
    if (draft.kind === 'custom' && draft.customSource) {
        return `${draft.customSource.owner}-${draft.customSource.repo}`;
    }
    return undefined;
}

/** The prefetch ids: the pick first, or undefined while no pick exists (no fetch). */
function apiComponentIds(
    draft: FlowDraft,
    selectedIds: string[],
    meshId?: string,
): string[] | undefined {
    const pickId = resolvePickId(draft, meshId);
    if (!pickId) return undefined;
    return [pickId, ...selectedIds.filter((id) => id !== pickId)];
}

/** Renders the stage body the hook's current stage asks for. */
function StageBody({
    flow,
    props,
    orgApis,
}: {
    flow: UseIntegrationFlowReturn;
    props: JourneyProps;
    orgApis: OrgConsoleApisState;
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
        if (draft.kind === 'mesh') {
            // Mesh: the shared two-column stage with the auto-running ENABLE
            // as the summary's Applied slot (provisions the required set now —
            // onRunningChange drives phaseRunning so the footer waits; a
            // failure shows ⚠ + Retry, and creation re-ensures idempotently).
            // Free picks merge under the mesh id on finish (union-subscribed).
            return (
                <ApiAccessStage
                    orgApis={orgApis}
                    suggested={meshComponent?.suggestedApis}
                    selected={draft.selectedApis}
                    onToggle={flow.toggleApi}
                    appliedSlot={
                        <MeshApiEnableRow
                            orgId={state.adobeOrg?.id}
                            projectId={state.adobeProject?.id}
                            workspaceId={state.adobeWorkspace?.id}
                            backendId={props.meshBackendId}
                            frontendId={props.meshFrontendId}
                            onResult={props.onMeshEnableResult}
                            onRunningChange={flow.setPhaseRunning}
                        />
                    }
                />
            );
        }
        const entry = catalog.find((candidate) => candidate.id === draft.catalogId);
        return (
            <ApiAccessStage
                orgApis={orgApis}
                suggested={draft.kind === 'catalog' ? entry?.suggestedApis : undefined}
                selected={draft.selectedApis}
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
            onChangeDestination={flow.changeDestination}
            onPhaseRunningChange={flow.setPhaseRunning}
        />
    );
}

/** The mounted-while-open journey: the hook + Modal shell (switch + footer only). */
function FlowJourney(props: JourneyProps): React.ReactElement {
    // JourneyProps is structurally UseIntegrationFlowArgs — the hook takes it whole.
    const flow = useIntegrationFlow(props);
    // PREFETCH the org APIs the moment the pick is known (mesh: at the kind
    // pick) — ready before the api-access stage, never behind the mesh enable.
    const selectedIds = props.state.selectedAppBuilderComponents ?? EMPTY_IDS;
    const orgApis = useOrgConsoleApis(
        apiComponentIds(flow.draft, selectedIds, props.meshComponent?.id),
    );
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
                <StageBody flow={flow} props={props} orgApis={orgApis} />
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
