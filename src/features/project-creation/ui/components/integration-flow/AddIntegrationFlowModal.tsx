/**
 * AddIntegrationFlowModal — the Add Integration journey shell: Steps windows in a
 * {@link DialogContainer}, whose body is the stage switch ({@link FlowStageBody})
 * over {@link useIntegrationFlow} and whose footer (Back at its start, Continue
 * beside Cancel) is driven entirely by the hook's gates and labels — NO business
 * logic here. Comparable stages share the first stage's window; a much taller one
 * opens its own (`WINDOW_OF`, step-07 Win3).
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
 * The dialog itself answers for that stage's read of the org's APIs: a wait with nothing else on
 * screen, or a failed read as its title and status icon. A destination stage's outcome (signed
 * out, a list it could not read, an empty list, a failed setup) arrives the same way, reported up
 * by the stage (`DialogOutcome`), because the stage holds the state and has to stay mounted.
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
import { apiAccessProblemOf, type ApiAccessProblem } from './apiAccessProblem';
import { journeyFooter, type Footer } from './flowFooter';
import { FlowStageBody } from './FlowStageBody';
import { type FlowMode, FlowStageId } from './flowStages';
import type { UnavailableEntries } from './stages/CatalogStage';
import {
    useIntegrationFlow,
    type ApiEditTarget,
    type UseIntegrationFlowReturn,
} from './useIntegrationFlow';
import { useOrgApis } from './useOrgApis';
import { DestinationContext as SharedDestinationContext } from '@/core/ui/components/ui/DestinationContext';
import type { DialogOutcome } from '@/core/ui/components/ui/DialogOutcome';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeAuthSessionState, WizardState } from '@/types/webview';

/** Stable empty selection (avoids the inline-array re-render gotcha). */
const NO_COMPONENT_IDS: string[] = [];

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
     * Catalog entries that cannot be added here, greyed out with the reason, and the
     * message saying what to do instead — the ERP integration when another project
     * already runs one on this Commerce instance (AB-78).
     */
    unavailable?: UnavailableEntries;
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
     * Start a user-initiated Adobe sign-in; resolves when it finishes. The window owns it: the one
     * Sign In every screen sends, `authenticate` (walk F248, owner: no copy per host). Passed only
     * by tests that drive it.
     */
    onSignIn?: () => Promise<unknown>;
    /**
     * A confirmation the finished add needs, shown in THIS window in place of the flow: the
     * dashboard's "prepare the store" (`PrepareOnAddConfirm`) before the ERP integration's add
     * runs (owner, 2026-10-31,
     * the multi-dialog audit). The same container holds it, so the window changes its content
     * instead of closing for a second dialog. A full `Modal`, built by the host.
     */
    confirmation?: React.ReactNode;
}

type JourneyProps = Omit<AddIntegrationFlowModalProps, 'isOpen' | 'confirmation'>;

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
            onChange={onChange}
            className="dest-context--block"
        />
    );
}

/**
 * Which window each stage is drawn in (step-07 Win3; owner 2026-11-14, rule 14): the kind and the
 * two naming stages are of a comparable height and share the first window, which holds the tallest
 * of them; a stage much taller than the first (the pre-built gallery, the project and workspace
 * lists, the API list) opens as a window of its own at its own size, never a scrolling body. A long
 * list scrolls in its own pane. Signing in is a short window of its own between them.
 */
const WINDOW_OF: Record<FlowStageId, string> = {
    kind: 'choose',
    'source-blank': 'choose',
    'source-custom': 'choose',
    'source-catalog': 'catalog',
    'dest-signin': 'signin',
    'dest-project': 'destination',
    'dest-workspace': 'destination',
    'api-access': 'apis',
};

const CHOOSE_STAGES: FlowStageId[] = ['kind', 'source-blank', 'source-custom'];

interface StageViewProps {
    flow: UseIntegrationFlowReturn;
    props: JourneyProps;
    apis: ReturnType<typeof useOrgApis>['apis'];
    problem: ApiAccessProblem | undefined;
    onOutcome: (outcome: DialogOutcome | null) => void;
    onWaiting: (waiting: boolean) => void;
}

