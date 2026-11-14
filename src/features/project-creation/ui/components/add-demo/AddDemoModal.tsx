/**
 * AddDemoModal — the "Add a demo package" dialog shell: Steps windows in a
 * DialogContainer, mounted only while open (the reset-on-open seam the Add
 * Integration modal established), a two-stage body over {@link useAddDemoFlow},
 * and a footer driven by the hook, Back at its start. An answer instead of a form
 * (`addDemoOutcome`) is the title and its status icon, with the footer's main button
 * only when there is something to go on to.
 *
 * Each stage is a window of its own (step-07 Win3; owner 2026-11-14, rule 14): what was found is
 * much taller than the link, so it opens at its own size, unseen while the link is read, rather
 * than scrolling in the first stage's box. The first stage reserves both ways in (a link, a zip),
 * so switching never grows it.
 *
 * @module features/project-creation/ui/components/add-demo/AddDemoModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { COPY, isBuildable } from './addDemoFlow';
import { outcomeOf, type AddDemoOutcome } from './addDemoOutcome';
import { FoundStage } from './FoundStage';
import { LinkStage } from './LinkStage';
import { useAddDemoFlow, type UseAddDemoFlowArgs } from './useAddDemoFlow';
import type { ActionButton, ModalWait } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { AddedDemo } from '@/types/projectFile';

export interface AddDemoModalProps extends UseAddDemoFlowArgs {
    isOpen: boolean;
    /** The demos already added: the duplicate guard. */
    addedDemos: AddedDemo[];
}

type BodyProps = Omit<AddDemoModalProps, 'isOpen'> & {
    flow: ReturnType<typeof useAddDemoFlow>;
    mode: NonNullable<AddDemoModalProps['mode']>;
    outcome: AddDemoOutcome | undefined;
};

/** The first stage, on the given way in: the way shown, or the other one, reserved. */
function LinkStageOf({ flow, mode, way, addedDemos }: Omit<BodyProps, 'outcome'> & { way: BodyProps['flow']['way'] }): React.ReactElement {
    return (
        <LinkStage
            addedDemos={addedDemos}
            source={flow.draft.source}
            onSourceChange={flow.setSource}
            mode={mode}
            zip={{
                way,
                onWayChange: flow.setWay,
                makePublic: flow.makePublic,
                onMakePublicChange: flow.setMakePublic,
            }}
        />
    );
}

/** One view at a time: an answer, the first stage, or what was found. The waits are the window's own. */
function Body({ flow, mode, outcome, ...props }: BodyProps): React.ReactElement | null {
    if (outcome) {
        return (
            <div className="dialog-stack" data-testid={outcome.testId}>
                {outcome.lines.map((line) => (
                    <p key={line} className="dialog-line">{line}</p>
                ))}
            </div>
        );
    }
    if (flow.stage === 'link') return <LinkStageOf {...props} flow={flow} mode={mode} way={flow.way} />;
    const result = flow.probe.status === 'done' ? flow.probe.result : undefined;
    if (!isBuildable(result)) return null;
    return (
        <FoundStage
            read={result}
            draft={flow.draft}
            onNameChange={flow.setName}
            onDescriptionChange={flow.setDescription}
            onB2bChange={flow.setB2bOn}
            onUpdateDemoPackageChange={flow.setUpdateDemoPackage}
            mode={mode}
            demoPackageName={props.demoPackageName}
            carriesSetup={Boolean(flow.bundleSetup) && mode === 'add'}
        />
    );
}

/**
 * The dialog's wait: the push, shown whichever stage the dialog is on, since the import starts from
 * the first stage and can take a minute; the commit, because a form that sits unchanged while it
 * runs reads as a press that did nothing; or the read of the link, which says nothing because it
 * is reading what the dialog will show.
 */
