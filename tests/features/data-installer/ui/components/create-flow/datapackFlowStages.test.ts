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

const NOTHING: FlowGates = { packTypeChosen: false, canSave: false, viewsChosen: false, kindsChosen: false, named: false };

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
    // Create is two windows (step-04 S3; decisions Phase 7b, J3-2): what it holds, then the name.
    it.each([
        ['store', ['store-picks', 'create-name']],
        ['aco', ['aco-views', 'aco-kinds', 'pack-name']],
    ] as const)('walks the %s route with no pack-type screen in front', (route, order) => {
        expect(stageOrder(route)).toEqual(order);
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

    it('has nothing behind the picks, and the picks behind the name', () => {
        expect(previousStage('store-picks', stageOrder('store'))).toBeNull();
        expect(previousStage('create-name', stageOrder('store'))).toBe('store-picks');
        expect(nextStage('store-picks', stageOrder('store'))).toBe('create-name');
    });
});

describe('the main button', () => {
    it.each([
        ['pack-type', 'continue'],
        ['store-picks', 'next'],
        ['create-name', 'save'],
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

    // The name's rules are Save As New's: Create is on, and a name it refuses says why under the field.
    it('leaves Create on with no name, as Save As New leaves Save', () => {
        expect(canProceed('create-name', NOTHING)).toBe(true);
    });

    // A save from a datapack is its own window (step-04 S2): this flow only creates.
    it('says Next on the picks, and Create for the new pack', () => {
        expect(mainLabel('next')).toBe('Next');
        expect(mainLabel('save')).toBe('Create');
        expect(mainLabel('continue')).toBe('Continue');
        expect(mainLabel('export')).toBe('Export');
    });
});
