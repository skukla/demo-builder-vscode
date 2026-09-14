/**
 * AddDemoModal — the "Add a demo" dialog shell: the core Modal in a
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
import { Modal } from '@/core/ui/components/ui/Modal';
import type { AddedDemo } from '@/types/projectFile';

export interface AddDemoModalProps extends UseAddDemoFlowArgs {
    isOpen: boolean;
    /** The demos already remembered: listed on the first stage, and the duplicate guard. */
    addedDemos: AddedDemo[];
    /** Pick a remembered demo: selects its card and closes. */
    onPickRemembered: (demo: AddedDemo) => void;
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
                {flow.stage === 'link' ? (
                    <LinkStage
                        addedDemos={props.addedDemos}
                        source={flow.draft.source}
                        onSourceChange={flow.setSource}
                        onPickRemembered={props.onPickRemembered}
                        mode={mode}
                        zip={{
                            onImport: flow.importZip,
                            importing: flow.importing,
                            error: flow.zipError,
                            makePublic: flow.makePublic,
                            onMakePublicChange: flow.setMakePublic,
                        }}
                    />
                ) : (
                    <FoundStage
                        probe={flow.probe}
                        draft={flow.draft}
                        packages={props.packages}
                        addError={flow.addError}
                        onNameChange={flow.setName}
                        onB2bChange={flow.setB2bOn}
                        onKeepCopyChange={flow.setKeepCopy}
                        onUpdateRememberedChange={flow.setUpdateRemembered}
                        mode={mode}
                        currentKind={props.currentKind}
                        importing={flow.importing}
                        bundle={flow.bundleSetup && mode === 'add' ? { onStart: flow.startFromBundle, busy: flow.adding } : undefined}
                    />
                )}
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
