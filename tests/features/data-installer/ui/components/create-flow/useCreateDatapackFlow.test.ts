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


const NO_NAMES: readonly string[] = [];

async function flowFor(args: Partial<CreateDatapackFlowArgs> = {}) {
    const onSave = jest.fn();
    const { result } = renderHook(() => useCreateDatapackFlow({ onSave, ownNames: NO_NAMES, ...args }));
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

    it('keeps selections across kinds, and hands them all to Create', async () => {
        const { result, step, onSave } = await onThePicks();
        await step(() => void result.current.store.selectEverything(false));
        await step(() => result.current.store.open('products'));
        await step(() => result.current.store.setPicked(['VR-Rack', 'Tray']));
        await step(() => result.current.store.open('cart_rules'));
        await step(() => result.current.store.setPicked(['7']));

        expect(result.current.stage).toBe('store-picks');
        expect(result.current.main).toMatchObject({ label: 'Next', isDisabled: false });

        await step(() => result.current.main.onPress());
        await step(() => result.current.setName('Hand Built'));
        await step(() => result.current.main.onPress());

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack', 'Tray'], cart_rules: ['7'] }, 'Hand Built');
    });

    // Overview 7b: Create Datapack's picker starts with everything ticked, so Next is on at once.
    it('starts with everything ticked, and has Next off once nothing is', async () => {
        const { result, step } = await onThePicks();
        expect(result.current.store.everything.all).toBe(true);
        expect(result.current.main).toMatchObject({ label: 'Next', isDisabled: false });

        await step(() => void result.current.store.selectEverything(false));
        expect(result.current.main).toMatchObject({ label: 'Next', isDisabled: true });

        await step(() => result.current.store.setPicked(['VR-Rack']));
        expect(result.current.main).toMatchObject({ label: 'Next', isDisabled: false });
    });

    // Everything ticked is the kind-level "all": nothing is read for it until Next needs the ids.
    it('reads no kind for everything ticked until Next, then reads each one not yet read', async () => {
        const answering = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string, payload?: { dataType?: string }) => {
            if (type !== 'list-datapack-export-items') return answering?.(type, payload);
            return { success: true, data: payload?.dataType === 'products' ? PAGE : NONE };
        });
        const { result, step, onSave } = await onThePicks();
        const lists = () => mockRequest.mock.calls.filter((call) => call[0] === 'list-datapack-export-items');
        expect(lists()).toHaveLength(0);

        await step(() => result.current.main.onPress());
        expect(result.current.stage).toBe('create-name');
        expect(lists()).toHaveLength(10);

        await step(() => result.current.setName('Everything'));
        await step(() => result.current.main.onPress());
        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'] }, 'Everything');
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

// Create's second window (step-04 S3; decisions Phase 7b, J3-2): the name, with Back, Cancel and Create.
describe('naming the new pack', () => {
    async function onTheName(ownNames: readonly string[] = NO_NAMES) {
        const flow = await flowFor({ ownNames });
        await flow.step(() => void flow.result.current.store.selectEverything(false));
        await flow.step(() => flow.result.current.store.setPicked(['VR-Rack']));
        await flow.step(() => flow.result.current.main.onPress());
        return flow;
    }

    it('comes after the picks, with the picks behind it and Create on', async () => {
        const { result } = await onTheName();

        expect(result.current.stage).toBe('create-name');
        expect(result.current.name).toBe('');
        expect(result.current.canGoBack).toBe(true);
        expect(result.current.main).toMatchObject({ label: 'Create', isDisabled: false });
    });

    it('goes back to the picks with them kept', async () => {
        const { result, step } = await onTheName();

        await step(() => result.current.back());

        expect(result.current.stage).toBe('store-picks');
        expect(result.current.store.picks).toEqual({ products: ['VR-Rack'] });
    });

    it('hands the picks and the name, trimmed, to Create', async () => {
        const { result, step, onSave } = await onTheName();
        await step(() => result.current.setName('  Hand Built '));

        await step(() => result.current.main.onPress());

        expect(onSave).toHaveBeenCalledWith({ products: ['VR-Rack'] }, 'Hand Built');
    });

    // Save As New's rules (`nameProblem`): an empty name, or one of the SC's own, is refused on screen.
    it.each([
        ['', 'Give it a name.'],
        ['my luma', 'You already have a datapack named my luma.'],
    ])('refuses "%s", saying why, and starts nothing', async (name, problem) => {
        const { result, step, onSave } = await onTheName(['My Luma']);
        await step(() => result.current.setName(name));

        await step(() => result.current.main.onPress());

        expect(result.current.nameError).toBe(problem);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('clears the refusal as the name changes', async () => {
        const { result, step } = await onTheName();
        await step(() => result.current.main.onPress());

        await step(() => result.current.setName('H'));

        expect(result.current.nameError).toBeUndefined();
    });
});
