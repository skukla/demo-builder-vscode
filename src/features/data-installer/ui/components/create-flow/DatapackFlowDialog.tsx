/**
 * The one dialog behind "Create datapack" and "Save store changes to this pack": a guided
 * point-and-click flow in the style of Add Integration (owner, 2026-11-02: "There's too much text.
 * We should pivot to the approach we use for integrations where we guide the user through point and
 * click."). One question per screen; Close, Back and the main button in the footer. State is in
 * `useCreateDatapackFlow`, and which screens each pack walks in `datapackFlowStages`.
 *
 * Each window is sized to what it shows and keeps that height (owner, 2026-11-11): the questions
 * share one window at the height of the first, and the pick screens, which are wider and much
 * taller, are a window of their own, held at the picks' height from the first frame. A name field
 * is never padded to the height of a two-column list. A result is a new, small window with its
 * outcome as the title. The first
 * read of a list the screen is made of is the window's wait, the store's counts and first kind's
 * list included, so the two columns appear together. A later kind's items read inside their own
 * pane, with the kinds and the buttons still on, since a slow read must not cost what is already
 * selected.
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
import { resultStatus } from '../importResult';
import type { PackBeingSaved } from './datapackFlowStages';
import { PICKS_INTRO, SAVE_AS_INTRO, saveIntro } from './saveWords';
import { AcoKindsStage } from './stages/AcoKindsStage';
import { AcoViewsStage } from './stages/AcoViewsStage';
import { PackNameStage, SaveAsNameStage } from './stages/PackNameStage';
import { PackTypeStage } from './stages/PackTypeStage';
import { StorePicksStage } from './stages/StorePicksStage';
import { type CreateDatapackFlow, useCreateDatapackFlow } from './useCreateDatapackFlow';
import type { ActionButton, ModalWait } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
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

/** The screens that are a window of their own: the picks, wide and much taller than a question. */
function isPicks(stage: string): boolean {
    return stage === 'store-picks' || stage === 'add-items';
}

function frameOf(title: string, stage: string): { title: string; wide: boolean } {
    if (stage === 'add-items') return { title: 'Add Unused Items', wide: true };
    // The pick step is the extra-wide step (owner, 2026-11-05): a product's name fits on one line.
    return { title, wide: stage === 'store-picks' };
}

interface Footer {
    actionButtons: ActionButton[];
    startButtons?: ActionButton[];
    hideClose?: boolean;
}

/**
 * The pick window's room, held from its first frame (the wait included): its intro and its two
 * columns, which take one height whatever is read (`.datapack-picks`).
 */
const PICKS_ROOM = (
    <div className="datapack-export-body">
        <p className="datapack-export-intro">{PICKS_INTRO}</p>
        <div className="datapack-picks" />
    </div>
);

function footerOf(flow: CreateDatapackFlow): Footer {
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
        <DialogContainer onDismiss={onClose}>
            {result ? (
                <ResultWindow
                    title={result.title}
                    status={resultStatus(result)}
                    onClose={onClose}
                    actionButtons={[{ label: 'Back', variant: 'secondary', onPress: flow.answers.dismissResult }]}
                >
                    <div className="datapack-export-body">
                        <ExportDatapackResult result={result} savable={savable} source="library" />
                    </div>
                </ResultWindow>
            ) : (
                <StepsWindow
                    key={isPicks(flow.stage) ? 'picks' : 'questions'}
                    // Save As New from the SC's own pack: the dialog now makes a new pack, and says so.
                    {...frameOf(pack && flow.savesAs ? 'Save As New Datapack' : title, flow.stage)}
                    reserve={isPicks(flow.stage) ? PICKS_ROOM : undefined}
                    onClose={onClose}
                    closeLabel="Cancel"
                    waiting={flow.waiting ? waitLines(flow.stage) : false}
                    {...footerOf(flow)}
                >
                    <div className="datapack-export-body">
                        <StageBody flow={flow} pack={pack} />
                    </div>
                </StepsWindow>
            )}
        </DialogContainer>
    );
}
