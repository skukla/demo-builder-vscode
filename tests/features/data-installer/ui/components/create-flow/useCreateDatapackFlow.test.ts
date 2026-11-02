/**
 * The flow's state, apart from the view: stages, Back and forward, picks kept, the gates, and which
 * route each engine and pack type takes. The reads are driven through the real request hook and a
 * mocked client; a kind's read belongs to its screen (`StoreItemsStage`), so here its answer is
 * reported as that screen reports it.
 */

import '../../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { settle } from '../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { StoreItemPage } from '@/features/data-installer/pickableKinds';
import type { PackBeingSaved } from '@/features/data-installer/ui/components/create-flow/datapackFlowStages';
import { type CreateDatapackFlowArgs, useCreateDatapackFlow } from '@/features/data-installer/ui/components/create-flow/useCreateDatapackFlow';
import type { TargetWebsite } from '@/features/data-installer/ui/hooks/useImportScopes';

const mockRequest = webviewClient.request as jest.Mock;

const PAGE: StoreItemPage = { items: [{ id: 'VR-Rack', displayName: 'VR Rack', key: 'VR-Rack' }], totalCount: 1, excludedCount: 0, inPackCount: 0 };
const NONE: StoreItemPage = { items: [], totalCount: 0, excludedCount: 0, inPackCount: 0 };
const PACK: PackBeingSaved = { id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', source: 'library' };
const WEBSITES: TargetWebsite[] = [{ code: 'base', name: 'Main Website', storeViews: [{ code: 'default', name: 'Default' }, { code: 'fr', name: 'French' }] }];

const callsOf = (type: string) => mockRequest.mock.calls.filter((c) => c[0] === type);

async function flowFor(args: Partial<CreateDatapackFlowArgs> = {}) {
    const onSave = jest.fn();
    const { result } = renderHook(() => useCreateDatapackFlow({ onSave, ...args }));
    await settle();
    /** Do something, then let what it asked for answer. */
    const step = async (action: () => void): Promise<void> => {
        act(action);
        await settle();
    };
    return { result, step, onSave };
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'list-datapack-data-types') return { success: true, data: { dataTypes: ['categories', 'products'] } };
        if (type === 'get-datapack-import-target') return { success: true, data: { instance: 'inst-1' } };
        if (type === 'list-datapack-import-scopes') return { success: true, data: { websites: WEBSITES } };
        if (type === 'start-datapack-export') return new Promise(() => undefined);
        return { success: true, data: null };
    });
});

