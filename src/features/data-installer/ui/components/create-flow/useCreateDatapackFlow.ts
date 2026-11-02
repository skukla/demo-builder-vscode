/**
 * useCreateDatapackFlow: the state of "Create a datapack" and "Save store changes to this pack",
 * apart from the view (`DatapackFlowDialog`), as `useIntegrationFlow` is for Add Integration.
 *
 * Holds the pack type and the stage, and works out the rest from `datapackFlowStages`: the route,
 * Back, and the main button. Picks live in `useStorePicks` and the export's answers in
 * `useExportAnswers`, both kept when the SC goes back and forward. Choosing another pack type keeps
 * each route's own answers; nothing is sent until Save or Export.
 *
 * A read that finds nothing to pick returns to the cards, where that kind is now greyed out with
 * the reason: the card is the answer, in place of a screen with nothing on it.
 *
 * @module features/data-installer/ui/components/create-flow/useCreateDatapackFlow
 */

import { useCallback, useState } from 'react';
import type { PickableKind, StoreItemPage, StorePicks } from '../../../pickableKinds';
import {
    canProceed,
    type DatapackEngine,
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
import { hasNothingToPick, type StorePicksState, useStorePicks } from './useStorePicks';

export interface CreateDatapackFlowArgs {
    engine?: DatapackEngine;
    /** Start at what goes in it, with no pack type to ask ("Save store changes to this pack"). */
    startsAtPicks?: boolean;
    /** The pack being saved, which can be saved with nothing picked. */
    pack?: PackBeingSaved;
    /** Start the save with these picks. Must be stable. */
    onSave: (picks: StorePicks) => void;
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
    /** Open a kind's items. */
    openKind: (kind: PickableKind) => void;
    /** A kind's read answered: its page, or null when it failed. Stable. */
    kindAnswered: (kind: PickableKind, page: StoreItemPage | null) => void;
    answers: ExportAnswers;
    /** The dialog is reading what this screen will show: only the wait and the way out. */
    waiting: boolean;
    /** This screen's own read is running, with its buttons kept, so the box stays as it was. */
    holdSize: boolean;
}

/** What the dialog waits for on a stage. */
function isWaiting(stage: DatapackFlowStage, answers: ExportAnswers): boolean {
    if (stage === 'service-types') return answers.types.loading;
    return stage === 'aco-views' && answers.aco.loadingViews;
}

export function useCreateDatapackFlow({ engine, startsAtPicks = false, pack, onSave }: CreateDatapackFlowArgs): CreateDatapackFlow {
    const [packType, setPackType] = useState<PackType | undefined>(startsAtPicks ? 'commerce' : undefined);
    const [stage, setStage] = useState<DatapackFlowStage>(startsAtPicks ? 'store-kinds' : 'pack-type');

    const route = packType && routeOf(packType, engine);
    const order = stageOrder(route, startsAtPicks);
    const store = useStorePicks(stage === 'store-kinds', pack);
    const answers = useExportAnswers(route, stage !== 'pack-type');
    const { open, answered } = store;

    const openKind = useCallback((kind: PickableKind): void => {
        open(kind);
        setStage('store-items');
    }, [open]);
    const kindAnswered = useCallback((kind: PickableKind, page: StoreItemPage | null): void => {
        answered(kind, page);
        if (hasNothingToPick(page)) setStage('store-kinds');
    }, [answered]);

    const action = mainActionOf(stage);
    const proceed = (): void => {
        if (action === 'save') onSave(store.picks);
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
            label: mainLabel(action, store.count),
            isDisabled: !canProceed(stage, {
                packTypeChosen: packType !== undefined,
                canSave: pack !== undefined || store.count > 0,
                viewsChosen: answers.aco.viewsChosen,
                kindsChosen: answers.aco.pickedKinds.length > 0,
                typesChosen: answers.types.selected.length > 0,
                named: answers.named,
            }),
            isPending: action === 'export' && answers.running,
            onPress: proceed,
        },
        store,
        openKind,
        kindAnswered,
        answers,
        waiting: isWaiting(stage, answers),
        holdSize: stage === 'store-items' && store.reads[store.kind] === undefined,
    };
}
