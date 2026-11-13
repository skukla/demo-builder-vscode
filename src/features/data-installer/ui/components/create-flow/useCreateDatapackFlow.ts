/**
 * useCreateDatapackFlow: the state of Create Datapack, apart from the view (`DatapackFlowDialog`), as
 * `useIntegrationFlow` is for Add Integration.
 *
 * Holds the pack type and the stage, and works out the rest from `datapackFlowStages`: the route,
 * Back, and the main button. Picks live in `useStorePicks` and the export's answers in
 * `useExportAnswers`, both kept when the SC goes back and forward. Choosing another pack type keeps
 * each route's own answers; nothing is sent until Create or Export.
 *
 * Create is two windows (step-04 S3; decisions Phase 7b, J3-2): the picks, then the name. Next reads
 * the kinds ticked whole that are not read yet, since the save takes ids, and goes on only when
 * something is left to hand on. The name follows Save As New's rules (`nameProblem`): Create is on,
 * and a name it refuses says why under the field.
 *
 * @module features/data-installer/ui/components/create-flow/useCreateDatapackFlow
 */

import { useMemo, useState } from 'react';
import { type StorePicks, pickCount } from '../../../pickableKinds';
import { longestNameProblem, nameProblem } from '../../../saveAsName';
import {
    canProceed,
    type DatapackFlowStage,
    type DatapackRoute,
    mainActionOf,
    mainLabel,
    nextStage,
    type PackType,
    previousStage,
    routeOf,
    stageOrder,
} from './datapackFlowStages';
import { type ExportAnswers, useExportAnswers } from './useExportAnswers';
import { type StorePicksState, useStorePicks } from './useStorePicks';

export interface CreateDatapackFlowArgs {
    /** The SC's own datapacks' names, which a new one may not take. Must be stable. */
    ownNames: readonly string[];
    /** Start the save with these picks, and the new pack's name. */
    onSave: (picks: StorePicks, name: string) => void;
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
    /** The new pack's name, as typed. */
    name: string;
    setName: (name: string) => void;
    /** Why Create refused the name; none until it does, and none once the name changes. */
    nameError?: string;
    /** The longest refusal the name could get: the room kept under the field. */
    nameRoom: string;
    /** The dialog is reading what this screen will show: only the wait and the way out. */
    waiting: boolean;
}

/** What the dialog waits for on a stage. */
function isWaiting(stage: DatapackFlowStage, answers: ExportAnswers, store: StorePicksState): boolean {
    if (stage === 'store-picks') return !store.ready;
    return stage === 'aco-views' && answers.aco.loadingViews;
}

/** The name, its refusal, and the room kept for one. */
function useNewName(ownNames: readonly string[]) {
    const [name, setTyped] = useState('');
    const [error, setError] = useState<string | undefined>(undefined);
    const room = useMemo(() => longestNameProblem(ownNames), [ownNames]);
    const setName = (next: string): void => {
        setTyped(next);
        setError(undefined);
    };
    /** The name to create under, or none when it is refused (saying why). */
    const accepted = (): string | undefined => {
        const problem = nameProblem(name, ownNames);
        setError(problem);
        return problem ? undefined : name.trim();
    };
    return { name, setName, error, room, accepted };
}

export function useCreateDatapackFlow({ ownNames, onSave }: CreateDatapackFlowArgs): CreateDatapackFlow {
    const newName = useNewName(ownNames);
    // A Commerce pack, chosen for the SC: ACO packs are held back until ACO support ships (owner,
    // 2026-11-03), so there is no second type to ask about. The ACO line reverts this.
    const [packType, setPackType] = useState<PackType | undefined>('commerce');
    const [stage, setStage] = useState<DatapackFlowStage>(() => stageOrder(routeOf('commerce'))[0] ?? 'pack-type');
    const [reading, setReading] = useState(false);

    const route = packType && routeOf(packType);
    const order = stageOrder(route);
    const store = useStorePicks(stage === 'store-picks');
    const answers = useExportAnswers(route, stage !== 'pack-type');

    const action = mainActionOf(stage);
    const goOn = (): void => setStage(nextStage(stage, order) ?? stage);
    const next = async (): Promise<void> => {
        setReading(true);
        try {
            if (pickCount(await store.readWhole()) > 0) goOn();
        } finally {
            setReading(false);
        }
    };
    const proceed = (): void => {
        const name = action === 'save' ? newName.accepted() : undefined;
        if (name !== undefined) onSave(store.picks, name);
        else if (action === 'next') void next();
        else if (action === 'export') answers.start();
        else if (action === 'continue') goOn();
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
            label: mainLabel(action),
            isDisabled: !canProceed(stage, {
                packTypeChosen: packType !== undefined,
                canSave: store.everything.some,
                viewsChosen: answers.aco.viewsChosen,
                kindsChosen: answers.aco.pickedKinds.length > 0,
                named: answers.named,
            }),
            isPending: (action === 'export' && answers.running) || (action === 'next' && reading),
            onPress: proceed,
        },
        store,
        answers,
        name: newName.name,
        setName: newName.setName,
        ...(newName.error ? { nameError: newName.error } : {}),
        nameRoom: newName.room,
        waiting: isWaiting(stage, answers, store),
    };
}
