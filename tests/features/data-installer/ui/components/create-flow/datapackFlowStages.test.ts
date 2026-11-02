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

const NOTHING: FlowGates = { packTypeChosen: false, canSave: false, viewsChosen: false, kindsChosen: false, typesChosen: false, named: false };

describe('routeOf', () => {
    it.each([
        ['commerce', 'demo-builder', 'store'],
        ['commerce', 'service', 'service'],
        ['commerce', undefined, 'service'],
        ['aco', 'demo-builder', 'aco'],
        ['aco', 'service', 'aco'],
        ['aco', undefined, 'aco'],
    ] as const)('%s with the %s engine takes %s', (packType, engine, route) => {
        expect(routeOf(packType, engine)).toBe(route);
    });
});

describe('stageOrder', () => {
    it('is the pack type alone until one is chosen', () => {
        expect(stageOrder(undefined, false)).toEqual(['pack-type']);
    });

    it.each([
        ['store', ['pack-type', 'store-picks']],
        ['aco', ['pack-type', 'aco-views', 'aco-kinds', 'pack-name']],
        ['service', ['pack-type', 'service-types', 'pack-name']],
    ] as const)('walks the %s route', (route, order) => {
        expect(stageOrder(route, false)).toEqual(order);
    });

    it('starts at the picks with no pack type to ask', () => {
        expect(stageOrder('store', true)).toEqual(['store-picks']);
    });
});

describe('previousStage and nextStage', () => {
    const order = stageOrder('aco', false);

    it('walks back to the start and no further', () => {
        expect(previousStage('pack-name', order)).toBe('aco-kinds');
        expect(previousStage('pack-type', order)).toBeNull();
    });

    it('walks on to the end and no further', () => {
        expect(nextStage('pack-type', order)).toBe('aco-views');
        expect(nextStage('pack-name', order)).toBeNull();
    });

    it('has nothing behind the picks when they are the start', () => {
        expect(previousStage('store-picks', stageOrder('store', true))).toBeNull();
    });
});

describe('the main button', () => {
    it.each([
        ['pack-type', 'continue'],
        ['store-picks', 'save'],
        ['aco-views', 'continue'],
        ['aco-kinds', 'continue'],
        ['service-types', 'continue'],
        ['pack-name', 'export'],
    ] as const)('on %s does %s', (stage, action) => {
        expect(mainActionOf(stage)).toBe(action);
    });

    it.each([
        ['pack-type', 'packTypeChosen'],
        ['store-picks', 'canSave'],
        ['aco-views', 'viewsChosen'],
        ['aco-kinds', 'kindsChosen'],
        ['service-types', 'typesChosen'],
        ['pack-name', 'named'],
    ] as const)('on %s waits for %s, and for nothing else', (stage, gate) => {
        expect(canProceed(stage, NOTHING)).toBe(false);
        expect(canProceed(stage, { ...NOTHING, [gate]: true })).toBe(true);
    });

    it('says Save for a new version of a pack, and Create for a new one', () => {
        expect(mainLabel('save', true)).toBe('Save');
        expect(mainLabel('save', false)).toBe('Create');
        expect(mainLabel('continue', false)).toBe('Continue');
        expect(mainLabel('export', false)).toBe('Export');
    });
});
