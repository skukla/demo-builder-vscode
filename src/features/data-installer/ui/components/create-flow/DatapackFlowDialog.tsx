/**
 * The one dialog behind "Create datapack" and "Save store changes to this pack": a guided
 * point-and-click flow in the style of Add Integration (owner, 2026-11-02: "There's too much text.
 * We should pivot to the approach we use for integrations where we guide the user through point and
 * click."). One question per screen; Close, Back and the main button in the footer. State is in
 * `useCreateDatapackFlow`, and which screens each pack walks in `datapackFlowStages`.
 *
 * A dialog's size never animates, so every form screen has the one width, and a result takes the
 * small one with its outcome as the title. The first read of a list the screen is made of is
 * `Modal`'s wait, the store's counts and first kind's list included, so the two columns appear
 * together. A later kind's items read inside their own pane, with the kinds and the buttons still
 * on, since a slow read must not cost what is already selected.
 *
 * From a pack (walk F85, owner, 2026-11-09) the footer is Add Unused Items at its start, then Cancel,
 * Save As New on the SC's own pack, and Save; its own footer is Cancel and Add, back to the save.
 *
 * @module features/data-installer/ui/components/create-flow/DatapackFlowDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { StorePicks } from '../../../pickableKinds';
import { ExportDatapackResult } from '../ExportDatapackResult';
import { type ResultContent, resultStatus } from '../importResult';
import type { PackBeingSaved } from './datapackFlowStages';
import { SAVE_AS_INTRO, saveIntro } from './saveWords';
import { AcoKindsStage } from './stages/AcoKindsStage';
import { AcoViewsStage } from './stages/AcoViewsStage';
import { PackNameStage, SaveAsNameStage } from './stages/PackNameStage';
import { PackTypeStage } from './stages/PackTypeStage';
import { StorePicksStage } from './stages/StorePicksStage';
import { type CreateDatapackFlow, useCreateDatapackFlow } from './useCreateDatapackFlow';
import { type ActionButton, Modal, type ModalProps, type ModalWait } from '@/core/ui/components/ui/Modal';
import { WAIT_STAGES } from '@/core/utils/waitStages';

export interface DatapackFlowDialogProps {
    title: string;
    /** Start at what goes in it, with no pack type to ask. */
    startsAtPicks?: boolean;
    pack?: PackBeingSaved;
    /** Save As: ask the new pack's name first, starting with this. */
    saveAsName?: string;
    /** A save into the SC's own pack: offer Save As New beside Save. */
    canSaveAsNew?: boolean;
    onClose: () => void;
    /** Start the save with these picks, and Save As's name. Must be stable. */
    onSave: (picks: StorePicks, saveAsName?: string) => void;
}

/** The read of what the screen will show: the store's data to pick from, or ACO's catalog views. */
function waitLines(stage: string): ModalWait {
    return stage === 'aco-views' ? WAIT_STAGES.readingCatalogViews : WAIT_STAGES.readingWhatToSelect;
}

function frameOf(result: ResultContent | null, title: string, stage: string): Pick<ModalProps, 'size' | 'title' | 'status' | 'wide'> {
    if (result) return { size: 'S', title: result.title, status: resultStatus(result) };
    if (stage === 'add-items') return { size: 'L', title: 'Add Unused Items', wide: true };
    // The pick step is the extra-wide step (owner, 2026-11-05): a product's name fits on one line.
    return { size: 'L', title, wide: stage === 'store-picks' };
}

type Footer = Pick<ModalProps, 'actionButtons' | 'startButtons' | 'hideClose'>;

function footerOf(flow: CreateDatapackFlow): Footer {
    if (flow.answers.result) return { actionButtons: [{ label: 'Back', variant: 'secondary', onPress: flow.answers.dismissResult }] };
    const main: ActionButton = { label: flow.main.label, variant: 'accent', onPress: flow.main.onPress, isDisabled: flow.main.isDisabled, isPending: flow.main.isPending };
    // Its Cancel returns to the save, so the dialog's own, which closes it, is left out.
    if (flow.stage === 'add-items') return { hideClose: true, actionButtons: [{ label: 'Cancel', variant: 'secondary', onPress: flow.addItems.cancel }, main] };
    if (flow.fromPack) {
        const count = flow.addItems.count;
        // Branching off into a second pack, beside Save; outlined, as the house's other buttons are (walk F93).
        const saveAsNew: ActionButton[] = flow.canSaveAsNew ? [{ label: 'Save As New', variant: 'secondary', onPress: flow.saveAsNew }] : [];
        return {
            startButtons: [{ label: count > 0 ? `Add Unused Items (${count})` : 'Add Unused Items', variant: 'secondary', onPress: flow.addItems.open }],
            actionButtons: [...saveAsNew, main],
        };
    }
    const back: ActionButton[] = flow.hasSteps ? [{ label: 'Back', variant: 'secondary', onPress: flow.back, isDisabled: !flow.canGoBack }] : [];
    return { actionButtons: [...back, main] };
}

/** The body the stage asks for. */
function StageBody({ flow, pack }: Pick<DatapackFlowDialogProps, 'pack'> & { flow: CreateDatapackFlow }): React.ReactElement {
    const { stage, store, answers } = flow;
    if (stage === 'save-as-name') return <SaveAsNameStage name={flow.saveAsName} onChange={flow.setSaveAsName} intro={pack ? SAVE_AS_INTRO : undefined} />;
    if (stage === 'pack-type') return <PackTypeStage packType={flow.packType} onPick={flow.pickPackType} />;
    if (stage === 'store-picks' || stage === 'add-items') return <StorePicksStage pack={pack} store={store} />;
    if (stage === 'save-confirm' && pack) return <p className="datapack-export-intro">{saveIntro(pack.displayName)}</p>;
    if (stage === 'aco-views') return <AcoViewsStage aco={answers.aco} />;
    if (stage === 'aco-kinds') return <AcoKindsStage aco={answers.aco} />;
    return <PackNameStage answers={answers} />;
}

export function DatapackFlowDialog({ title, startsAtPicks, pack, saveAsName, canSaveAsNew, onClose, onSave }: DatapackFlowDialogProps): React.ReactElement {
    const flow = useCreateDatapackFlow({ startsAtPicks, pack, saveAsName, canSaveAsNew, onSave });
    const { result, savable } = flow.answers;
    return (
        <>
        <DialogContainer onDismiss={onClose}>
            <Modal
                // Save As New from the SC's own pack: the dialog now makes a new pack, and says so.
                {...frameOf(result, pack && flow.savesAs ? 'Save As New Datapack' : title, flow.stage)}
                fitContent
                onClose={onClose}
                closeLabel={result ? 'Close' : 'Cancel'}
                waiting={flow.waiting ? waitLines(flow.stage) : false}
                {...footerOf(flow)}
            >
                <div className="datapack-export-body">
                    {result ? (
                        <ExportDatapackResult result={result} savable={savable} source="library" />
                    ) : (
                        <StageBody flow={flow} pack={pack} />
                    )}
                </div>
            </Modal>
        </DialogContainer>
        </>
    );
}