describe('the first screen', () => {
    it('starts there with Back and Continue off, reading nothing', async () => {
        const { result } = await flowFor({ engine: 'demo-builder' });

        expect(result.current.stage).toBe('pack-type');
        expect(result.current.canGoBack).toBe(false);
        expect(result.current.main).toMatchObject({ label: 'Continue', isDisabled: true });
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('turns Continue on once a pack type is chosen, and still reads nothing', async () => {
        const { result, step } = await flowFor();

        await step(() => result.current.pickPackType('aco'));

        expect(result.current.main.isDisabled).toBe(false);
        expect(result.current.stage).toBe('pack-type');
        expect(mockRequest).not.toHaveBeenCalled();
    });
});

describe('which route each engine and pack type takes', () => {
    it.each([
        ['commerce', 'demo-builder', 'store-picks'],
        ['commerce', 'service', 'service-types'],
        ['commerce', undefined, 'service-types'],
        ['aco', 'demo-builder', 'aco-views'],
        ['aco', 'service', 'aco-views'],
    ] as const)('%s with the %s engine goes on to %s', async (packType, engine, stage) => {
        const { result, step } = await flowFor({ engine });

        await step(() => result.current.pickPackType(packType));
        await step(() => result.current.main.onPress());

        expect(result.current.stage).toBe(stage);
    });
});

describe('the store route', () => {
    async function onThePicks(args: Partial<CreateDatapackFlowArgs> = {}) {
        const flow = await flowFor({ engine: 'demo-builder', ...args });
        await flow.step(() => flow.result.current.pickPackType('commerce'));
        await flow.step(() => flow.result.current.main.onPress());
        return flow;
    }

    it('opens a kind where it stands, and goes back to the first screen', async () => {
        const { result, step } = await onThePicks();

        await step(() => result.current.store.open('cart_rules'));
        expect(result.current.stage).toBe('store-picks');
        expect(result.current.store.kind).toBe('cart_rules');

        await step(() => result.current.back());
        expect(result.current.stage).toBe('pack-type');
        expect(result.current.packType).toBe('commerce');
    });

    it('waits for the first kind, and never again for another', async () => {
        const { result, step } = await onThePicks();
        expect(result.current.waiting).toBe(true);

        await step(() => result.current.store.answered('products', PAGE));
        expect(result.current.waiting).toBe(false);

        await step(() => result.current.store.open('cart_rules'));
        expect(result.current.waiting).toBe(false);
    });

    it('keeps selections across kinds, through the first screen and back, and saves them all', async () => {
        const { result, step, onSave } = await onThePicks();
        await step(() => result.current.store.open('products'));
        await step(() => result.current.store.setPicked(['VR-Rack', 'Tray']));
        await step(() => result.current.store.open('cart_rules'));
        await step(() => result.current.store.setPicked(['7']));
        await step(() => result.current.back());
        await step(() => result.current.main.onPress());

        expect(result.current.stage).toBe('store-picks');
        expect(result.current.main).toMatchObject({ label: 'Create', isDisabled: false });

        await step(() => result.current.main.onPress());

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Tray'], cart_rules: ['7'] });
    });

    it('has the main button off until something is selected', async () => {
        const { result, step } = await onThePicks();
        expect(result.current.main).toMatchObject({ label: 'Create', isDisabled: true });

        await step(() => result.current.store.setPicked(['VR-Rack']));
        expect(result.current.main).toMatchObject({ label: 'Create', isDisabled: false });
    });

    it('moves to the next kind when a read leaves nothing to select, and keeps the answer', async () => {
        const { result, step } = await onThePicks();
        await step(() => result.current.store.open('giftcards'));

        await step(() => result.current.store.answered('giftcards', NONE));

        expect(result.current.stage).toBe('store-picks');
        expect(result.current.store.kind).toBe('categories');
        expect(result.current.store.reads.giftcards).toEqual(NONE);
    });

    it('stays on a kind whose read failed, and forgets the failure on the next open', async () => {
        const { result, step } = await onThePicks();
        await step(() => result.current.store.open('products'));

        await step(() => result.current.store.answered('products', null));
        expect(result.current.store.kind).toBe('products');

        await step(() => result.current.store.open('products'));

        expect(result.current.store.reads.products).toBeUndefined();
    });

    it('keeps a good answer on the next open', async () => {
        const { result, step } = await onThePicks();
        await step(() => result.current.store.open('products'));
        await step(() => result.current.store.answered('products', PAGE));

        await step(() => result.current.store.open('products'));

        expect(result.current.store.reads.products).toEqual(PAGE);
    });
});

describe('starting at the picks', () => {
    it('has nothing behind the picks and no pack type to ask', async () => {
        const { result } = await flowFor({ engine: 'demo-builder', startsAtPicks: true });

        expect(result.current.stage).toBe('store-picks');
        expect(result.current.route).toBe('store');
        expect(result.current.canGoBack).toBe(false);
    });

    it('can save a pack with nothing picked, and a store only with something picked', async () => {
        const held = await flowFor({ engine: 'demo-builder', startsAtPicks: true, pack: PACK });
        expect(held.result.current.main.isDisabled).toBe(false);

        const alone = await flowFor({ engine: 'demo-builder', startsAtPicks: true });
        expect(alone.result.current.main.isDisabled).toBe(true);
    });
});

describe('the ACO route', () => {
    async function onTheViews() {
        const flow = await flowFor({ engine: 'service' });
        await flow.step(() => flow.result.current.pickPackType('aco'));
        await flow.step(() => flow.result.current.main.onPress());
        return flow;
    }

    it('walks store views, kinds and name, ending in Export', async () => {
        const { result, step } = await onTheViews();
        expect(result.current.stage).toBe('aco-views');

        await step(() => result.current.main.onPress());
        expect(result.current.stage).toBe('aco-kinds');

        await step(() => result.current.main.onPress());
        expect(result.current.stage).toBe('pack-name');
        expect(result.current.main).toMatchObject({ label: 'Export', isDisabled: true });
    });

    it('waits on the store views until they have answered, from the first frame', async () => {
        mockRequest.mockImplementation(() => new Promise(() => undefined));
        const { result, step } = await flowFor();
        await step(() => result.current.pickPackType('aco'));
        expect(result.current.waiting).toBe(false);

        await step(() => result.current.main.onPress());

        expect(result.current.stage).toBe('aco-views');
        expect(result.current.waiting).toBe(true);
    });

    it('gates each screen on its own answer', async () => {
        const { result, step } = await onTheViews();
        await step(() => result.current.answers.aco.toggleView('default', false));
        await step(() => result.current.answers.aco.toggleView('fr', false));
        expect(result.current.main.isDisabled).toBe(true);

        await step(() => result.current.answers.aco.toggleView('fr', true));
        await step(() => result.current.main.onPress());
        expect(result.current.main.isDisabled).toBe(false);
    });

    it('reads the store views once through Back and forward, keeping what was turned off', async () => {
        const { result, step } = await onTheViews();
        await step(() => result.current.answers.aco.toggleView('fr', false));
        await step(() => result.current.back());
        await step(() => result.current.main.onPress());

        expect(callsOf('list-datapack-import-scopes')).toHaveLength(1);
        expect(result.current.answers.aco.pickedViews).toEqual(['default']);
    });

    it('keeps Back off and the button pending while the export runs', async () => {
        const { result, step } = await onTheViews();
        await step(() => result.current.main.onPress());
        await step(() => result.current.main.onPress());
        await step(() => {
            result.current.answers.setName('aco_acme');
            result.current.answers.setVersion('main');
        });
        expect(result.current.canGoBack).toBe(true);

        await step(() => result.current.main.onPress());

        expect(callsOf('start-datapack-export')[0][1]).toEqual({ datapackName: 'aco_acme', version: 'main', aco: true });
        expect(result.current.main.isPending).toBe(true);
        expect(result.current.canGoBack).toBe(false);
    });
});

describe("the service's route", () => {
    async function onTheTypes() {
        const flow = await flowFor({ engine: 'service' });
        await flow.step(() => flow.result.current.pickPackType('commerce'));
        await flow.step(() => flow.result.current.main.onPress());
        return flow;
    }

    it('gates the types on one chosen, then the name on both fields', async () => {
        const { result, step } = await onTheTypes();
        expect(result.current.main).toMatchObject({ label: 'Continue', isDisabled: true });

        await step(() => result.current.answers.types.onToggle('products', true));
        expect(result.current.main.isDisabled).toBe(false);

        await step(() => result.current.main.onPress());
        expect(result.current.stage).toBe('pack-name');
        expect(result.current.main).toMatchObject({ label: 'Export', isDisabled: true });

        await step(() => result.current.answers.setName('pack'));
        expect(result.current.main.isDisabled).toBe(true);

        await step(() => result.current.answers.setVersion('v1'));
        expect(result.current.main.isDisabled).toBe(false);
    });

    it('reads the types and the target once, whichever way the SC walks', async () => {
        const { result, step } = await onTheTypes();
        await step(() => result.current.back());
        await step(() => result.current.main.onPress());

        expect(callsOf('list-datapack-data-types')).toHaveLength(1);
        expect(callsOf('get-datapack-import-target')).toHaveLength(1);
    });

    it('reads no store views', async () => {
        await onTheTypes();

        expect(callsOf('list-datapack-import-scopes')).toHaveLength(0);
    });
});
