/**
 * The one dialog behind "Create datapack" and "Save store changes to this pack": a guided
 * point-and-click flow in the style of Add Integration (owner, 2026-11-02: "There's too much text.
 * We should pivot to the approach we use for integrations where we guide the user through point and
 * click."). One question per screen; Close, Back and the main button in the footer. State is in
 * `useCreateDatapackFlow`, and which screens each pack walks in `datapackFlowStages`.
 *
 * A dialog's size never animates, so every form screen has the one width, and a result takes the
 * small one with its outcome as the title. The first read of a list the screen is made of is
 * `Modal`'s wait. A kind's items read inside their own pane, with the kinds and the buttons still
 * on, since a slow read must not cost what is already selected.
 *
 * @module features/data-installer/ui/components/create-flow/DatapackFlowDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { StorePicks } from '../../../pickableKinds';
import { ExportDatapackResult } from '../ExportDatapackResult';
import { type ResultContent, resultStatus } from '../importResult';
import type { DatapackEngine, PackBeingSaved } from './datapackFlowStages';
import { AcoKindsStage } from './stages/AcoKindsStage';
import { AcoViewsStage } from './stages/AcoViewsStage';
import { PackNameStage } from './stages/PackNameStage';
import { PackTypeStage } from './stages/PackTypeStage';
import { ServiceTypesStage } from './stages/ServiceTypesStage';
import { StorePicksStage } from './stages/StorePicksStage';
import { type CreateDatapackFlow, useCreateDatapackFlow } from './useCreateDatapackFlow';
import { type ActionButton, Modal, type ModalProps, type ModalWait } from '@/core/ui/components/ui/Modal';

export interface DatapackFlowDialogProps {
    title: string;
    engine?: DatapackEngine;
    /** Start at what goes in it, with no pack type to ask. */
    startsAtPicks?: boolean;
    pack?: PackBeingSaved;
    onClose: () => void;
    /** Start the save with these picks. Must be stable. */
    onSave: (picks: StorePicks) => void;
}

/** A read of what the screen will show says nothing. */
const SILENT_WAIT: ModalWait = {};

function frameOf(result: ResultContent | null, title: string): Pick<ModalProps, 'size' | 'title' | 'status'> {
    if (result) return { size: 'S', title: result.title, status: resultStatus(result) };
    return { size: 'L', title };
}

function footerOf(flow: CreateDatapackFlow): ActionButton[] {
    if (flow.answers.result) return [{ label: 'Back', variant: 'secondary', onPress: flow.answers.dismissResult }];
    return [
        { label: 'Back', variant: 'secondary', onPress: flow.back, isDisabled: !flow.canGoBack },
        { label: flow.main.label, variant: 'accent', onPress: flow.main.onPress, isDisabled: flow.main.isDisabled, isPending: flow.main.isPending },
    ];
}

/** The body the stage asks for. */
function StageBody({ flow, engine, pack }: Pick<DatapackFlowDialogProps, 'engine' | 'pack'> & { flow: CreateDatapackFlow }): React.ReactElement {
    const { stage, store, answers } = flow;
    if (stage === 'pack-type') return <PackTypeStage engine={engine} packType={flow.packType} onPick={flow.pickPackType} />;
    if (stage === 'store-picks') return <StorePicksStage pack={pack} store={store} />;
    if (stage === 'aco-views') return <AcoViewsStage aco={answers.aco} />;
    if (stage === 'aco-kinds') return <AcoKindsStage aco={answers.aco} />;
    if (stage === 'service-types') return <ServiceTypesStage types={answers.types} />;
    return <PackNameStage answers={answers} sharedCatalog={flow.route === 'service'} />;
}

export function DatapackFlowDialog({ title, engine, startsAtPicks, pack, onClose, onSave }: DatapackFlowDialogProps): React.ReactElement {
    const flow = useCreateDatapackFlow({ engine, startsAtPicks, pack, onSave });
    const { result, savable } = flow.answers;
    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                {...frameOf(result, title)}
                fitContent
                onClose={onClose}
                closeLabel={result ? 'Close' : 'Cancel'}
                waiting={flow.waiting ? SILENT_WAIT : false}
                actionButtons={footerOf(flow)}
            >
                <div className="datapack-export-body">
                    {result ? (
                        <ExportDatapackResult result={result} savable={savable} source={flow.route === 'aco' ? 'library' : 'installer'} />
                    ) : (
                        <StageBody flow={flow} engine={engine} pack={pack} />
                    )}
                </div>
            </Modal>
        </DialogContainer>
    );
}
