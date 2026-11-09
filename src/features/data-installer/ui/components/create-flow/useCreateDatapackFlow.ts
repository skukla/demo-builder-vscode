/**
 * useCreateDatapackFlow: the state of "Create datapack" and "Save store changes to this pack",
 * apart from the view (`DatapackFlowDialog`), as `useIntegrationFlow` is for Add Integration.
 *
 * Holds the pack type and the stage, and works out the rest from `datapackFlowStages`: the route,
 * Back, and the main button. Picks live in `useStorePicks` and the export's answers in
 * `useExportAnswers`, both kept when the SC goes back and forward. Choosing another pack type keeps
 * each route's own answers; nothing is sent until Save or Export.
 *
 * @module features/data-installer/ui/components/create-flow/useCreateDatapackFlow
 */

import { useState } from 'react';
import type { StorePicks } from '../../../pickableKinds';
import {
    canProceed,
    type DatapackFlowStage,
    type DatapackRoute,
    mainActionOf,
    mainLabel,
    nextStage,
    type PackBeingSaved,
    type PackType,
    previousStage,
    routeOf,
    stageOrder,
} from './datapackFlowStages';
import { type ExportAnswers, useExportAnswers } from './useExportAnswers';
import { type StorePicksState, useStorePicks } from './useStorePicks';

export interface CreateDatapackFlowArgs {
    /** Start at what goes in it, with no pack type to ask ("Save store changes to this pack"). */
    startsAtPicks?: boolean;
    /** The pack being saved, which can be saved with nothing picked. */
    pack?: PackBeingSaved;
    /** Save As: ask the new pack's name first, starting with this. */
    saveAsName?: string;
    /** Start the save with these picks, and Save As's name. Must be stable. */
    onSave: (picks: StorePicks, saveAsName?: string) => void;
}

/** The main button, as the footer draws it. */
export interface MainButton {
    label: string;
    isDisabled: boolean;
    isPending: boolean;
    onPress: () => void;
}

export interface CreateDatapackFlow {
    stage: DatapackFlowStage;
    packType?: PackType;
    route?: DatapackRoute;
    canGoBack: boolean;
    back: () => void;
    pickPackType: (packType: PackType) => void;
    main: MainButton;
    store: StorePicksState;
    answers: ExportAnswers;
    /** Save As's name, as typed. */
    saveAsName: string;
    setSaveAsName: (name: string) => void;
    /** The dialog is reading what this screen will show: only the wait and the way out. */
    waiting: boolean;
}

/** What the dialog waits for on a stage. */
function isWaiting(stage: DatapackFlowStage, answers: ExportAnswers, store: StorePicksState): boolean {
    if (stage === 'store-picks') return !store.ready;
    return stage === 'aco-views' && answers.aco.loadingViews;
}

export function useCreateDatapackFlow({ startsAtPicks = false, pack, saveAsName: initialName, onSave }: CreateDatapackFlowArgs): CreateDatapackFlow {
    const savesAs = initialName !== undefined;
    const [saveAsName, setSaveAsName] = useState(initialName ?? '');
    // A Commerce pack, chosen for the SC: ACO packs are held back until ACO support ships (owner,
    // 2026-11-03), so there is no second type to ask about. The ACO line reverts this.
    const [packType, setPackType] = useState<PackType | undefined>('commerce');
    const [stage, setStage] = useState<DatapackFlowStage>(
        () => stageOrder(routeOf('commerce'), startsAtPicks, savesAs)[0] ?? 'pack-type',
    );

    const route = packType && routeOf(packType);
    const order = stageOrder(route, startsAtPicks, savesAs);
    // With a pack, the counts are asked as the flow opens: their read starts the pack's (walk F82).
    const store = useStorePicks(stage === 'store-picks' || pack !== undefined, pack);
    const answers = useExportAnswers(route, stage !== 'pack-type');

    const action = mainActionOf(stage);
    const proceed = (): void => {
        if (action === 'save' && savesAs) onSave(store.picks, saveAsName.trim());
        else if (action === 'save') onSave(store.picks);
        else if (action === 'export') answers.start();
        else setStage(nextStage(stage, order) ?? stage);
    };
    const previous = previousStage(stage, order);
    const back = (): void => setStage(previous ?? stage);

    return {
        stage,
        packType,
        route,
        // Not while an export is running: its answer lands on the screen that asked.
        canGoBack: previous !== null && !answers.running,
        back,
        pickPackType: setPackType,
        main: {
            label: mainLabel(action, startsAtPicks && !savesAs),
            isDisabled: !canProceed(stage, {
                packTypeChosen: packType !== undefined,
                canSave: pack !== undefined || store.count > 0,
                viewsChosen: answers.aco.viewsChosen,
                kindsChosen: answers.aco.pickedKinds.length > 0,
                named: answers.named,
                saveAsNamed: saveAsName.trim() !== '',
            }),
            isPending: action === 'export' && answers.running,
            onPress: proceed,
        },
        store,
        answers,
        saveAsName,
        setSaveAsName,
        waiting: isWaiting(stage, answers, store),
    };
}
