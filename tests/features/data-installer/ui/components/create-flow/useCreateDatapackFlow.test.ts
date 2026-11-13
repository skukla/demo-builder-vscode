/**
 * The flow's state, apart from the view: stages, Back and forward, picks kept, the gates, and which
 * route each pack type takes. The reads are driven through the real request hook and a
 * mocked client; a kind's read belongs to its screen (`StoreItemsStage`), so here its answer is
 * reported as that screen reports it.
 */

import '../../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { settle } from '../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { StoreItemPage } from '@/features/data-installer/pickableKinds';
import { type CreateDatapackFlowArgs, useCreateDatapackFlow } from '@/features/data-installer/ui/components/create-flow/useCreateDatapackFlow';
import type { TargetWebsite } from '@/features/data-installer/ui/hooks/useAcoExportChoice';

const mockRequest = webviewClient.request as jest.Mock;

const PAGE: StoreItemPage = { items: [{ id: 'VR-Rack', displayName: 'VR Rack', key: 'VR-Rack' }], totalCount: 1, excludedCount: 0, inPackCount: 0 };
const NONE: StoreItemPage = { items: [], totalCount: 0, excludedCount: 0, inPackCount: 0 };
const WEBSITES: TargetWebsite[] = [{ code: 'base', name: 'Main Website', storeViews: [{ code: 'default', name: 'Default' }, { code: 'fr', name: 'French' }] }];


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
        if (type === 'list-datapack-import-scopes') return { success: true, data: { websites: WEBSITES } };
        if (type === 'start-datapack-export') return new Promise(() => undefined);
        return { success: true, data: null };
    });
});

// ACO packs are held back until ACO support ships (owner, 2026-11-03): the flow is a Commerce pack
// from the start, with no pack-type screen. The ACO line reverts this, and its route's tests.
describe('the first screen', () => {
    it("starts on the Commerce pack's picks with nothing behind it", async () => {
        const { result } = await flowFor({});

        expect(result.current.packType).toBe('commerce');
        expect(result.current.stage).toBe('store-picks');
        expect(result.current.canGoBack).toBe(false);
    });
});

describe('the store route', () => {
    async function onThePicks(args: Partial<CreateDatapackFlowArgs> = {}) {
        return flowFor(args);
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

// Create Datapack, as the header opens it: the name, then the picks (step-04 S3 turns this round).
describe('naming the new pack first', () => {
    it('waits for a name, then goes on to the picks with the name behind them', async () => {
        const { result, step } = await flowFor({ saveAsName: '' });
        expect(result.current.stage).toBe('save-as-name');
        expect(result.current.main).toMatchObject({ label: 'Continue', isDisabled: true });

        await step(() => result.current.setSaveAsName('Hand Built'));
        await step(() => result.current.main.onPress());

        expect(result.current.stage).toBe('store-picks');
        expect(result.current.canGoBack).toBe(true);
    });

    it('hands the picks and the name, trimmed, to Create', async () => {
        const { result, step, onSave } = await flowFor({ saveAsName: '' });
        await step(() => result.current.setSaveAsName('  Hand Built '));
        await step(() => result.current.main.onPress());
        await step(() => result.current.store.setPicked(['VR-Rack']));

        await step(() => result.current.main.onPress());

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'] }, 'Hand Built');
    });
});

