/**
 * The stages of "Create datapack" (`DatapackFlowDialog`), as data: which screens each kind of
 * pack walks, in what order, what the main button does on each, and what turns it on. No React,
 * as `flowStages.ts` is for Add Integration.
 *
 * | Route | Pack | Screens after the pack type |
 * |---|---|---|
 * | `store` | Commerce | the kinds and their items, on one screen |
 * | `aco` | ACO | store views, ACO data types, name |
 *
 * The Data Installer service's own export route (data types, name, into its shared catalog) was
 * deleted on 2026-11-06 with its engine (DI-12): Save As, then Copy to the Data Installer.
 *
 * Save is that one screen, with no pack type to ask. Save As (`savesAs`) asks the new pack's name
 * first, then that screen (`.rptc/plans/datapack-save-as/`).
 *
 * @module features/data-installer/ui/components/create-flow/datapackFlowStages
 */

import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** The two pack types. */
export type PackType = 'commerce' | 'aco';

export type DatapackRoute = 'store' | 'aco';

export type DatapackFlowStage =
    | 'pack-type'
    | 'store-picks'
    | 'aco-views'
    | 'aco-kinds'
    | 'pack-name'
    | 'save-as-name';

/** What the main button does on a stage. */
export type MainAction = 'continue' | 'save' | 'export';

/** The pack being saved, when the save is of one Demo Builder installed. */
export interface PackBeingSaved {
    id: DatapackId;
    displayName: string;
    source: DatapackStoreName;
}

/** What each stage's main button waits for. */
export interface FlowGates {
    packTypeChosen: boolean;
    /** Something is picked, or a pack is being saved, which can be saved with nothing picked. */
    canSave: boolean;
    viewsChosen: boolean;
    kindsChosen: boolean;
    named: boolean;
    /** Save As's name is typed. */
    saveAsNamed: boolean;
}

const ROUTE_STAGES: Record<DatapackRoute, DatapackFlowStage[]> = {
    store: ['store-picks'],
    aco: ['aco-views', 'aco-kinds', 'pack-name'],
};

const MAIN_ACTIONS: Record<DatapackFlowStage, MainAction> = {
    'pack-type': 'continue',
    'store-picks': 'save',
    'aco-views': 'continue',
    'aco-kinds': 'continue',
    'pack-name': 'export',
    'save-as-name': 'continue',
};

const GATES: Record<DatapackFlowStage, (gates: FlowGates) => boolean> = {
    'pack-type': (gates) => gates.packTypeChosen,
    'store-picks': (gates) => gates.canSave,
    'aco-views': (gates) => gates.viewsChosen,
    'aco-kinds': (gates) => gates.kindsChosen,
    'pack-name': (gates) => gates.named,
    'save-as-name': (gates) => gates.saveAsNamed,
};

/** Which route a pack type takes. */
export function routeOf(packType: PackType): DatapackRoute {
    return packType === 'aco' ? 'aco' : 'store';
}

/**
 * The screens, in order.
 *
 * @param route - the route, once a pack type is chosen
 * @param startsAtPicks - Save, which has no pack type to ask
 * @param savesAs - Save As: the new pack's name, then what goes in it
 */
export function stageOrder(route: DatapackRoute | undefined, startsAtPicks: boolean, savesAs = false): DatapackFlowStage[] {
    if (savesAs) return ['save-as-name', ...ROUTE_STAGES.store];
    if (startsAtPicks) return ROUTE_STAGES.store;
    // No pack-type screen while ACO packs are held back (owner, 2026-11-03): Commerce is the one
    // type. The ACO line reverts this, and the screen asks again.
    return route ? ROUTE_STAGES[route] : ['pack-type'];
}

export function previousStage(stage: DatapackFlowStage, order: readonly DatapackFlowStage[]): DatapackFlowStage | null {
    return order[order.indexOf(stage) - 1] ?? null;
}

export function nextStage(stage: DatapackFlowStage, order: readonly DatapackFlowStage[]): DatapackFlowStage | null {
    return order[order.indexOf(stage) + 1] ?? null;
}

export function mainActionOf(stage: DatapackFlowStage): MainAction {
    return MAIN_ACTIONS[stage];
}

export function canProceed(stage: DatapackFlowStage, gates: FlowGates): boolean {
    return GATES[stage](gates);
}

/**
 * The main button's words.
 *
 * @param savesExisting - a new version of a pack, so Save; otherwise the store's save makes one, so Create
 */
export function mainLabel(action: MainAction, savesExisting: boolean): string {
    if (action === 'continue') return 'Continue';
    if (action === 'export') return 'Export';
    return savesExisting ? 'Save' : 'Create';
}
