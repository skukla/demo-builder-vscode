/**
 * AddIntegrationFlowModal — the one-modal Add Integration journey shell:
 * a {@link DialogContainer}-hosted core {@link Modal} whose body is the stage
 * switch ({@link FlowStageBody}) over {@link useIntegrationFlow} and whose
 * Back/Continue footer is driven entirely by the hook's gates and labels — NO
 * business logic here.
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
import React from 'react';
import { isAdobeSignedIn } from '../../steps/tileStatus';
import type { UseProjectBuilderReturn } from '../../steps/useProjectBuilder';
import { FlowStageBody } from './FlowStageBody';
import { type FlowMode, FlowStageId } from './flowStages';
import { useIntegrationFlow, type ApiEditTarget } from './useIntegrationFlow';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { DestinationContext as SharedDestinationContext } from '@/core/ui/components/ui/DestinationContext';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeAuthSessionState, WizardState } from '@/types/webview';

const TITLES: Record<FlowMode, string> = {
    add: 'Add Integration',
    destination: 'Deployment Destination',
    'api-edit': 'Edit API Access',
};

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
    /**
     * Catalog entries that cannot be added here, by id, with the reason shown on
     * their greyed-out tile — the ERP integration when another project already runs
     * one on this Commerce instance (AB-78).
     */
    unavailable?: Readonly<Record<string, string>>;
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
            {/* Five stages, five natural heights. The dialog jumped at every step
                without a floor under them (owner, 2026-09-20). */}
            <SteadyHeight>
            <div className="intflow-stage-body">
                <DestinationContext
                    state={props.state}
                    stage={flow.stage}
                    onChange={flow.changeDestination}
                />
                <FlowStageBody flow={flow} props={props} />
            </div>
        </SteadyHeight>
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
