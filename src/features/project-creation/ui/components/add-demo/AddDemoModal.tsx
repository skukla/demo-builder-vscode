/**
 * AddDemoModal — the "Add a demo package" dialog shell: the core Modal in a
 * DialogContainer, mounted only while open (the reset-on-open seam the Add
 * Integration modal established), a two-stage body over {@link useAddDemoFlow},
 * and a Back/Continue footer driven by the hook. An answer instead of a form
 * (`addDemoOutcome`) is the title and its status icon, with the footer's main button
 * only when there is something to go on to.
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
import { Modal, type ActionButton, type ModalWait } from '@/core/ui/components/ui/Modal';
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

/** One view at a time: an answer, the first stage, or what was found. The waits are the Modal's own. */
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
    if (flow.stage === 'link') {
        return (
            <LinkStage
                addedDemos={props.addedDemos}
                source={flow.draft.source}
                onSourceChange={flow.setSource}
                mode={mode}
                zip={{
                    way: flow.way,
                    onWayChange: flow.setWay,
                    makePublic: flow.makePublic,
                    onMakePublicChange: flow.setMakePublic,
                }}
            />
        );
    }
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

/**
 * The buttons beside Cancel or Close. An answer with nothing to go on to has no main button: a
 * disabled one beside Back only showed what could not be done.
 */
function footerOf(flow: BodyProps['flow'], mode: BodyProps['mode'], outcome: AddDemoOutcome | undefined): ActionButton[] {
    const back: ActionButton = { label: 'Back', variant: 'secondary', onPress: flow.onBack, isDisabled: !flow.canGoBack };
    if (flow.zipConflict) {
        return [back, { label: COPY.useExisting, variant: 'accent', onPress: flow.useExistingRepo }];
    }
    if (outcome && !flow.canContinue) return [back];
    const main: ActionButton = {
        label: flow.continueLabel,
        variant: 'accent',
        onPress: flow.onContinue,
        isDisabled: !flow.canContinue,
    };
    const offersBundle = !outcome && flow.stage === 'found' && mode === 'add' && Boolean(flow.bundleSetup);
    return offersBundle
        ? [back, { label: COPY.bundleStart, variant: 'secondary', onPress: flow.startFromBundle }, main]
        : [back, main];
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
    const actions = footerOf(flow, mode, outcome);
    return (
        <Modal
            title={outcome?.title ?? (mode === 'change' ? COPY.change.title : COPY.title)}
            status={outcome?.status}
            size="L"
            fitContent
            waiting={wait}
            onClose={props.onClose}
            // Nothing is left to cancel once only Back remains.
            closeLabel={outcome && actions.length === 1 ? 'Close' : 'Cancel'}
            actionButtons={actions}
        >
            <div className="intflow-stage-body">
                <Body {...props} flow={flow} mode={mode} outcome={outcome} />
            </div>
        </Modal>
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
