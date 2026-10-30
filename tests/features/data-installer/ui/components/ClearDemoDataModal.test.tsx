/**
 * "Clear demo data": the stores to choose from arrive first with nothing ticked; ticking a store
 * (or a website, which ticks all of its stores) asks what clearing them would do, and Clear hands
 * the ticked stores and that list's token to the screen. A store another project claims is locked.
 * Every request is asserted by its payload, because the handler decides on those fields.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ClearDemoDataModal } from '@/features/data-installer/ui/components/ClearDemoDataModal';
import { previewLines } from '@/features/data-installer/ui/clearDemoDataWords';
import type { DemoDataCheck, WipeChoiceWebsite, WipePreview } from '@/types/demoDataWipe';

const mockRequest = webviewClient.request as jest.Mock;

const CLAIMED = "The store justrite_store (website justrite) is also JustRite's own store (project JustRite). Clear it from that project, if at all.";

const CHOICES: WipeChoiceWebsite[] = [
    { code: 'justrite', name: 'JustRite', stores: [{ code: 'justrite_store', name: 'JustRite Store', views: ['JustRite US'], ticked: false, claimedBy: CLAIMED }] },
    {
        code: 'bodea',
        name: 'Bodea',
        stores: [
            { code: 'bodea_store', name: 'Bodea Store', views: ['Bodea English'], ticked: false },
            { code: 'bodea_outlet', name: 'Bodea Outlet', views: ['Bodea Outlet English', 'Bodea Outlet French'], ticked: false },
        ],
    },
];

const named = (names: string[]) => ({ count: names.length, names });

const PREVIEW: WipePreview = {
    stores: [{ websiteCode: 'bodea', websiteName: 'Bodea', storeCode: 'bodea_store', storeName: 'Bodea Store' }],
    remove: { products: named(['BD-RACK', 'BD-CHAIR']), categories: named(['Racks']), customers: named(['bd.store@example.com']), cartRules: named([]) },
    takenOff: named(['BD-ALSO-ON-MAIN']),
    rulesTakenOff: named([]),
    orders: { cancel: named(['000000701']), refund: named(['000000702', '000000703']), leftOpen: named(['000000706']), returns: named(['R40']) },
    left: [{ kind: 'products', ...named(['BD-NO-CATEGORY']), why: "which demo they belong to can't be told" }],
    installed: { products: 1 },
    total: 9,
    token: 'tok-1',
    never: 'Never touched: what Demo Builder installed.',
};

function withStore(answer: (stores: unknown[]) => DemoDataCheck = (stores) => (stores.length ? { choices: CHOICES, preview: PREVIEW } : { choices: CHOICES })): void {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string, payload: { stores: unknown[] }) =>
        type === 'check-demo-data' ? { success: true, data: answer(payload.stores) } : { success: true, data: null },
    );
}

const checks = () => mockRequest.mock.calls.filter((c) => c[0] === 'check-demo-data').map((c) => c[1]);

async function openModal() {
    const onClear = jest.fn();
    const onClose = jest.fn();
    render(<ClearDemoDataModal onClose={onClose} onClear={onClear} />);
    await settle();
    return { onClear, onClose };
}

/** Tick, then let the check's pause pass and its answer land. */
async function tick(name: RegExp) {
    await press(screen.getByRole('checkbox', { name }));
    await act(async () => {
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    });
    await settle();
}

beforeEach(() => withStore());

it('asks for the stores alone first, with nothing ticked and nothing to clear', async () => {
    await openModal();

    expect(checks()).toEqual([{ stores: [] }]);
    expect(screen.getByText(/Tick a store to see what clearing it would do/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});

it("lists each store's views under its website, and locks a store another project claims, naming it", async () => {
    await openModal();

    expect(screen.getByText('bodea_outlet. Views: Bodea Outlet English, Bodea Outlet French')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /JustRite Store/ })).toBeDisabled();
    expect(screen.getByText(CLAIMED)).toBeInTheDocument();
});

it('asks about the ticked store, and lists what clearing it would do, orders included', async () => {
    await openModal();

    await tick(/Bodea Store/);

    expect(checks()[1]).toEqual({ stores: [{ websiteCode: 'bodea', storeCode: 'bodea_store' }] });
    expect(screen.getByText('2 to remove, 1 taken off the chosen websites')).toBeInTheDocument();
    expect(screen.getByText('1 to cancel, 2 to refund, 1 to leave open with a note, 1 return to close')).toBeInTheDocument();
    expect(screen.getByText("1 product: which demo they belong to can't be told")).toBeInTheDocument();
    expect(screen.getByText(/This can't be undone\./)).toBeInTheDocument();
});

it('lists the cart rules it would clear on their own line, with what is only taken off (step 11)', () => {
    const lines = previewLines({ ...PREVIEW, remove: { ...PREVIEW.remove, cartRules: named(['ZZ Ten Off']) }, rulesTakenOff: named(['ZZ Shared']) });

    expect(lines).toContainEqual({ label: 'Cart rules', value: '1 to remove, with their coupons, 1 taken off the chosen websites' });
    expect(previewLines(PREVIEW).some((l) => l.label === 'Cart rules')).toBe(false);
});

it('ticks every store of a website when the website is ticked', async () => {
    await openModal();

    await tick(/^Bodea bodea$/);

    expect(checks()[1]).toEqual({
        stores: [
            { websiteCode: 'bodea', storeCode: 'bodea_outlet' },
            { websiteCode: 'bodea', storeCode: 'bodea_store' },
        ],
    });
});

it('hands the ticked stores and the shown list’s token to the screen on Clear', async () => {
    const { onClear } = await openModal();
    await tick(/Bodea Store/);

    await press(screen.getByRole('button', { name: 'Clear 9 things' }));

    expect(onClear).toHaveBeenCalledWith([{ websiteCode: 'bodea', storeCode: 'bodea_store' }], 'tok-1');
});

it('offers no clearing when a ticked store is refused, and says why', async () => {
    withStore((stores) => (stores.length ? { choices: CHOICES, refused: 'The store bodea_store is also Bodea Demo\'s own store.' } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText("The store bodea_store is also Bodea Demo's own store.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});

it('says the stores could not be read when the first check is refused', async () => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: false, error: 'Sign in to Adobe first.' });

    await openModal();

    expect(screen.getByText("Couldn't read the stores")).toBeInTheDocument();
    expect(screen.getByText('Sign in to Adobe first.')).toBeInTheDocument();
});

it('lists the orders an ERP integration closes as their own line', async () => {
    const line = '2 orders are handled by the ERP integration (JustRite): they will be closed there, removed from its ERP, and the ERP refreshed.';
    const erp = { integration: 'JustRite', websites: ['bodea'], orders: named(['000000801', '000000802']), line };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview: { ...PREVIEW, erp } } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText(line)).toBeInTheDocument();
});

it('says why an ERP integration leaves its orders open, even with nothing else to clear', async () => {
    const line = '1 order handled by the ERP integration (JustRite) is left open: it must be updated first.';
    const erp = { integration: 'JustRite', websites: ['bodea'], orders: named(['000000801']), held: 'it must be updated first', line };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview: { ...PREVIEW, total: 0, erp } } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});
