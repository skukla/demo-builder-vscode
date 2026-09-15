/**
 * AddDemoModal — the "Add a demo package" dialog shell: the core Modal in a
 * DialogContainer, mounted only while open (the reset-on-open seam the Add
 * Integration modal established), a two-stage body over {@link useAddDemoFlow},
 * and a Back/Continue footer driven by the hook.
 *
 * @module features/project-creation/ui/components/add-demo/AddDemoModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { COPY } from './addDemoFlow';
import { FoundStage } from './FoundStage';
import { LinkStage } from './LinkStage';
import { useAddDemoFlow, type UseAddDemoFlowArgs } from './useAddDemoFlow';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { AddedDemo } from '@/types/projectFile';

export interface AddDemoModalProps extends UseAddDemoFlowArgs {
    isOpen: boolean;
    /** The demos already added: the duplicate guard. */
    addedDemos: AddedDemo[];
}

type BodyProps = Omit<AddDemoModalProps, 'isOpen'> & {
    flow: ReturnType<typeof useAddDemoFlow>;
    mode: NonNullable<AddDemoModalProps['mode']>;
};

/** One view at a time: the push, the commit, the first stage, or what was found. */
function Body({ flow, mode, ...props }: BodyProps): React.ReactElement {
    if (flow.importing) {
        // Shown for the whole push, whichever stage the dialog is on: the import
        // starts from the first stage and can take a minute.
        return (
            <CenteredFeedbackContainer height="280px">
                <LoadingDisplay
                    size="L"
                    message={flow.importStep?.message ?? COPY.importing}
                    subMessage={flow.importStep?.detail}
                    helperText={COPY.importingFor}
                />
            </CenteredFeedbackContainer>
        );
    }
    if (flow.adding) {
        // A form that sits unchanged while the commit runs reads as a press that did nothing.
        return (
            <CenteredFeedbackContainer height="280px">
                <LoadingDisplay size="L" message={mode === 'change' ? COPY.change.changing : COPY.adding} />
            </CenteredFeedbackContainer>
        );
    }
    if (flow.zipError) {
        // The house error view, as the probe's refusals use; Back returns to the form.
        return (
            <div data-testid="zip-error">
                <StatusDisplay
                    variant="error"
                    title={COPY.zipFailed}
                    message={flow.zipError}
                    height="auto"
                    actions={flow.zipConflict ? [{ label: COPY.useExisting, variant: 'accent', onPress: flow.useExistingRepo }] : undefined}
                />
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
    return (
        <FoundStage
            probe={flow.probe}
            draft={flow.draft}
            packages={props.packages}
            addError={flow.addError}
            onNameChange={flow.setName}
            onDescriptionChange={flow.setDescription}
            onB2bChange={flow.setB2bOn}
            onUpdateDemoPackageChange={flow.setUpdateDemoPackage}
            mode={mode}
            currentKind={props.currentKind}
            demoPackageName={props.demoPackageName}
            bundle={flow.bundleSetup && mode === 'add' ? { onStart: flow.startFromBundle, busy: flow.adding } : undefined}
        />
    );
}

function Journey(props: Omit<AddDemoModalProps, 'isOpen'>): React.ReactElement {
    const flow = useAddDemoFlow(props);
    const mode = props.mode ?? 'add';
    return (
        <Modal
            title={mode === 'change' ? COPY.change.title : COPY.title}
            size="L"
            fitContent
            onClose={props.onClose}
            closeLabel="Cancel"
            actionButtons={[
                { label: 'Back', variant: 'secondary', onPress: flow.onBack, isDisabled: !flow.canGoBack },
                {
                    label: flow.continueLabel,
                    variant: 'accent',
                    onPress: flow.onContinue,
                    isDisabled: !flow.canContinue,
                },
            ]}
        >
            <div className="intflow-stage-body">
                <Body {...props} flow={flow} mode={mode} />
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
