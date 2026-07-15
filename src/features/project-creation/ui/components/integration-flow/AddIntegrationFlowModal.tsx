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
 * The api-access stage is INFORMATIONAL for mesh/catalog (see {@link ApiAccessStage}):
 * their APIs are deterministic, so it shows the API access an integration grants
 * (subscribed at the rebuild) from static data — no org fetch, no selection. The
 * modal PROVISIONS NOTHING; every kind commits + closes immediately on Add.
 *
 * On open (signed in) the host fires ONE fire-and-forget `list-org-console-apis`
 * to warm the extension-side org-services cache, so the custom/import picker's
 * later fetch is fast.
 *
 * @module features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { SelectableAppBuilderComponent } from '../../../services/appBuilderComponentSelection';
import { isAdobeSignedIn, isMeshSelected } from '../../steps/tileStatus';
import type { UseProjectBuilderReturn } from '../../steps/useProjectBuilder';
import { enabledApisFromSelection } from './enabledApis';
import { meshKindOffered, type FlowMode } from './flowStages';
import { ApiAccessStage } from './stages/ApiAccessStage';
import { ApiPickerStage } from './stages/ApiPickerStage';
import { CatalogStage } from './stages/CatalogStage';
import { CustomStage } from './stages/CustomStage';
import { DestinationStage } from './stages/DestinationStage';
import { KindStage } from './stages/KindStage';
import {
    useIntegrationFlow,
    type ApiEditTarget,
    type UseIntegrationFlowReturn,
} from './useIntegrationFlow';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

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
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /** The stack's mesh catalog entry (tileStatus.meshComponentForStack), if any. */
    meshComponent?: SelectableAppBuilderComponent;
    /** The FINISHED catalog entries (kind picker count, catalog + API stages). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The blank starter app (the "Build custom" kind seeds it), if any. */
    blankComponent?: AppBuilderComponentCatalogEntry;
    /** Selected stack backend/frontend ids — resolve the project's already-enabled APIs. */
    backendId?: string;
    frontendId?: string;
    /** The unchanged useProjectBuilder handlers the finish commits route through. */
    builder: Pick<
        UseProjectBuilderReturn,
        'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'
    >;
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
        // API access is PROJECT-LEVEL — the APIs the integrations ALREADY in this
        // project cover show as ✓, not as something to add again. (The integration
        // being added isn't in selectedIds yet, so this is exactly "the others".)
        const alreadyEnabled = enabledApisFromSelection(
            selectedIds,
            props.backendId,
            props.frontendId,
        );
        if (draft.kind === 'mesh') {
            // Mesh APIs are deterministic — the same informational panel as catalog.
            // The modal provisions nothing; they subscribe at the rebuild.
            return (
                <ApiAccessStage
                    required={meshComponent?.requiredApis}
                    alreadyEnabled={alreadyEnabled}
                />
            );
        }
        // Custom apps (blank shell / imported repo) can need ANY entitled API and
        // the user often knows which up front — so give them the INTERACTIVE picker
        // (already-covered APIs come back locked). Catalog stays deterministic.
        if (draft.kind === 'blank' || draft.kind === 'custom') {
            return (
                <ApiPickerStage
                    componentIds={selectedIds}
                    selected={draft.selectedApis ?? EMPTY_IDS}
                    onToggle={flow.toggleApi}
                />
            );
        }
        const entry = catalog.find((candidate) => candidate.id === draft.catalogId);
        return <ApiAccessStage required={entry?.requiredApis} alreadyEnabled={alreadyEnabled} />;
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
    return (
        <DialogContainer type="fullscreen" onDismiss={journey.onClose}>
            {isOpen && <FlowJourney {...journey} />}
        </DialogContainer>
    );
}