function waitOf(flow: BodyProps['flow'], mode: BodyProps['mode']): ModalWait | false {
    if (flow.importing) return { label: flow.importStep?.message ?? COPY.importing, detail: flow.importStep?.detail };
    if (flow.adding) return { label: mode === 'change' ? COPY.change.changing : COPY.adding };
    if (flow.stage === 'found' && (flow.probe.status === 'idle' || flow.probe.status === 'loading')) return WAIT_STAGES.checkingSharedDemo;
    return false;
}

/** The footer: Back at its start (step-07 Win3), the rest beside Cancel or Close, the main one last. */
interface Footer {
    start: ActionButton[];
    actions: ActionButton[];
}

/**
 * The buttons beside Cancel or Close. An answer with nothing to go on to has no main button: a
 * disabled one beside Back only showed what could not be done.
 */
function footerOf(flow: BodyProps['flow'], mode: BodyProps['mode'], outcome: AddDemoOutcome | undefined): Footer {
    const start: ActionButton[] = [{ label: 'Back', variant: 'secondary', onPress: flow.onBack, isDisabled: !flow.canGoBack }];
    if (flow.zipConflict) return { start, actions: [{ label: COPY.useExisting, variant: 'accent', onPress: flow.useExistingRepo }] };
    if (outcome && !flow.canContinue) return { start, actions: [] };
    const main: ActionButton = {
        label: flow.continueLabel,
        variant: 'accent',
        onPress: flow.onContinue,
        isDisabled: !flow.canContinue,
    };
    const offersBundle = !outcome && flow.stage === 'found' && mode === 'add' && Boolean(flow.bundleSetup);
    const actions = offersBundle ? [{ label: COPY.bundleStart, variant: 'secondary' as const, onPress: flow.startFromBundle }, main] : [main];
    return { start, actions };
}

/** The first stage's other way in, drawn hidden as it opens, so the taller sets its height. */
function reserveOf(props: Omit<BodyProps, 'outcome'>): React.ReactNode {
    if (props.flow.stage !== 'link' || props.mode !== 'add') return null;
    return <LinkStageOf {...props} way={props.flow.way === 'link' ? 'zip' : 'link'} />;
}

/** Whether the window knows what it shows: what was found waits for the read of the link. */
function readyOf(flow: BodyProps['flow']): boolean {
    return flow.stage !== 'found' || (flow.probe.status !== 'idle' && flow.probe.status !== 'loading');
}

function Journey(props: Omit<AddDemoModalProps, 'isOpen'>): React.ReactElement {
    const flow = useAddDemoFlow(props);
    const mode = props.mode ?? 'add';
    const wait = waitOf(flow, mode);
    const outcome = wait
        ? undefined
        : outcomeOf({
              stage: flow.stage,
              probe: flow.probe,
              addError: flow.addError,
              zipError: flow.zipError,
              zipConflict: Boolean(flow.zipConflict),
              mode,
              currentKind: props.currentKind,
              packages: props.packages,
          });
    const footer = footerOf(flow, mode, outcome);
    return (
        <StepsWindow
            // A window per stage: what was found opens at its own size (rule 14).
            key={flow.stage}
            title={outcome?.title ?? (mode === 'change' ? COPY.change.title : COPY.title)}
            {...(outcome?.status ? { status: outcome.status } : {})}
            ready={readyOf(flow)}
            waiting={wait}
            reserve={reserveOf({ ...props, flow, mode })}
            onClose={props.onClose}
            // Nothing is left to cancel once only Back remains.
            closeLabel={outcome && footer.actions.length === 0 ? 'Close' : 'Cancel'}
            startButtons={footer.start}
            actionButtons={footer.actions}
        >
            <div className="intflow-stage-body">
                <Body {...props} flow={flow} mode={mode} outcome={outcome} />
            </div>
        </StepsWindow>
    );
}

/**
 * The dialog host: mounts the journey only while open.
 *
 * @param props - open state and the journey's inputs
 * @returns the dialog container
 */
export function AddDemoModal({ isOpen, ...journey }: AddDemoModalProps): React.ReactElement {
    return <DialogContainer onDismiss={journey.onClose}>{isOpen && <Journey {...journey} />}</DialogContainer>;
}
