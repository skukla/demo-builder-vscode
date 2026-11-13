/**
 * Which screens each pack walks, and what turns the main button on. Pure, as `flowStages` is.
 */

import {
    canProceed,
    type FlowGates,
    mainActionOf,
    mainLabel,
    nextStage,
    previousStage,
    routeOf,
    stageOrder,
} from '@/features/data-installer/ui/components/create-flow/datapackFlowStages';

const NOTHING: FlowGates = { packTypeChosen: false, canSave: false, viewsChosen: false, kindsChosen: false, named: false, saveAsNamed: false };

// One route per pack type: the Data Installer service's own export route was deleted on 2026-11-06 (DI-12).
describe('routeOf', () => {
    it.each([
        ['commerce', 'store'],
        ['aco', 'aco'],
    ] as const)('%s takes %s', (packType, route) => {
        expect(routeOf(packType)).toBe(route);
    });
});

describe('stageOrder', () => {
    it('is the pack type alone until one is chosen', () => {
        expect(stageOrder(undefined)).toEqual(['pack-type']);
    });

    // No pack-type screen in front while ACO packs are held back (owner, 2026-11-03); the ACO line
    // reverts this.
    it.each([
        ['store', ['store-picks']],
        ['aco', ['aco-views', 'aco-kinds', 'pack-name']],
    ] as const)('walks the %s route with no pack-type screen in front', (route, order) => {
        expect(stageOrder(route)).toEqual(order);
    });

    // Create Datapack names the new pack first (step-04 S3 turns this round).
    it('asks the name first, then the picks, when named', () => {
        expect(stageOrder('store', true)).toEqual(['save-as-name', 'store-picks']);
    });
});

describe('previousStage and nextStage', () => {
    const order = stageOrder('aco');

    it('walks back to the start and no further', () => {
        expect(previousStage('pack-name', order)).toBe('aco-kinds');
        expect(previousStage('aco-views', order)).toBeNull();
    });

    it('walks on to the end and no further', () => {
        expect(nextStage('aco-views', order)).toBe('aco-kinds');
        expect(nextStage('pack-name', order)).toBeNull();
    });

    it('has nothing behind the picks when they are the start', () => {
        expect(previousStage('store-picks', stageOrder('store'))).toBeNull();
    });
});

describe('the main button', () => {
    it.each([
        ['pack-type', 'continue'],
        ['store-picks', 'save'],
        ['aco-views', 'continue'],
        ['aco-kinds', 'continue'],
        ['pack-name', 'export'],
    ] as const)('on %s does %s', (stage, action) => {
        expect(mainActionOf(stage)).toBe(action);
    });

    it.each([
        ['pack-type', 'packTypeChosen'],
        ['store-picks', 'canSave'],
        ['aco-views', 'viewsChosen'],
        ['aco-kinds', 'kindsChosen'],
        ['pack-name', 'named'],
    ] as const)('on %s waits for %s, and for nothing else', (stage, gate) => {
        expect(canProceed(stage, NOTHING)).toBe(false);
        expect(canProceed(stage, { ...NOTHING, [gate]: true })).toBe(true);
    });

    // A save from a datapack is its own window (step-04 S2): this flow only creates.
    it('says Create for the new pack', () => {
        expect(mainLabel('save')).toBe('Create');
        expect(mainLabel('continue')).toBe('Continue');
        expect(mainLabel('export')).toBe('Export');
    });
});
