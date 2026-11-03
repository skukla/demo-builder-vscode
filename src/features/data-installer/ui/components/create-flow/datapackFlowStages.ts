/**
 * The stages of "Create datapack" (`DatapackFlowDialog`), as data: which screens each kind of
 * pack walks, in what order, what the main button does on each, and what turns it on. No React,
 * as `flowStages.ts` is for Add Integration.
 *
 * | Route | Pack, engine | Screens after the pack type |
 * |---|---|---|
 * | `store` | Commerce, Demo Builder's | the kinds and their items, on one screen |
 * | `aco` | ACO, either | store views, ACO data types, name |
 * | `service` | Commerce, the service's (or none chosen) | data types, name |
 *
 * "Save store changes to this pack" is that one screen, with no pack type to ask.
 *
 * @module features/data-installer/ui/components/create-flow/datapackFlowStages
 */

import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** The two pack types. */
export type PackType = 'commerce' | 'aco';

/** The engine chosen; the service's when absent, as the export was before Demo Builder's had one. */
export type DatapackEngine = 'service' | 'demo-builder';

export type DatapackRoute = 'store' | 'aco' | 'service';

export type DatapackFlowStage =
    | 'pack-type'
    | 'store-picks'
    | 'aco-views'
    | 'aco-kinds'
    | 'service-types'
    | 'pack-name';

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
    typesChosen: boolean;
    named: boolean;
}

const ROUTE_STAGES: Record<DatapackRoute, DatapackFlowStage[]> = {
    store: ['store-picks'],
    aco: ['aco-views', 'aco-kinds', 'pack-name'],
    service: ['service-types', 'pack-name'],
};

const MAIN_ACTIONS: Record<DatapackFlowStage, MainAction> = {
    'pack-type': 'continue',
    'store-picks': 'save',
    'aco-views': 'continue',
    'aco-kinds': 'continue',
    'service-types': 'continue',
    'pack-name': 'export',
};

const GATES: Record<DatapackFlowStage, (gates: FlowGates) => boolean> = {
    'pack-type': (gates) => gates.packTypeChosen,
    'store-picks': (gates) => gates.canSave,
    'aco-views': (gates) => gates.viewsChosen,
    'aco-kinds': (gates) => gates.kindsChosen,
    'service-types': (gates) => gates.typesChosen,
    'pack-name': (gates) => gates.named,
};

/** Which route a pack type takes with the engine chosen. */
export function routeOf(packType: PackType, engine: DatapackEngine | undefined): DatapackRoute {
    if (packType === 'aco') return 'aco';
    return engine === 'demo-builder' ? 'store' : 'service';
}

/**
 * The screens, in order.
 *
 * @param route - the route, once a pack type is chosen
 * @param startsAtPicks - "Save store changes to this pack", which has no pack type to ask
 */
export function stageOrder(route: DatapackRoute | undefined, startsAtPicks: boolean): DatapackFlowStage[] {
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