/** One stage's body: the read's problem, or the destination line over the stage. */
function StageView({ flow, props, apis, problem, onOutcome, onWaiting }: StageViewProps): React.ReactElement {
    return (
        <div className="intflow-stage-body">
            {problem ? (
                <div className="dialog-stack" data-testid="api-access-problem">
                    {problem.lines.map((line) => (
                        <p key={line} className="dialog-line">
                            {line}
                        </p>
                    ))}
                </div>
            ) : (
                <>
                    <DestinationContext state={props.state} stage={flow.stage} onChange={flow.changeDestination} />
                    <FlowStageBody flow={flow} props={props} apis={apis} onOutcome={onOutcome} onWaiting={onWaiting} />
                </>
            )}
        </div>
    );
}

/** The window's other stages, drawn hidden as it opens so the tallest sets its height. */
function reserveOf(view: StageViewProps): React.ReactNode {
    if (WINDOW_OF[view.flow.stage] !== 'choose') return null;
    return CHOOSE_STAGES.filter((stage) => stage !== view.flow.stage).map((stage) => (
        <StageView key={stage} {...view} problem={undefined} flow={{ ...view.flow, stage }} />
    ));
}

interface FlowWindowProps extends StageViewProps {
    heading: { title: string; status?: DialogOutcome['status'] } | undefined;
    footer: Footer;
    /** The API read is out: only the wait and the way out. */
    reading: boolean;
    /** A destination list's silent wait is on: the stage stays mounted, holding the read. */
    stageWaiting: boolean;
}

/**
 * One window, keyed by `WINDOW_OF`, so a much taller stage opens a new one. It is the small wait window until
 * what it shows is known (a destination list read, the API read), so it opens at that height and
 * holds it. `settled` waits one commit, so a stage's wait reported on mount counts before the
 * height is held.
 */
function FlowWindow({ heading, footer, reading, stageWaiting, ...view }: FlowWindowProps): React.ReactElement {
    const [settled, setSettled] = React.useState(false);
    React.useEffect(() => setSettled(true), []);
    return (
        <StepsWindow
            title={heading?.title ?? TITLES[view.props.mode]}
            {...(heading?.status ? { status: heading.status } : {})}
            ready={settled && !stageWaiting && !reading}
            // Reading what it will show: only the way out, and the one line a read this long needs.
            waiting={reading ? WAIT_STAGES.readingAdobeServices : false}
            reserve={reserveOf(view)}
            closeLabel="Cancel"
            startButtons={footer.start}
            actionButtons={footer.actions}
            onClose={view.props.onClose}
        >
            <StageView {...view} />
        </StepsWindow>
    );
}

/** The one Sign In (`authenticate`, every screen's); a failed one resolves, never rejects into the window. */
const requestAdobeSignIn = (): Promise<unknown> => webviewClient.request('authenticate').catch(() => undefined);

/** The mounted-while-open journey: the hook, and the window its stage is drawn in. */
function FlowJourney(props: JourneyProps): React.ReactElement {
    // JourneyProps is structurally UseIntegrationFlowArgs — the hook takes it whole.
    const flow = useIntegrationFlow(props);
    const onApiStage = flow.stage === 'api-access';
    const orgApis = useOrgApis(
        onApiStage,
        props.state.selectedAppBuilderComponents ?? NO_COMPONENT_IDS,
    );
    const problem = onApiStage ? apiAccessProblemOf(orgApis, props.onSignIn) : undefined;
    const [outcome, setOutcome] = React.useState<DialogOutcome | null>(null);
    const [stageWaiting, setStageWaiting] = React.useState(false);
    return (
        <FlowWindow
            key={WINDOW_OF[flow.stage]}
            flow={flow}
            props={props}
            apis={orgApis.apis}
            problem={problem}
            onOutcome={setOutcome}
            onWaiting={setStageWaiting}
            heading={problem ?? outcome ?? undefined}
            footer={journeyFooter(flow, props.mode, problem, { waiting: stageWaiting, outcome })}
            reading={onApiStage && orgApis.loading}
            stageWaiting={stageWaiting}
        />
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
    confirmation,
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
            {confirmation ?? (isOpen && <FlowJourney {...journey} onSignIn={journey.onSignIn ?? requestAdobeSignIn} />)}
        </DialogContainer>
    );
}
