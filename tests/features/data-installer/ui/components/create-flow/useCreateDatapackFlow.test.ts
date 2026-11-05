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

// ACO packs are held back until ACO support ships (owner, 2026-11-03): the flow is a Commerce pack
// from the start, with no pack-type screen. The ACO line reverts this, and its route's tests.
describe('the first screen', () => {
    it.each([
        ['demo-builder', 'store-picks'],
        ['service', 'service-types'],
        [undefined, 'service-types'],
    ] as const)("with the %s engine, starts on the Commerce pack's %s with nothing behind it", async (engine, stage) => {
        const { result } = await flowFor({ engine });

        expect(result.current.packType).toBe('commerce');
        expect(result.current.stage).toBe(stage);
        expect(result.current.canGoBack).toBe(false);
    });
});

describe('the store route', () => {
    async function onThePicks(args: Partial<CreateDatapackFlowArgs> = {}) {
        return flowFor({ engine: 'demo-builder', ...args });
    }

    it('opens a kind where it stands', async () => {
        const { result, step } = await onThePicks();

        await step(() => result.current.store.open('cart_rules'));
        expect(result.current.stage).toBe('store-picks');
        expect(result.current.store.kind).toBe('cart_rules');
    });

    // Owner, 2026-11-05: only the counts hold the dialog; each kind's list loads in its own pane.
    it('waits for the counts alone, and never for a kind\'s list', async () => {
        const counts = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string, payload?: unknown) =>
            type === 'count-datapack-export-items' ? new Promise(() => undefined) : counts?.(type, payload),
        );
        const waitingForCounts = await onThePicks();
        expect(waitingForCounts.result.current.waiting).toBe(true);

        mockRequest.mockImplementation(counts);
        const { result, step } = await onThePicks();
        expect(result.current.waiting).toBe(false);

        await step(() => result.current.store.open('cart_rules'));
        expect(result.current.waiting).toBe(false);
    });

    it('keeps selections across kinds, and saves them all', async () => {
        const { result, step, onSave } = await onThePicks();
        await step(() => result.current.store.open('products'));
        await step(() => result.current.store.setPicked(['VR-Rack', 'Tray']));
        await step(() => result.current.store.open('cart_rules'));
        await step(() => result.current.store.setPicked(['7']));

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

describe("the service's route", () => {
    async function onTheTypes() {
        return flowFor({ engine: 'service' });
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
        await step(() => result.current.answers.types.onToggle('products', true));
        await step(() => result.current.main.onPress());
        await step(() => result.current.back());

        expect(callsOf('list-datapack-data-types')).toHaveLength(1);
        expect(callsOf('get-datapack-import-target')).toHaveLength(1);
    });

    it('reads no store views', async () => {
        await onTheTypes();

        expect(callsOf('list-datapack-import-scopes')).toHaveLength(0);
    });
});
